import { formatClock } from './chicago-time'
import {
  CLOCK_LIVE_RANGE,
  DEFAULT_CLOCK,
  TAPE_IDS,
  askCentsFromMarket,
  defaultClocks,
  hydrateClock,
  latchDeskBoard,
  quoteHasClock,
  LIVE_TRAIL_MS,
  lastPrintFromLiveData,
  marketTradingActive,
  pointsFromLiveData,
  slimLivePoints,
  num,
  seriesForTape,
  seriesToTape,
  tapeAllowsLive,
  type TapeClock,
  type TapeId,
} from './tapes'
import { summarizeTapePath, type DeskPaths } from './analyst'
import { newsRssUrl, parseNewsRss, type DeskBriefsPayload, type ListedClock, type NewsItem } from './desk-brief'
import { mergeRaceTrail } from './race-path'
import type { DeskBoard, LivePrints, Point, Settled, TapeQuote } from './types'

const KALSHI = 'https://external-api.kalshi.com/trade-api/v2'
const QUOTE_FRESH_MS = 350
const ROLLOVER_FRESH_MS = 150
const LIST_ABORT = 2800
const LIST_RETRY = 3600
const TICKER_ABORT = 1500
const LIVE_ABORT = 1600
const PRINT_ABORT = 1800
const PRINT_FRESH_MS = 80
const LIST_LIMIT = 32
const NEAR_CLOSE_MS = 12_000

type Market = Record<string, unknown>

let lastBoard: DeskBoard | null = null
let lastBoardAt = 0
let lastClocksKey = ''
let lastPrints: LivePrints | null = null
let lastPrintsAt = 0
let lastPrintsKey = ''
let printsInflight: Promise<LivePrints> | null = null
let boardInflight: Promise<DeskBoard> | null = null
const settledCache: Record<string, { at: number; past: Settled[] }> = {}
let warming = false

function ua() {
  return { 'User-Agent': 'HUB-Prediction/1.0', Accept: 'application/json' }
}

async function fetchText(url: string, ms: number): Promise<string> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal, headers: ua() })
    if (!r.ok) throw new Error(`http ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(t)
  }
}

async function fetchJson<T>(url: string, ms: number): Promise<T> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal, headers: ua() })
    if (!r.ok) throw new Error(`http ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

function strikeOf(m: Market) {
  return num(m.floor_strike) ?? num(m.strike_price) ?? num(m.cap_strike)
}

function marketOpenAt(m: Market) {
  return Date.parse(String(m.open_time ?? ''))
}

function marketCloseAt(m: Market) {
  return Date.parse(String(m.close_time ?? ''))
}

function isLiveWindow(m: Market, now: number) {
  const open = marketOpenAt(m)
  const close = marketCloseAt(m)
  return Number.isFinite(open) && Number.isFinite(close) && open <= now && now < close
}

function isUpcomingWindow(m: Market, now: number) {
  const open = marketOpenAt(m)
  const close = marketCloseAt(m)
  return Number.isFinite(open) && Number.isFinite(close) && open > now && close > open
}

/** Soft FAIL picking a just-closed clock when the next run is already listed. */
export function pickOpen(markets: Market[], now: number, hintPx?: number | null) {
  const list = Array.isArray(markets) ? markets : []
  const live = list.filter((m) => isLiveWindow(m, now))
  const upcoming = list.filter((m) => isUpcomingWindow(m, now)).sort((a, b) => marketOpenAt(a) - marketOpenAt(b))
  const pool = live.length ? live : upcoming
  if (!pool.length) return null
  if (hintPx != null && Number.isFinite(hintPx) && pool.length > 1 && live.length) {
    pool.sort((a, b) => {
      const da = Math.abs((strikeOf(a) ?? hintPx) - hintPx)
      const db = Math.abs((strikeOf(b) ?? hintPx) - hintPx)
      return da - db
    })
    return pool[0] ?? null
  }
  if (live.length) {
    pool.sort((a, b) => marketCloseAt(a) - marketCloseAt(b))
    return pool[0] ?? null
  }
  return upcoming[0] ?? null
}

function unwrapMarket(payload: unknown, fallback: Market | null): Market | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    if (o.market && typeof o.market === 'object') return o.market as Market
    if (o.ticker || o.yes_ask != null || o.yes_ask_dollars != null || o.status != null) return o as Market
  }
  return fallback
}

