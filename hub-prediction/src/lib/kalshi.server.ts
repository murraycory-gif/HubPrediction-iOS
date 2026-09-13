import { align15, dayKey, formatClock, slotsForDay, startOfChicagoDay, weekdayName } from './chicago-time'
import { slopeFromPoints, slotPreview, slotTheory, vsOpen } from './forecast'
import { mergeSettled, payloadFromQuote } from './rebase-kalshi'
import type { Board, Candle, Dash, DashRow, Point, Quote, Settled } from './types'

const KALSHI = 'https://external-api.kalshi.com/trade-api/v2'
const SERIES = 'KXBTC15M'
const QUOTE_FRESH_MS = 1200
const BRTI_TTL = 400
const CLOSE_TTL = 8000
const SETTLED_TTL = 20_000
const PRIOR_TTL = 30_000
const QUOTE_ABORT = 900
const BOARD_ABORT = 1600
const WEEK = 7 * 86_400_000

type Market = Record<string, unknown>

let lastQuote: Quote | null = null
let lastQuoteAt = 0
let lastDash: Dash | null = null
let lastDashAt = 0
let closeCache: { at: number; points: Point[] } | null = null
let settledCache: { at: number; past: Settled[] } | null = null
let priorCache: { at: number; prior: Point[] } | null = null
let brtiCache: { at: number; px: number } | null = null
let brtiBuildId: string | null = null
let statusCache: { at: number; exchangeActive: boolean; tradingActive: boolean } | null = null
let warming = false
const STATUS_TTL = 8000
const CRYPTO_INDEX = 2

function ua() {
  return { 'User-Agent': 'HUB-Prediction/1.0', Accept: 'application/json' }
}

async function fetchText(url: string, ms: number) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'HUB-Prediction/1.0' } })
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

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.length) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function askCents(m: Market, yes: boolean) {
  const dollars = num(yes ? m.yes_ask_dollars : m.no_ask_dollars)
  if (dollars != null) return Math.round(dollars * 100)
  const cents = num(yes ? m.yes_ask : m.no_ask)
  return cents ?? 0
}

function pickOpen(markets: Market[], now: number) {
  const list = Array.isArray(markets) ? markets : []
  const live = list.filter((m) => {
    const open = Date.parse(String(m.open_time ?? ''))
    const close = Date.parse(String(m.close_time ?? ''))
    return Number.isFinite(open) && Number.isFinite(close) && open <= now && now < close
  })
  const pool = live.length ? live : list
  pool.sort((a, b) => Date.parse(String(a.close_time ?? '')) - Date.parse(String(b.close_time ?? '')))
  return pool[0] ?? null
}

function marketToQuote(m: Market, live: number, source: Quote['liveSource'], now: number): Quote {
  const openAt = Date.parse(String(m.open_time ?? '')) || align15(now)
  const closeAt = Date.parse(String(m.close_time ?? '')) || openAt + 15 * 60_000
  return payloadFromQuote({
    ticker: String(m.ticker ?? ''),
    yesAsk: askCents(m, true),
    noAsk: askCents(m, false),
    strike: num(m.floor_strike) ?? num(m.strike_price) ?? live,
    live,
    liveSource: source,
    openAt,
    closeAt,
    fetchedAt: now,
    points: [],
    past: [],
  })
}

async function fetchBrtiJson(ms: number): Promise<number | null> {
  if (brtiCache && Date.now() - brtiCache.at < BRTI_TTL) return brtiCache.px
  if (!brtiBuildId) return brtiCache?.px ?? null
  try {
    const j = await fetchJson<{ pageProps?: { indexSummary?: { value?: number } } }>(
      `https://www.cfbenchmarks.com/_next/data/${brtiBuildId}/data/indices/BRTI.json`,
      ms,
    )
    const val = j?.pageProps?.indexSummary?.value
    if (typeof val === 'number' && val > 1000) {
      brtiCache = { at: Date.now(), px: val }
      return val
    }
  } catch {
    /* use cache / coinbase */
  }
  return brtiCache?.px ?? null
}

async function warmupBrti() {
  try {
    const html = await fetchText('https://www.cfbenchmarks.com/data/indices/BRTI', 2500)
    const id = html.match(/"buildId":"([^"]+)"/)?.[1]
    if (id) brtiBuildId = id
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/)
    if (nd) {
      const val = JSON.parse(nd[1])?.props?.pageProps?.indexSummary?.value
      if (typeof val === 'number' && val > 1000) brtiCache = { at: Date.now(), px: val }
    }
  } catch {
    /* coinbase fallback */
  }
}

