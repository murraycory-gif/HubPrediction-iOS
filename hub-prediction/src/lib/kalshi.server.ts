import { formatClock } from './chicago-time'
import {
  TAPE_IDS,
  TAPE_META,
  askCentsFromMarket,
  lastPrintFromLiveData,
  marketTradingActive,
  num,
  seriesToTape,
  type TapeId,
} from './tapes'
import type { DeskBoard, Point, Settled, TapeQuote } from './types'

const KALSHI = 'https://external-api.kalshi.com/trade-api/v2'
const QUOTE_FRESH_MS = 350
const LIST_ABORT = 1200
const TICKER_ABORT = 900
const LIVE_ABORT = 1200

type Market = Record<string, unknown>

let lastBoard: DeskBoard | null = null
let lastBoardAt = 0
const settledCache: Partial<Record<TapeId, { at: number; past: Settled[] }>> = {}
let warming = false

function ua() {
  return { 'User-Agent': 'HUB-Prediction/1.0', Accept: 'application/json' }
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

function pointsFromLive(payload: unknown): Point[] {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const live = (root?.live_data && typeof root.live_data === 'object' ? root.live_data : root) as Record<string, unknown> | null
  const details = (live?.details && typeof live.details === 'object' ? live.details : live) as Record<string, unknown> | null
  if (!details) return []
  const out: Point[] = []
  const ts = details.timeseries
  if (Array.isArray(ts)) {
    for (const row of ts) {
      if (!row || typeof row !== 'object') continue
      const t = num((row as { t?: unknown }).t)
      const px = num((row as { v?: unknown; px?: unknown }).v ?? (row as { px?: unknown }).px)
      if (t != null && px != null && px > 0) out.push({ t, px })
    }
  }
  const sticks = details.candlesticks
  const groups = sticks && typeof sticks === 'object' ? (sticks as Record<string, unknown>) : null
  const series = Array.isArray(groups?.['1M']) ? groups!['1M'] : Array.isArray(groups?.['1m']) ? groups!['1m'] : []
  if (Array.isArray(series)) {
    for (const row of series) {
      if (!row || typeof row !== 'object') continue
      const t = num((row as { open_ts_ms?: unknown; t?: unknown }).open_ts_ms ?? (row as { t?: unknown }).t)
      const px = num((row as { close?: unknown }).close)
      if (t != null && px != null && px > 0) out.push({ t, px })
    }
  }
  out.sort((a, b) => a.t - b.t)
  return out.slice(-240)
}

async function loadTape(id: TapeId, now: number): Promise<TapeQuote | null> {
  const meta = TAPE_META[id]
  const prev = lastBoard?.tapes[id] ?? null
  let listed: Market | null = null

  const reuse = Boolean(prev?.ticker && stillOpen(prev.openAt, prev.closeAt, now))
  if (!reuse) {
    const markets = await fetchJson<{ markets?: Market[] }>(
      `${KALSHI}/markets?series_ticker=${meta.series}&status=open&limit=4`,
      LIST_ABORT,
    ).catch(() => ({ markets: [] as Market[] }))
    listed = pickOpen(markets.markets ?? [], now)
  }

  const ticker = String(listed?.ticker ?? prev?.ticker ?? '')
  const eventTicker = String(listed?.event_ticker ?? prev?.eventTicker ?? '')
  if (!ticker) return prev

  const [freshPayload, livePayload] = await Promise.all([
    fetchJson<unknown>(`${KALSHI}/markets/${encodeURIComponent(ticker)}`, TICKER_ABORT).catch(() => null),
    eventTicker
      ? fetchJson<unknown>(
          `${KALSHI}/live_data/events/${encodeURIComponent(eventTicker)}?range=15min`,
          LIVE_ABORT,
        ).catch(() => null)
      : Promise.resolve(null),
  ])

  const m = unwrapMarket(freshPayload, listed)
  if (!m) return prev

  const yesAsk = askCentsFromMarket(m, true) || (prev?.ticker === ticker ? prev.yesAsk : 0)
  const noAsk = askCentsFromMarket(m, false) || (prev?.ticker === ticker ? prev.noAsk : 0)
  const beat = num(m.floor_strike) ?? num(m.strike_price) ?? prev?.beat ?? 0
  const openAt = Date.parse(String(m.open_time ?? '')) || prev?.openAt || 0
  const closeAt = Date.parse(String(m.close_time ?? '')) || prev?.closeAt || 0

  let live: number | null = null
  let liveSource: TapeQuote['liveSource'] = null
  let points: Point[] = []
  if (livePayload) {
    const print = lastPrintFromLiveData(livePayload)
    if (print) {
      live = print.px
      liveSource = print.source
    }
    points = pointsFromLive(livePayload)
  }

  if (live == null && prev?.ticker === ticker && prev.live != null) {
    live = prev.live
    liveSource = prev.liveSource
    points = prev.points?.length ? prev.points : points
  }

  return {
    id,
    series: meta.series,
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
    tradingActive: marketTradingActive(m, now),
  }
}

export function peekDeskBoard(): DeskBoard | null {
  return lastBoard
}

export function resetDeskBoardForTests() {
  lastBoard = null
  lastBoardAt = 0
}

export async function loadDeskBoard(): Promise<DeskBoard> {
  const now = Date.now()
  if (lastBoard && now - lastBoardAt < QUOTE_FRESH_MS) return lastBoard

  const rows = await Promise.all(TAPE_IDS.map((id) => loadTape(id, now).catch(() => lastBoard?.tapes[id] ?? null)))
  const tapes = {} as DeskBoard['tapes']
  TAPE_IDS.forEach((id, i) => {
    tapes[id] = rows[i] ?? lastBoard?.tapes[id] ?? null
  })
  lastBoard = { tapes, fetchedAt: now }
  lastBoardAt = now
  return lastBoard
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

export async function loadSettledTape(id: TapeId): Promise<Settled[]> {
  const now = Date.now()
  const hit = settledCache[id]
  if (hit && now - hit.at < 20_000) return hit.past
  try {
    const j = await fetchJson<{ markets?: Market[] }>(
      `${KALSHI}/markets?series_ticker=${TAPE_META[id].series}&status=settled&limit=100`,
      2200,
    )
    const past = settledFromMarkets(j.markets ?? [])
    settledCache[id] = { at: now, past }
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
    tapes: {
      btc: { ...hits.tapes.btc },
      ng: { ...hits.tapes.ng },
      cu: { ...hits.tapes.cu },
      gld: { ...hits.tapes.gld },
    },
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

export function startWarm() {
  if (warming) return
  warming = true
  void loadDeskBoard().catch(() => {})
}