function stillOpen(openAt: number, closeAt: number, now: number) {
  return openAt > 0 && closeAt > now && openAt <= now
}

function mergeMarkets(...lists: Market[][]) {
  const bag = new Map<string, Market>()
  for (const list of lists) {
    for (const m of list ?? []) {
      const ticker = String(m.ticker ?? '')
      if (ticker) bag.set(ticker, m)
    }
  }
  return [...bag.values()]
}

/** status=open count. CLOSED only when this is 0. Soft FAIL STALE painting CLOSED on an active 15m. */
export function countOpenSeriesMarkets(markets: Market[], now = Date.now()) {
  let n = 0
  for (const m of markets ?? []) {
    const status = String(m.status ?? '').toLowerCase()
    const close = marketCloseAt(m)
    const stillListed = !Number.isFinite(close) || close > now
    if (isLiveWindow(m, now)) n += 1
    else if ((status === 'open' || status === 'active') && stillListed) n += 1
  }
  return n
}

/** Open + unfiltered. Next 15m clocks are status=initialized and missing from status=open. */
async function listSeriesMarkets(series: string, limit: number): Promise<{ markets: Market[]; openMarkets: number }> {
  const openUrl = `${KALSHI}/markets?series_ticker=${series}&status=open&limit=${limit}`
  const allUrl = `${KALSHI}/markets?series_ticker=${series}&limit=${limit}`
  const [open, all] = await Promise.all([
    fetchJson<{ markets?: Market[] }>(openUrl, LIST_ABORT).catch(() => ({ markets: [] as Market[] })),
    fetchJson<{ markets?: Market[] }>(allUrl, LIST_ABORT).catch(() => ({ markets: [] as Market[] })),
  ])
  let merged = mergeMarkets(open.markets ?? [], all.markets ?? [])
  const now = Date.now()
  let openListed = open.markets ?? []
  if (!merged.some((m) => isLiveWindow(m, now) || isUpcomingWindow(m, now))) {
    const again = await fetchJson<{ markets?: Market[] }>(openUrl, LIST_RETRY).catch(() => ({ markets: [] as Market[] }))
    merged = mergeMarkets(merged, again.markets ?? [])
    openListed = mergeMarkets(openListed, again.markets ?? [])
  }
  return { markets: merged, openMarkets: countOpenSeriesMarkets(openListed.length ? openListed : merged, now) }
}

function listedWindow(m: Market | null, now: number) {
  return Boolean(m && (isLiveWindow(m, now) || isUpcomingWindow(m, now)))
}

function clocksKey(clocks: Record<TapeId, TapeClock>) {
  return TAPE_IDS.map((id) => clocks[id]).join(',')
}