async function fetchCoinbase(ms: number) {
  const j = await fetchJson<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot', ms)
  const px = num(j?.data?.amount)
  if (px == null) throw new Error('coinbase')
  return px
}

type StatusPayload = {
  exchange_active?: boolean
  trading_active?: boolean
  exchange_index_statuses?: Array<{
    exchange_index?: number
    exchange_active?: boolean
    trading_active?: boolean
  }>
}

export async function warmupStatus() {
  const now = Date.now()
  if (statusCache && now - statusCache.at < STATUS_TTL) return statusCache
  try {
    const j = await fetchJson<StatusPayload>(`${KALSHI}/exchange/status`, 400)
    const crypto = (j.exchange_index_statuses ?? []).find((s) => s.exchange_index === CRYPTO_INDEX)
    statusCache = {
      at: now,
      exchangeActive: !!(crypto?.exchange_active ?? j.exchange_active),
      tradingActive: !!(crypto?.trading_active ?? j.trading_active),
    }
    return statusCache
  } catch {
    return statusCache
  }
}

async function livePrice(budgetMs: number): Promise<{ px: number; source: Quote['liveSource'] }> {
  if (brtiCache && Date.now() - brtiCache.at < BRTI_TTL) {
    return { px: brtiCache.px, source: 'brti' }
  }
  const brti = fetchBrtiJson(Math.min(budgetMs, 450)).catch(() => null)
  const b = await brti
  if (b) return { px: b, source: 'brti' }
  return { px: await fetchCoinbase(Math.min(budgetMs, 450)), source: 'coinbase' }
}

function candlePoints(raw: unknown, shift = 0): Point[] {
  return candleOHLC(raw, shift).map((c) => ({ t: c.t, px: c.close }))
}

function candleOHLC(raw: unknown, shift = 0): Candle[] {
  if (!Array.isArray(raw)) return []
  const pts: Candle[] = []
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue
    const t = Number(row[0]) * 1000 + shift
    const low = Number(row[1])
    const high = Number(row[2])
    const open = Number(row[3])
    const close = Number(row[4])
    if (Number.isFinite(t) && Number.isFinite(close) && close > 1000) {
      pts.push({ t, open, high, low, close })
    }
  }
  pts.sort((a, b) => a.t - b.t)
  return pts
}

async function fetchCandles(startMs: number, endMs: number, budget: number, gran = 60) {
  const url =
    `https://api.exchange.coinbase.com/products/BTC-USD/candles` +
    `?granularity=${gran}&start=${new Date(startMs).toISOString()}&end=${new Date(endMs).toISOString()}`
  const raw = await fetchJson<unknown>(url, budget)
  return candlePoints(raw)
}

async function fetchOHLC(startMs: number, endMs: number, budget: number, gran = 60) {
  const url =
    `https://api.exchange.coinbase.com/products/BTC-USD/candles` +
    `?granularity=${gran}&start=${new Date(startMs).toISOString()}&end=${new Date(endMs).toISOString()}`
  const raw = await fetchJson<unknown>(url, budget)
  return candleOHLC(raw)
}

export async function warmupCloses() {
  const now = Date.now()
  if (closeCache && now - closeCache.at < CLOSE_TTL) return closeCache.points
  try {
    const points = await fetchCandles(now - 90 * 60_000, now + 5_000, 1400)
    closeCache = { at: now, points }
    return points
  } catch {
    return closeCache?.points ?? []
  }
}

async function warmupPrior() {
  const now = Date.now()
  if (priorCache && now - priorCache.at < PRIOR_TTL) return priorCache.prior
  try {
    const prior = await fetchCandles(now - WEEK - 90 * 60_000, now - WEEK + 5_000, 1400)
    const shifted = prior.map((p) => ({ t: p.t + WEEK, px: p.px }))
    priorCache = { at: now, prior: shifted }
    return shifted
  } catch {
    return priorCache?.prior ?? []
  }
}

function settledFromMarkets(markets: Market[]): Settled[] {
  const list = Array.isArray(markets) ? markets : []
  const out: Settled[] = []
  for (const m of list) {
    const result = String(m.result ?? '').toLowerCase()
    if (result !== 'yes' && result !== 'no') continue
    out.push({
      ticker: String(m.ticker ?? ''),
      closeAt: Date.parse(String(m.close_time ?? '')) || 0,
      result: result === 'yes' ? 'up' : 'down',
    })
  }
  out.sort((a, b) => b.closeAt - a.closeAt)
  return out.slice(0, 24)
}