async function loadTape(id: TapeId, now: number, clock: TapeClock): Promise<TapeQuote | null> {
  const series = seriesForTape(id, clock)
  const prev = lastBoard?.tapes[id] ?? null
  let listed: Market | null = null
  const sameSeries = prev?.series === series

  const prevLive = Boolean(sameSeries && prev?.ticker && stillOpen(prev.openAt, prev.closeAt, now))
  const nearClose = Boolean(prev?.closeAt && prev.closeAt - now <= NEAR_CLOSE_MS)
  const reuse = prevLive && !nearClose
  let openMarkets = sameSeries ? Number(prev?.openMarkets ?? (prevLive ? 1 : 0)) : 0
  if (!reuse) {
    const listedSeries = await listSeriesMarkets(series, clock === '1h' ? 48 : LIST_LIMIT)
    openMarkets = listedSeries.openMarkets
    listed = pickOpen(listedSeries.markets, now, sameSeries ? prev?.live ?? prev?.beat : null)
    if (!listed && openMarkets > 0) {
      listed = listedSeries.markets.find((m) => isLiveWindow(m, now)) ?? listedSeries.markets[0] ?? null
    }
  }

  const listedLive = listedWindow(listed, now)
  const ticker = String((listedLive && listed?.ticker) || (prevLive ? prev?.ticker : '') || '')
  const eventTicker = String(
    (listedLive && listed?.event_ticker) || (prevLive ? prev?.eventTicker : '') || '',
  )
  if (!ticker) {
    if (openMarkets > 0 && sameSeries && prev) return { ...prev, tradingActive: true, openMarkets }
    if (prevLive && prev) return { ...prev, openMarkets }
    return sameSeries && prev ? { ...prev, tradingActive: false, openMarkets: 0 } : null
  }

  const skipLive = reuse
  const [freshPayload, livePayload] = await Promise.all([
    fetchJson<unknown>(`${KALSHI}/markets/${encodeURIComponent(ticker)}`, TICKER_ABORT).catch(() => null),
    skipLive || !eventTicker
      ? Promise.resolve(null)
      : fetchJson<unknown>(
          `${KALSHI}/live_data/events/${encodeURIComponent(eventTicker)}?range=${CLOCK_LIVE_RANGE[clock]}`,
          LIVE_ABORT,
        ).catch(() => null),
  ])

  const m = unwrapMarket(freshPayload, listed)
  if (!m) {
    if (openMarkets > 0 && prev) return { ...prev, tradingActive: true, openMarkets }
    if (prevLive && prev) return { ...prev, openMarkets }
    return sameSeries && prev ? { ...prev, tradingActive: false, openMarkets: 0 } : null
  }

  const sameTicker = Boolean(prev && prev.ticker === ticker)
  const yesAsk = askCentsFromMarket(m, true) || (sameTicker && prev ? prev.yesAsk : 0)
  const noAsk = askCentsFromMarket(m, false) || (sameTicker && prev ? prev.noAsk : 0)
  const beat = num(m.floor_strike) ?? num(m.strike_price) ?? (sameTicker && prev ? prev.beat : 0)
  const openAt = Date.parse(String(m.open_time ?? '')) || (sameTicker && prev ? prev.openAt : 0)
  const closeAt = Date.parse(String(m.close_time ?? '')) || (sameTicker && prev ? prev.closeAt : 0)

  let live: number | null = null
  let liveSource: TapeQuote['liveSource'] = null
  let incoming: Point[] = []
  if (livePayload) {
    const print = lastPrintFromLiveData(livePayload)
    if (print) {
      live = print.px
      liveSource = print.source
    }
    incoming = pointsFromLiveData(livePayload)
  }

  if (live == null && prev?.ticker === ticker && prev.live != null) {
    live = prev.live
    liveSource = prev.liveSource
  }
  const points = mergeRaceTrail(prev?.ticker === ticker ? prev.points : [], incoming, live, now)

  return {
    id,
    series,
    ticker,
    eventTicker,
    yesAsk,
    noAsk,
    beat,
    live,
    liveSource,
    points,
    openAt,
    closeAt,
    fetchedAt: now,
    clock: closeAt ? formatClock(closeAt) : '—',
    clockId: clock,
    tradingActive: openMarkets > 0 && marketTradingActive(m, now),
    openMarkets,
  }
}

export function peekDeskBoard(): DeskBoard | null {
  return lastBoard
}

export function resetDeskBoardForTests() {
  lastBoard = null
  lastBoardAt = 0
  lastClocksKey = ''
  lastPrints = null
  lastPrintsAt = 0
  lastPrintsKey = ''
  printsInflight = null
  boardInflight = null
}