export async function warmupSettled() {
  const now = Date.now()
  if (settledCache && now - settledCache.at < SETTLED_TTL) return settledCache.past
  try {
    const j = await fetchJson<{ markets?: Market[] }>(
      `${KALSHI}/markets?series_ticker=${SERIES}&status=settled&limit=24`,
      1400,
    )
    const past = settledFromMarkets(j.markets ?? [])
    settledCache = { at: now, past }
    if (lastQuote) lastQuote = mergeSettled(lastQuote, past)
    return past
  } catch {
    return settledCache?.past ?? []
  }
}

function attachCaches(quote: Quote): Quote {
  const points = closeCache?.points ?? quote.points ?? []
  const past = settledCache?.past ?? quote.past ?? []
  const prior = priorCache?.prior ?? quote.prior ?? []
  return {
    ...quote,
    points: Array.isArray(points) ? points : [],
    past: Array.isArray(past) ? past : [],
    prior: Array.isArray(prior) ? prior : [],
    exchangeActive: statusCache?.exchangeActive ?? quote.exchangeActive,
    tradingActive: statusCache?.tradingActive ?? quote.tradingActive,
  }
}

export function peekLastQuoteMemory(): Quote | null {
  if (!lastQuote) return null
  return attachCaches(lastQuote)
}

export function peekLastDashMemory(): Dash | null {
  return lastDash
}

export async function loadKalshiQuote(): Promise<Quote> {
  const now = Date.now()
  if (lastQuote && now - lastQuoteAt < QUOTE_FRESH_MS) {
    return attachCaches(lastQuote)
  }

  void warmupCloses()
  void warmupSettled()
  void warmupBrti()
  void warmupStatus()

  try {
    if (statusCache && statusCache.tradingActive === false && lastQuote) {
      return attachCaches({
        ...lastQuote,
        tradingActive: false,
        exchangeActive: statusCache.exchangeActive,
      })
    }
    const marketsP = fetchJson<{ markets?: Market[] }>(
      `${KALSHI}/markets?series_ticker=${SERIES}&status=open&limit=4`,
      QUOTE_ABORT,
    )
    const liveP = livePrice(QUOTE_ABORT)
    const [markets, live] = await Promise.all([marketsP, liveP])
    const m = pickOpen(markets.markets ?? [], now)
    if (!m) {
      if (lastQuote) return attachCaches(lastQuote)
      throw new Error('no open market')
    }
    const quote = attachCaches(marketToQuote(m, live.px, live.source, now))
    lastQuote = quote
    lastQuoteAt = now
    return quote
  } catch {
    if (lastQuote) return attachCaches(lastQuote)
    throw new Error('quote unavailable')
  }
}

export async function loadKalshi(): Promise<Board> {
  const now = Date.now()
  const quote = await loadKalshiQuote().catch(() => peekLastQuoteMemory())

  const openP = fetchJson<{ markets?: Market[] }>(
    `${KALSHI}/markets?series_ticker=${SERIES}&status=open&limit=4`,
    BOARD_ABORT,
  ).catch(() => ({ markets: [] as Market[] }))
  const settledP = warmupSettled()
  const closesP = warmupCloses()
  const priorP = warmupPrior()

  const [open, past, points, prior] = await Promise.all([openP, settledP, closesP, priorP])
  const m = pickOpen(open.markets ?? [], now)
  const live = quote?.live ?? points[points.length - 1]?.px ?? 0
  const source = quote?.liveSource ?? 'coinbase'
  const base = m ? marketToQuote(m, live, source, now) : payloadFromQuote(quote)
  const board: Board = {
    ...base,
    live: quote?.live || base.live,
    liveSource: quote?.liveSource ?? base.liveSource,
    yesAsk: quote?.yesAsk || base.yesAsk,
    noAsk: quote?.noAsk || base.noAsk,
    points: Array.isArray(points) ? points : [],
    prior: Array.isArray(prior) ? prior : [],
    past: Array.isArray(past) ? past : [],
    fetchedAt: now,
  }
  lastQuote = attachCaches(board)
  lastQuoteAt = now
  return board
}

function nearest(points: Point[], t: number) {
  const list = Array.isArray(points) ? points : []
  if (!list.length) return null
  let best = list[0]
  let d = Math.abs(best.t - t)
  for (const p of list) {
    const nd = Math.abs(p.t - t)
    if (nd < d) {
      best = p
      d = nd
    }
  }
  return d < 12 * 60_000 ? best.px : null
}

function nearestCandle(candles: Candle[], t: number) {
  const list = Array.isArray(candles) ? candles : []
  if (!list.length) return null
  let best = list[0]
  let d = Math.abs(best.t - t)
  for (const c of list) {
    const nd = Math.abs(c.t - t)
    if (nd < d) {
      best = c
      d = nd
    }
  }
  return d < 12 * 60_000 ? best : null
}

export async function loadDashboard(day?: string): Promise<Dash> {
  const now = Date.now()
  try {
    return await buildDashboard(day, now)
  } catch (err) {
    console.error('buildDashboard', err)
    const start = startOfChicagoDay(now)
    return {
      day: dayKey(start),
      weekday: weekdayName(start),
      upcoming: [],
      elapsed: [],
    }
  }
}

async function buildDashboard(day: string | undefined, now: number): Promise<Dash> {
  const quote = peekLastQuoteMemory()
  const todayStart = startOfChicagoDay(now)
  let dayStart = todayStart
  if (day) {
    const [y, m, d] = day.split('-').map(Number)
    if (y && m && d) {
      const guess = Date.UTC(y, m - 1, d, 12, 0, 0)
      dayStart = startOfChicagoDay(guess)
    }
  }
  const isToday = dayKey(dayStart) === dayKey(now)
  const lookNow = isToday ? now : dayStart + 12 * 3_600_000

  const [thisWeek1m, thisWeek15, lastWeekRaw] = await Promise.all([
    warmupCloses(),
    fetchCandles(dayStart - 30 * 60_000, dayStart + 86_400_000, 1600, 900).catch(() => []),
    fetchOHLC(dayStart - WEEK - 30 * 60_000, dayStart - WEEK + 86_400_000, 1600, 900).catch(() => []),
  ])
  const thisWeek = [...(thisWeek15 ?? []), ...(thisWeek1m ?? [])]
  const lastWeekOHLC = (lastWeekRaw ?? []).map((c) => ({ ...c, t: c.t + WEEK }))
  const lastWeek = lastWeekOHLC.map((c) => ({ t: c.t, px: c.close }))

  const live = quote?.live ?? thisWeek[thisWeek.length - 1]?.px ?? lastWeek[lastWeek.length - 1]?.px ?? 0
  const slope = slopeFromPoints(thisWeek.length ? thisWeek : quote?.points, lookNow)
  const nowSlot = align15(lookNow)
  const lwNow = nearest(lastWeek, nowSlot) ?? live
  const slots = slotsForDay(dayStart)
  const lwOpen = nearest(lastWeek, slots[0] ?? nowSlot) ?? lastWeek[0]?.px ?? null
  const upcoming: DashRow[] = []
  const elapsed: DashRow[] = []

  for (const t of slots) {
    const actual = t <= lookNow ? nearest(thisWeek, t + 14 * 60_000) ?? nearest(thisWeek, t) : null
    const bar = nearestCandle(lastWeekOHLC, t)
    const lw = bar?.close ?? nearest(lastWeek, t)
    const theory = slotTheory({ t, nowSlot, lookNow, live, slope, lastWeek: lw, lastWeekNow: lwNow, actual })
    const preview = slotPreview({ t, nowSlot, lookNow, live, slope, actual })
    const row: DashRow = {
      t,
      clock: formatClock(t),
      theory,
      actual,
      preview,
      lastWeek: lw,
      variance: actual != null && theory != null ? actual - theory : null,
      vsOpen: vsOpen(lw, lwOpen),
      high: bar?.high ?? null,
      low: bar?.low ?? null,
      isNow: isToday && t === nowSlot,
    }
    if (isToday && t >= nowSlot) upcoming.push(row)
    else elapsed.push(row)
  }

  if (!isToday) {
    const other: Dash = {
      day: dayKey(dayStart),
      weekday: weekdayName(dayStart),
      upcoming: slots.map((t) => {
        const bar = nearestCandle(lastWeekOHLC, t)
        const lw = bar?.close ?? nearest(lastWeek, t)
        return {
          t,
          clock: formatClock(t),
          theory: lw,
          actual: null,
          preview: null,
          lastWeek: lw,
          variance: null,
          vsOpen: vsOpen(lw, lwOpen),
          high: bar?.high ?? null,
          low: bar?.low ?? null,
          isNow: false,
        }
      }),
      elapsed: [],
    }
    lastDash = other
    lastDashAt = now
    return other
  }

  const dash: Dash = {
    day: dayKey(dayStart),
    weekday: weekdayName(dayStart),
    upcoming,
    elapsed,
  }
  lastDash = dash
  lastDashAt = now
  return dash
}

export function startWarm() {
  if (warming) return
  warming = true
  void warmupBrti()
  void warmupCloses()
  void warmupPrior()
  void warmupSettled()
  void warmupStatus()
  void loadKalshiQuote().catch(() => {})
  void loadDashboard().catch(() => {})
}