export async function loadLivePrints(
  events: Partial<Record<TapeId, string>> = {},
  range = CLOCK_LIVE_RANGE['5m'],
): Promise<LivePrints> {
  const now = Date.now()
  const key = `${TAPE_IDS.map((id) => `${id}:${events[id] ?? ''}`).join('|')}#${range}`
  if (lastPrints && lastPrintsKey === key && now - lastPrintsAt < PRINT_FRESH_MS) return lastPrints
  if (printsInflight && lastPrintsKey === key) return printsInflight

  lastPrintsKey = key
  const job = (async () => {
    const rows = await Promise.all(
      TAPE_IDS.map(async (id) => {
        const eventTicker = events[id]
        if (!eventTicker) return null
        const livePayload = await fetchJson<unknown>(
          `${KALSHI}/live_data/events/${encodeURIComponent(eventTicker)}?range=${range}`,
          PRINT_ABORT,
        ).catch(() => null)
        if (!livePayload) {
          const prev = lastPrints?.tapes[id]
          return prev?.eventTicker === eventTicker ? prev : null
        }
        const print = lastPrintFromLiveData(livePayload)
        const prev = lastPrints?.tapes[id]
        const incoming = slimLivePoints(pointsFromLiveData(livePayload), Date.now(), LIVE_TRAIL_MS)
        const live = print?.px ?? prev?.live ?? incoming[incoming.length - 1]?.px ?? null
        const liveSource = print?.source ?? prev?.liveSource ?? (incoming.length ? 'kalshi-timeseries' : null)
        const points = slimLivePoints(
          mergeRaceTrail(prev?.eventTicker === eventTicker ? prev.points : [], incoming, live, Date.now()),
        )
        if (
          prev?.eventTicker === eventTicker &&
          live === prev.live &&
          liveSource === prev.liveSource &&
          points.length === prev.points.length &&
          points[points.length - 1]?.t === prev.points[prev.points.length - 1]?.t &&
          points[points.length - 1]?.px === prev.points[prev.points.length - 1]?.px
        ) {
          return prev
        }
        return { eventTicker, live, liveSource, points, fetchedAt: Date.now() }
      }),
    )
    const tapes = {} as LivePrints['tapes']
    TAPE_IDS.forEach((id, i) => {
      tapes[id] = rows[i] ?? null
    })
    const next: LivePrints = { tapes, fetchedAt: Date.now() }
    lastPrints = next
    lastPrintsAt = Date.now()
    return next
  })()
  printsInflight = job

  try {
    return await job
  } finally {
    if (printsInflight === job) printsInflight = null
  }
}

function boardNeedsRollover(board: DeskBoard | null, now: number) {
  if (!board) return true
  return TAPE_IDS.some((id) => {
    if (!tapeAllowsLive(id)) return false
    const q = board.tapes[id]
    if (!q) return true
    if (q.tradingActive === false) return true
    if (!stillOpen(q.openAt, q.closeAt, now)) return true
    return q.closeAt - now <= NEAR_CLOSE_MS
  })
}

export async function loadDeskBoard(clocks: Record<TapeId, TapeClock> = defaultClocks()): Promise<DeskBoard> {
  const now = Date.now()
  const key = clocksKey(clocks)
  const rolling = boardNeedsRollover(lastBoard, now)
  const freshMs = rolling ? ROLLOVER_FRESH_MS : QUOTE_FRESH_MS
  if (!rolling && lastBoard && lastClocksKey === key && now - lastBoardAt < freshMs) return lastBoard
  if (!rolling && boardInflight && lastClocksKey === key) return boardInflight

  const job = (async () => {
    const rows = await Promise.all(
      TAPE_IDS.map((id) => loadTape(id, now, hydrateClock(clocks[id])).catch(() => lastBoard?.tapes[id] ?? null)),
    )
    const tapes = {} as DeskBoard['tapes']
    TAPE_IDS.forEach((id, i) => {
      const want = seriesForTape(id, clocks[id])
      const row = rows[i]
      tapes[id] = row?.series === want ? row : lastBoard?.tapes[id]?.series === want ? lastBoard.tapes[id] : null
    })
    const raw: DeskBoard = { tapes, fetchedAt: Date.now() }
    let latched = latchDeskBoard(raw, lastBoard) ?? raw
    for (const id of TAPE_IDS) {
      if (quoteHasClock(latched.tapes[id])) continue
      const again = await loadTape(id, Date.now(), hydrateClock(clocks[id])).catch(() => latched.tapes[id] ?? null)
      if (quoteHasClock(again)) tapes[id] = again
    }
    latched = latchDeskBoard({ tapes, fetchedAt: Date.now() }, lastBoard) ?? latched
    lastBoard = latched
    lastBoardAt = boardNeedsRollover(latched, Date.now()) ? 0 : Date.now()
    lastClocksKey = key
    return lastBoard
  })()
  boardInflight = job
  try {
    return await job
  } finally {
    if (boardInflight === job) boardInflight = null
  }
}

function settledFromMarkets(markets: Market[]): Settled[] {
  const out: Settled[] = []
  for (const m of markets ?? []) {
    const result = String(m.result ?? '').toLowerCase()
    if (result !== 'yes' && result !== 'no') continue
    out.push({
      ticker: String(m.ticker ?? ''),
      closeAt: Date.parse(String(m.close_time ?? '')) || 0,
      result: result === 'yes' ? 'up' : 'down',
    })
  }
  out.sort((a, b) => b.closeAt - a.closeAt)
  const floor = Date.now() - 24 * 60 * 60 * 1000
  return out.filter((s) => s.closeAt >= floor).slice(0, 100)
}

export async function loadSettledTape(id: TapeId, clock: TapeClock = DEFAULT_CLOCK): Promise<Settled[]> {
  const now = Date.now()
  const series = seriesForTape(id, clock)
  const key = `${id}:${hydrateClock(clock)}`
  const hit = settledCache[key]
  if (hit && now - hit.at < 20_000) return hit.past
  try {
    const j = await fetchJson<{ markets?: Market[] }>(
      `${KALSHI}/markets?series_ticker=${series}&status=settled&limit=100`,
      2200,
    )
    const past = settledFromMarkets(j.markets ?? [])
    settledCache[key] = { at: now, past }
    return past
  } catch {
    return hit?.past ?? []
  }
}

export function applySettlementsToHits(
  hits: { tapes: Record<TapeId, { w: number; l: number }>; asOf: number },
  tickets: Array<{ tape: TapeId; ticker: string; side: 'up' | 'down'; orderId: string }>,
  settled: Settled[],
) {
  const byTicker = new Map(settled.map((s) => [s.ticker, s]))
  const next = {
    asOf: Date.now(),
    tapes: Object.fromEntries(TAPE_IDS.map((id) => [id, { ...hits.tapes[id] }])) as typeof hits.tapes,
  }
  const seen = new Set<string>()
  for (const t of tickets) {
    if (!t.orderId || seen.has(t.ticker)) continue
    const s = byTicker.get(t.ticker)
    if (!s) continue
    seen.add(t.ticker)
    const win = (t.side === 'up' && s.result === 'up') || (t.side === 'down' && s.result === 'down')
    if (win) next.tapes[t.tape].w += 1
    else next.tapes[t.tape].l += 1
  }
  return next
}

export function classifySettlementTicker(ticker: string): TapeId | null {
  return seriesToTape(ticker)
}

function pointsFromCandles(payload: unknown): Point[] {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const list = Array.isArray(root?.candlesticks)
    ? (root!.candlesticks as Record<string, unknown>[])
    : Array.isArray(root?.candles)
      ? (root!.candles as Record<string, unknown>[])
      : []
  const out: Point[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const price = row.price && typeof row.price === 'object' ? (row.price as Record<string, unknown>) : row
    const px = num(price.close) ?? num(price.close_dollars) ?? num(price.v) ?? num(row.close)
    const rawT = num(row.end_period_ts) ?? num(row.end_ts) ?? num(row.t) ?? num(row.ts)
    if (px == null || rawT == null || px <= 1) continue
    const t = rawT < 1e12 ? rawT * 1000 : rawT
    out.push({ t, px })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** 24h / 48h index path for the analyst. Soft FAIL Live POST. */
export async function loadTapePaths(events: Partial<Record<TapeId, string>> = {}): Promise<DeskPaths> {
  const now = Date.now()
  const start = Math.floor((now - 48 * 3_600_000) / 1000)
  const end = Math.floor(now / 1000)
  const rows = await Promise.all(
    TAPE_IDS.map(async (id) => {
      const eventTicker = events[id]
      const series = seriesForTape(id, '1h')
      const [live1d, live1w, candles] = await Promise.all([
        eventTicker
          ? fetchJson<unknown>(
              `${KALSHI}/live_data/events/${encodeURIComponent(eventTicker)}?range=1d`,
              LIVE_ABORT,
            ).catch(() => null)
          : Promise.resolve(null),
        eventTicker
          ? fetchJson<unknown>(
              `${KALSHI}/live_data/events/${encodeURIComponent(eventTicker)}?range=1w`,
              LIVE_ABORT,
            ).catch(() => null)
          : Promise.resolve(null),
        fetchJson<unknown>(
          `${KALSHI}/series/${encodeURIComponent(series)}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=60`,
          LIVE_ABORT,
        ).catch(() => null),
      ])
      const bag = new Map<number, number>()
      for (const p of [
        ...pointsFromLiveData(live1w),
        ...pointsFromLiveData(live1d),
        ...pointsFromCandles(candles),
      ]) {
        if (p.px > 1) bag.set(p.t, p.px)
      }
      const points = [...bag.entries()].map(([t, px]) => ({ t, px })).sort((a, b) => a.t - b.t)
      const current = lastPrintFromLiveData(live1d)?.px ?? lastPrintFromLiveData(live1w)?.px ?? points[points.length - 1]?.px ?? null
      return summarizeTapePath(id, points, current, now)
    }),
  )
  const tapes = {} as DeskPaths['tapes']
  TAPE_IDS.forEach((id, i) => {
    tapes[id] = rows[i]
  })
  return { tapes, fetchedAt: now }
}

export async function loadUpcomingRuns(
  clocks: Record<TapeId, TapeClock> = defaultClocks(),
): Promise<Record<TapeId, ListedClock[]>> {
  const now = Date.now()
  const rows = await Promise.all(
    TAPE_IDS.map(async (id) => {
      const series = seriesForTape(id, hydrateClock(clocks[id]))
      const listedSeries = await listSeriesMarkets(series, 32)
      return listedSeries.markets
        .map((m) => ({
          ticker: String(m.ticker ?? ''),
          openAt: marketOpenAt(m),
          closeAt: marketCloseAt(m),
          beat: strikeOf(m) ?? 0,
        }))
        .filter((m) => m.ticker && Number.isFinite(m.openAt) && Number.isFinite(m.closeAt) && m.closeAt > now - 60_000)
    }),
  )
  const out = {} as Record<TapeId, ListedClock[]>
  TAPE_IDS.forEach((id, i) => {
    out[id] = rows[i]
  })
  return out
}

let newsCache: { at: number; tapes: Record<TapeId, NewsItem[]> } | null = null

export async function loadDeskNews(): Promise<Record<TapeId, NewsItem[]>> {
  const now = Date.now()
  if (newsCache && now - newsCache.at < 8 * 60_000) return newsCache.tapes
  const rows = await Promise.all(
    TAPE_IDS.map(async (id) => {
      const xml = await fetchText(newsRssUrl(id), 1600).catch(() => '')
      return parseNewsRss(xml, now)
    }),
  )
  const tapes = {} as Record<TapeId, NewsItem[]>
  TAPE_IDS.forEach((id, i) => {
    tapes[id] = rows[i]
  })
  newsCache = { at: now, tapes }
  return tapes
}

export async function loadDeskBriefs(clocks: Record<TapeId, TapeClock> = defaultClocks()): Promise<DeskBriefsPayload> {
  const [upcoming, news] = await Promise.all([loadUpcomingRuns(clocks), loadDeskNews()])
  return { upcoming, news, fetchedAt: Date.now() }
}

export function startWarm() {
  if (warming) return
  warming = true
  void loadDeskBoard().catch(() => {})
}
