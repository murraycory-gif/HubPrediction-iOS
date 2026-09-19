import { deskStorage } from './desk-storage'
import { pushHostDesk } from './desk-persist'
import { mergeRaceTrail, pointTime } from './race-path'
import { cashFromBalancePayload, ticketCost } from './size-cash'
import type { DeskBoard, LivePrints, TapeQuote } from './types'

export const TAPE_IDS = ['btc', 'ng', 'cu', 'gld'] as const
export type TapeId = (typeof TAPE_IDS)[number]

export type TapeRecipe = {
  contracts: number
  botOn: boolean
  liveOn: boolean
  armFromMin: number
  armToMin: number
  through: number
  centLo: number
  centHi: number
}

export const TAPE_CLOCKS = ['5m', '15m', '1h'] as const
export type TapeClock = (typeof TAPE_CLOCKS)[number]
export const DEFAULT_CLOCK: TapeClock = '15m'

export const CLOCK_LABELS: Record<TapeClock, string> = {
  '5m': '5 min',
  '15m': '15 min',
  '1h': '1 hr',
}

export const CLOCK_MS: Record<TapeClock, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}

export const CLOCK_LIVE_RANGE: Record<TapeClock, string> = {
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
}

export const CHART_RANGES = ['live', '5m', '15m', '1h'] as const
export type ChartRange = (typeof CHART_RANGES)[number]
export const DEFAULT_CHART: ChartRange = 'live'
export const CHART_LABELS: Record<ChartRange, string> = {
  live: 'LIVE',
  '5m': '5M',
  '15m': '15M',
  '1h': '1H',
}
export const CHART_MS: Record<ChartRange, number> = {
  live: 15 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}

/** LIVE follows the selected clock — Soft FAIL a 90s stub with one NOW dot. */
export function chartWindowMs(chart: ChartRange, clock: TapeClock = DEFAULT_CLOCK) {
  if (hydrateChartRange(chart) === 'live') return CLOCK_MS[hydrateClock(clock)]
  return CHART_MS[hydrateChartRange(chart)]
}

export { raceWindowStart } from './race-path'

export const CLOCK_CALLOUT: Record<TapeClock, { kicker: string; title: string }> = {
  '5m': { kicker: '5 MIN', title: '5 min' },
  '15m': { kicker: '15 MIN', title: '15 min' },
  '1h': { kicker: '1 HR', title: '1 hr' },
}

export function isChartRange(v: unknown): v is ChartRange {
  return typeof v === 'string' && (CHART_RANGES as readonly string[]).includes(v)
}

export function hydrateChartRange(raw: unknown): ChartRange {
  if (raw === '10m' || raw === '20m') return '15m'
  return isChartRange(raw) ? raw : DEFAULT_CHART
}

export function defaultChartRanges(): Record<TapeId, ChartRange> {
  return { btc: DEFAULT_CHART, ng: DEFAULT_CHART, cu: DEFAULT_CHART, gld: DEFAULT_CHART }
}

export function hydrateChartRanges(raw: unknown): Record<TapeId, ChartRange> {
  const o = raw && typeof raw === 'object' ? (raw as Partial<Record<TapeId, unknown>>) : {}
  const next = defaultChartRanges()
  for (const id of TAPE_IDS) next[id] = hydrateChartRange(o[id])
  return next
}

/** Kalshi series per tape clock. 15m is gold. 5m/1h use the listed Kalshi ticker when it exists. */
export const TAPE_SERIES: Record<TapeId, Record<TapeClock, string>> = {
  btc: { '5m': 'KXBTC5M', '15m': 'KXBTC15M', '1h': 'KXBTCD' },
  ng: { '5m': 'KXNATGAS5M', '15m': 'KXNATGAS15M', '1h': 'KXNATGAS1H' },
  cu: { '5m': 'KXCOPPER5M', '15m': 'KXCOPPER15M', '1h': 'KXCOPPER1H' },
  gld: { '5m': 'KXGOLD5M', '15m': 'KXGOLD15M', '1h': 'KXGOLDH' },
}

export function isTapeClock(v: unknown): v is TapeClock {
  return typeof v === 'string' && (TAPE_CLOCKS as readonly string[]).includes(v)
}

export function hydrateClock(raw: unknown): TapeClock {
  return isTapeClock(raw) ? raw : DEFAULT_CLOCK
}

export function defaultClocks(): Record<TapeId, TapeClock> {
  return { btc: DEFAULT_CLOCK, ng: DEFAULT_CLOCK, cu: DEFAULT_CLOCK, gld: DEFAULT_CLOCK }
}

export function hydrateClocks(raw: unknown): Record<TapeId, TapeClock> {
  const o = raw && typeof raw === 'object' ? (raw as Partial<Record<TapeId, unknown>>) : {}
  const next = defaultClocks()
  for (const id of TAPE_IDS) next[id] = hydrateClock(o[id])
  return next
}

export function seriesForTape(id: TapeId, clock: TapeClock = DEFAULT_CLOCK) {
  return TAPE_SERIES[id][hydrateClock(clock)]
}

/** Structure board only. Prints ride LIVE_PRINT_MS. Fast near close so the next clock latches. Soft FAIL 1Hz. */
export const LIVE_PRINT_MS = 100
export const LIVE_TRAIL_MS = 60 * 60_000
export const LIVE_TRAIL_DOTS = 480
export const BOARD_STRUCTURE_MS = 400
export const BOARD_ROLLOVER_MS = 350
export const BOARD_CLOSED_MS = 200

export function slimLivePoints(
  points: { t: number; px: number }[] | undefined,
  now = Date.now(),
  keepMs = LIVE_TRAIL_MS,
  maxDots = LIVE_TRAIL_DOTS,
) {
  const from = now - keepMs
  const cut: { t: number; px: number }[] = []
  for (const p of points ?? []) {
    if (p.t >= from && Number.isFinite(p.px) && p.px > 0) cut.push(p)
  }
  return cut.length <= maxDots ? cut : cut.slice(-maxDots)
}

export function boardPollMs(
  board:
    | { tapes: Record<TapeId, { tradingActive?: boolean; closeAt?: number } | null> }
    | null
    | undefined,
  now = Date.now(),
) {
  if (!board) return 400
  for (const id of TAPE_IDS) {
    const q = board.tapes[id]
    if (!q) return BOARD_CLOSED_MS
    if (q.tradingActive === false) return BOARD_CLOSED_MS
    if (Number(q.closeAt) > 0 && Number(q.closeAt) <= now) return BOARD_CLOSED_MS
    if (Number(q.closeAt) > 0 && Number(q.closeAt) - now <= 8000) return BOARD_ROLLOVER_MS
  }
  return BOARD_STRUCTURE_MS
}

/** Wait until the soonest close + 50ms, or a short nudge when a tape already sat. */
export function nextBoardRolloverWait(
  board:
    | { tapes: Record<TapeId, { tradingActive?: boolean; closeAt?: number } | null> }
    | null
    | undefined,
  now = Date.now(),
) {
  if (!board) return BOARD_CLOSED_MS
  let next = Infinity
  let dead = false
  for (const id of TAPE_IDS) {
    const q = board.tapes[id]
    if (!q) {
      dead = true
      continue
    }
    const closeAt = Number(q.closeAt)
    if (q.tradingActive === false || (closeAt > 0 && closeAt <= now)) {
      dead = true
      continue
    }
    if (closeAt > now && closeAt < next) next = closeAt
  }
  if (dead) return BOARD_CLOSED_MS
  if (Number.isFinite(next) && next < Infinity) return Math.max(0, next - now + 50)
  return null
}

export function liveRangeFromCharts(
  charts?: Partial<Record<TapeId, ChartRange>> | null,
  clocks?: Partial<Record<TapeId, TapeClock>> | null,
) {
  for (const id of TAPE_IDS) {
    const chart = hydrateChartRange(charts?.[id])
    const clock = hydrateClock(clocks?.[id])
    if (chart === '1h' || clock === '1h') return CLOCK_LIVE_RANGE['1h']
  }
  return CLOCK_LIVE_RANGE['15m']
}

export function boardEventTickers(
  board: { tapes: Record<TapeId, { eventTicker?: string } | null> } | null | undefined,
): Partial<Record<TapeId, string>> {
  const out: Partial<Record<TapeId, string>> = {}
  if (!board) return out
  for (const id of TAPE_IDS) {
    const ev = board.tapes[id]?.eventTicker
    if (ev) out[id] = ev
  }
  return out
}

export function quoteHasClock(q: TapeQuote | null | undefined) {
  return Boolean(q && q.ticker && (Number(q.beat) > 0 || (q.live != null && q.live > 0) || Number(q.closeAt) > 0))
}

/** Open clock only. Soft FAIL holding a finished run as if it were live. */
export function quoteIsLiveClock(q: TapeQuote | null | undefined, now = Date.now()) {
  if (!quoteHasClock(q) || !q) return false
  if (q.tradingActive === false) return false
  if (Number(q.closeAt) > 0 && Number(q.closeAt) <= now) return false
  return true
}

export const LIVE_NOW_SLACK = 2
export const LIVE_ASK_SLACK = 1
export const LIVE_FRESH_MS = 30_000

function lastTrailPx(points: TapeQuote['points'] | undefined) {
  const pts = points ?? []
  for (let i = pts.length - 1; i >= 0; i--) {
    const px = pts[i]?.px
    if (Number.isFinite(px) && (px as number) > 0) return px as number
  }
  return null
}

/** Soft FAIL a lone NOW-dot as a live series. */
export function chartHasContinuousSeries(points: TapeQuote['points'] | undefined) {
  const times: number[] = []
  for (const p of points ?? []) {
    const t = pointTime(p.t)
    if (t == null || !Number.isFinite(p.px) || p.px <= 0) continue
    times.push(t)
  }
  if (times.length < 3) return false
  times.sort((a, b) => a - b)
  return times[times.length - 1]! - times[0]! >= 4000
}

/** Same-second Kalshi clock. Soft FAIL Live POST on stale / expired latch / lone-dot. */
export function trueLiveGate(opts: {
  quote: TapeQuote | null | undefined
  kalshiLive?: number | null
  kalshiYesAsk?: number | null
  kalshiNoAsk?: number | null
  now?: number
}) {
  const now = opts.now ?? Date.now()
  const q = opts.quote
  if (!quoteIsLiveClock(q, now) || !q) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (now - (q.fetchedAt || 0) > LIVE_FRESH_MS) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  const shown = q.live
  const kalshi = opts.kalshiLive ?? lastTrailPx(q.points) ?? shown
  if (shown == null || !Number.isFinite(shown) || shown <= 0 || kalshi == null || !Number.isFinite(kalshi) || kalshi <= 0) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (Math.abs(shown - kalshi) > LIVE_NOW_SLACK) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (!Number.isFinite(q.yesAsk) || !Number.isFinite(q.noAsk) || q.yesAsk < 1 || q.yesAsk > 99 || q.noAsk < 1 || q.noAsk > 99) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (
    opts.kalshiYesAsk != null &&
    Number.isFinite(opts.kalshiYesAsk) &&
    Math.abs(q.yesAsk - opts.kalshiYesAsk) > LIVE_ASK_SLACK
  ) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (
    opts.kalshiNoAsk != null &&
    Number.isFinite(opts.kalshiNoAsk) &&
    Math.abs(q.noAsk - opts.kalshiNoAsk) > LIVE_ASK_SLACK
  ) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  if (!chartHasContinuousSeries(q.points)) {
    return { ok: false as const, stale: true, reason: 'STALE — paper only' }
  }
  return { ok: true as const, stale: false, reason: '' }
}

export function expireClosedQuote<T extends TapeQuote | null | undefined>(q: T, now = Date.now()): T {
  if (!q || quoteIsLiveClock(q, now) || q.tradingActive === false) return q
  return { ...q, tradingActive: false }
}

export function expireClosedBoard(board: DeskBoard, now = Date.now()): DeskBoard {
  const tapes = { ...board.tapes }
  let changed = false
  for (const id of TAPE_IDS) {
    const next = expireClosedQuote(tapes[id], now)
    if (next !== tapes[id]) {
      tapes[id] = next
      changed = true
    }
  }
  return changed ? { ...board, tapes } : board
}

/** Hold only an OPEN clock across a hole. A closed run never blocks the next ticker. */
export function latchDeskBoard(
  incoming: DeskBoard | null | undefined,
  prev: DeskBoard | null | undefined,
  now = Date.now(),
): DeskBoard | null {
  if (!incoming) return prev ? expireClosedBoard(prev, now) : null
  if (!prev) return expireClosedBoard(incoming, now)
  const tapes = { ...incoming.tapes }
  let changed = false
  for (const id of TAPE_IDS) {
    const next = tapes[id]
    const hold = prev.tapes[id]
    const nextLive = quoteIsLiveClock(next, now)
    const holdLive = quoteIsLiveClock(hold, now)
    if (nextLive) {
      if (hold && hold.ticker === next!.ticker && (next!.live == null || !next!.points.length)) {
        tapes[id] = {
          ...next!,
          live: next!.live ?? hold.live,
          liveSource: next!.liveSource ?? hold.liveSource,
          points: next!.points.length ? next!.points : hold.points,
        }
        changed = true
      }
      continue
    }
    if (next && quoteHasClock(next) && next.ticker && next.ticker !== hold?.ticker) {
      tapes[id] = expireClosedQuote(next, now)
      changed = true
      continue
    }
    if (holdLive && !quoteHasClock(next)) {
      tapes[id] = hold
      changed = true
      continue
    }
    if (hold && !holdLive) {
      tapes[id] = next && quoteHasClock(next) ? expireClosedQuote(next, now) : expireClosedQuote(hold, now)
      changed = true
    } else if (next && quoteHasClock(next) && !nextLive) {
      tapes[id] = expireClosedQuote(next, now)
      changed = true
    }
  }
  return expireClosedBoard(
    { ...incoming, tapes, fetchedAt: Math.max(incoming.fetchedAt || 0, prev.fetchedAt || 0) },
    now,
  )
}

/** Keep last good live / asks / path on a live clock. Soft FAIL empty then snap. */
function latchLivePrints(incoming: TapeQuote, held?: TapeQuote | null): TapeQuote {
  if (!held || held.ticker !== incoming.ticker) return incoming
  return {
    ...incoming,
    live: incoming.live != null && incoming.live > 0 ? incoming.live : held.live,
    liveSource: incoming.liveSource ?? held.liveSource,
    yesAsk: incoming.yesAsk || held.yesAsk,
    noAsk: incoming.noAsk || held.noAsk,
    beat: incoming.beat || held.beat,
    points: incoming.points?.length ? incoming.points : held.points,
    openAt: incoming.openAt || held.openAt,
    closeAt: incoming.closeAt || held.closeAt,
  }
}

/** Tape row hold. Soft FAIL showing a dead clock after the run ends. */
export function holdTapeQuote(
  incoming: TapeQuote | null | undefined,
  held: TapeQuote | null | undefined,
  now = Date.now(),
): TapeQuote | null {
  if (quoteIsLiveClock(incoming, now)) return latchLivePrints(incoming, held)
  if (incoming && incoming.ticker && incoming.ticker !== held?.ticker) return expireClosedQuote(incoming, now) ?? null
  if (quoteIsLiveClock(held, now) && !quoteHasClock(incoming)) return held ?? null
  if (incoming && quoteHasClock(incoming)) return expireClosedQuote(incoming, now) ?? null
  if (held) return expireClosedQuote(held, now) ?? null
  return incoming ?? held ?? null
}

export const BOARD_HOLD_KEY = 'hub.desk.board.hold.v1'

export function loadHeldBoard(): DeskBoard | null {
  const ls = deskStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(BOARD_HOLD_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as DeskBoard
    if (!o?.tapes) return null
    const tapes = {} as DeskBoard['tapes']
    for (const id of TAPE_IDS) tapes[id] = quoteHasClock(o.tapes[id]) ? o.tapes[id] : null
    if (!TAPE_IDS.some((id) => tapes[id])) return null
    return expireClosedBoard({ tapes, fetchedAt: Number(o.fetchedAt) || 0 })
  } catch {
    return null
  }
}

export function saveHeldBoard(board: DeskBoard | null | undefined) {
  const ls = deskStorage()
  if (!ls || !board) return board ?? null
  try {
    if (!TAPE_IDS.some((id) => quoteHasClock(board.tapes[id]))) return board
    ls.setItem(BOARD_HOLD_KEY, JSON.stringify(board))
  } catch {
    /* quota */
  }
  return board
}

export function holdLiveEvents(
  incoming: Partial<Record<TapeId, string>>,
  prev: Partial<Record<TapeId, string>>,
): Partial<Record<TapeId, string>> {
  const next = { ...prev }
  let any = false
  for (const id of TAPE_IDS) {
    if (incoming[id]) {
      next[id] = incoming[id]
      any = true
    }
  }
  return any || Object.values(next).some(Boolean) ? next : incoming
}

/** Overlay Kalshi last prints onto the slower structure board. Soft FAIL swap tickers. */
export function mergeLiveOntoBoard(
  board: DeskBoard | null | undefined,
  prints: LivePrints | null | undefined,
): DeskBoard | null {
  if (!board) return null
  if (!prints) return board
  const tapes = { ...board.tapes }
  let changed = false
  for (const id of TAPE_IDS) {
    const q = tapes[id]
    const p = prints.tapes[id]
    if (!q || !p || !p.eventTicker || p.eventTicker !== q.eventTicker) continue
    if (!quoteIsLiveClock(q, p.fetchedAt || Date.now())) continue
    const live = p.live ?? q.live
    const liveSource = p.liveSource ?? q.liveSource
    if (live === q.live && liveSource === q.liveSource && !p.points.length) continue
    tapes[id] = {
      ...q,
      live,
      liveSource,
      points: p.points.length
        ? slimLivePoints(mergeRaceTrail(slimLivePoints(q.points, p.fetchedAt), p.points, live, p.fetchedAt), p.fetchedAt)
        : q.points,
      fetchedAt: Math.max(q.fetchedAt, p.fetchedAt),
    }
    changed = true
  }
  if (!changed) return board
  return { ...board, tapes, fetchedAt: Math.max(board.fetchedAt, prints.fetchedAt) }
}

export function clockFromTicker(ticker: string): TapeClock | '' {
  const s = ticker.toUpperCase()
  if (s.includes('15M')) return '15m'
  if (s.includes('5M')) return '5m'
  if (s.includes('1H') || s.endsWith('H') || s.includes('BTCD') || s.includes('GOLDH')) return '1h'
  return ''
}

export function windowMsForClock(clock: string) {
  const id = isTapeClock(clock) ? clock : clockFromTicker(clock)
  return id ? CLOCK_MS[id] : 0
}

export type DeskSettings = {
  tapes: Record<TapeId, TapeRecipe>
  betsFilter: TapeId[]
  clocks: Record<TapeId, TapeClock>
  charts: Record<TapeId, ChartRange>
  /** User chose Bot / Live cash. Soft FAIL wiping those on refresh. */
  togglesPicked?: boolean
  savedAt?: number
}

export const TAPE_META: Record<
  TapeId,
  { id: TapeId; label: string; short: string; series: string; decimals: number; pulseName: string }
> = {
  btc: { id: 'btc', label: 'BTC', short: 'BTC', series: 'KXBTC15M', decimals: 2, pulseName: 'BITCOIN 15 MINUTE' },
  ng: { id: 'ng', label: 'NG', short: 'NG', series: 'KXNATGAS15M', decimals: 5, pulseName: 'NATURAL GAS 15 MINUTE' },
  cu: { id: 'cu', label: 'CU', short: 'CU', series: 'KXCOPPER15M', decimals: 5, pulseName: 'COPPER 15 MINUTE' },
  gld: { id: 'gld', label: 'GLD', short: 'GLD', series: 'KXGOLD15M', decimals: 2, pulseName: 'GOLD 15 MINUTE' },
}

/** Final locked Grok Build recipes — Soft FAIL inventing new ones. */
export const GOLD_RECIPES: Record<TapeId, TapeRecipe> = {
  btc: { contracts: 1, botOn: true, liveOn: false, armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 },
  ng: { contracts: 1, botOn: true, liveOn: false, armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  cu: { contracts: 1, botOn: true, liveOn: false, armFromMin: 9, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  gld: { contracts: 1, botOn: true, liveOn: false, armFromMin: 10, armToMin: 3, through: 2, centLo: 34, centHi: 89 },
}

export const DEFAULT_SETTINGS: DeskSettings = {
  tapes: {
    btc: { ...GOLD_RECIPES.btc },
    ng: { ...GOLD_RECIPES.ng },
    cu: { ...GOLD_RECIPES.cu },
    gld: { ...GOLD_RECIPES.gld },
  },
  betsFilter: allBetsFilter(),
  clocks: defaultClocks(),
  charts: defaultChartRanges(),
}

export const SETTINGS_KEY = 'hub.desk.settings.v1'
export const BETS_FILTER_KEY = 'hub.desk.betsFilter.v1'

export function allBetsFilter(): TapeId[] {
  return [...TAPE_IDS]
}

export function isAllBetsFilter(ids: readonly TapeId[]) {
  return TAPE_IDS.every((id) => ids.includes(id))
}

export function hydrateBetsFilter(raw: unknown): TapeId[] {
  if (!Array.isArray(raw)) return allBetsFilter()
  const ids = [...new Set(raw.filter((v): v is TapeId => typeof v === 'string' && isTapeId(v)))]
  return ids.length ? ids : allBetsFilter()
}

/** All stays visible. Empty selection Soft FAIL — snap back to All. Last tape stays on. */
export function nextBetsFilter(current: readonly TapeId[], chip: 'all' | TapeId): TapeId[] {
  if (chip === 'all') return allBetsFilter()
  if (isAllBetsFilter(current)) return [chip]
  if (current.includes(chip)) {
    const next = current.filter((id) => id !== chip)
    return next.length ? next : [chip]
  }
  return [...current, chip]
}
export const TICKETS_KEY = 'hub.desk.tickets.v1'
export const HITS_KEY = 'hub.desk.hits.v1'
export const CASH_KEY = 'hub.desk.cash.v1'
export const KEY_ID = 'hub.kalshi.keyId'
export const KEY_PEM = 'hub.kalshi.pem'

export function isTapeId(v: string): v is TapeId {
  return (TAPE_IDS as readonly string[]).includes(v)
}

export function clampContracts(n: number) {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(99, Math.round(n)))
}

function clampNum(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Accepted analyst recs persist. Wild values clamp. Gold stays the factory default. */
export function clampTapeRecipe(id: TapeId, partial: Partial<TapeRecipe> | undefined, gold: TapeRecipe = GOLD_RECIPES[id]): TapeRecipe {
  const armFrom = clampNum(Number(partial?.armFromMin ?? gold.armFromMin), 1, 14)
  let armTo = clampNum(Number(partial?.armToMin ?? gold.armToMin), 0.2, 12)
  if (armTo >= armFrom) armTo = Math.max(0.2, Math.round((armFrom - 0.2) * 100) / 100)
  const thru = Number(partial?.through ?? gold.through)
  const through = clampNum(Number.isFinite(thru) ? thru : gold.through, gold.through * 0.25, gold.through * 4)
  const minLo = id === 'btc' ? 69 : 20
  let centLo = Math.round(clampNum(Number(partial?.centLo ?? gold.centLo), minLo, 90))
  let centHi = Math.round(clampNum(Number(partial?.centHi ?? gold.centHi), centLo + 1, 95))
  if (centHi <= centLo) centHi = Math.min(95, centLo + 1)
  return {
    contracts: clampContracts(Number(partial?.contracts ?? gold.contracts)),
    botOn: partial?.botOn === true,
    liveOn: partial?.liveOn === true,
    armFromMin: Math.round(armFrom * 100) / 100,
    armToMin: Math.round(armTo * 100) / 100,
    through: through,
    centLo,
    centHi,
  }
}

function recipeFrom(partial: Partial<TapeRecipe> | undefined, gold: TapeRecipe, id: TapeId): TapeRecipe {
  const next = clampTapeRecipe(id, partial, gold)
  next.botOn = true
  next.liveOn = false
  return next
}

/** Bots default ON. Live cash boots OFF unless stored true. User Bot / Live cash choices persist. Soft FAIL live-cash ON by default. */
export function hydrateSettings(raw: unknown): DeskSettings {
  const o = raw && typeof raw === 'object' ? (raw as Partial<DeskSettings> & { tapes?: Partial<Record<TapeId, Partial<TapeRecipe>>> }) : {}
  const picked = o.togglesPicked === true
  const tapes = {} as Record<TapeId, TapeRecipe>
  for (const id of TAPE_IDS) {
    const gold = GOLD_RECIPES[id]
    const stored = o.tapes?.[id]
    const next = recipeFrom(stored, gold, id)
    if (stored) {
      if (typeof stored.botOn === 'boolean') next.botOn = stored.botOn === true
      if (typeof stored.liveOn === 'boolean') next.liveOn = stored.liveOn === true
      if (stored.contracts != null) next.contracts = clampContracts(Number(stored.contracts))
    }
    tapes[id] = next
  }
  return {
    tapes,
    betsFilter: hydrateBetsFilter((o as { betsFilter?: unknown }).betsFilter),
    clocks: hydrateClocks((o as { clocks?: unknown }).clocks),
    charts: hydrateChartRanges((o as { charts?: unknown }).charts),
    togglesPicked: picked,
    savedAt: Number((o as { savedAt?: unknown }).savedAt) || undefined,
  }
}

export function loadSettings(): DeskSettings {
  const empty = { ...hydrateSettings(null), togglesPicked: true }
  const ls = deskStorage()
  if (!ls) return empty
  try {
    const raw = ls.getItem(SETTINGS_KEY)
    if (!raw) return empty
    const next = hydrateSettings(JSON.parse(raw))
    if (next.togglesPicked === true) return next
    return saveSettings({ ...next, togglesPicked: true })
  } catch {
    return empty
  }
}

export function saveSettings(settings: DeskSettings) {
  const next = hydrateSettings({ ...settings, savedAt: Date.now(), togglesPicked: true })
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  pushHostDesk({ settings: next })
  return next
}

export function patchTape(settings: DeskSettings, id: TapeId, patch: Partial<TapeRecipe>): DeskSettings {
  const picked = settings.togglesPicked === true || 'botOn' in patch || 'liveOn' in patch
  return saveSettings({
    ...settings,
    togglesPicked: picked,
    tapes: { ...settings.tapes, [id]: { ...settings.tapes[id], ...patch } },
  })
}

export function setTapeClock(settings: DeskSettings, id: TapeId, clock: TapeClock): DeskSettings {
  return saveSettings({
    ...settings,
    clocks: { ...hydrateClocks(settings.clocks), [id]: hydrateClock(clock) },
  })
}

export function setTapeChart(settings: DeskSettings, id: TapeId, chart: ChartRange): DeskSettings {
  return saveSettings({
    ...settings,
    charts: { ...hydrateChartRanges(settings.charts), [id]: hydrateChartRange(chart) },
  })
}

export function applyBetsFilter(settings: DeskSettings, chip: 'all' | TapeId): DeskSettings {
  const next = saveSettings({ ...settings, betsFilter: nextBetsFilter(settings.betsFilter, chip) })
  const ls = deskStorage()
  if (ls) {
    try {
      ls.setItem(BETS_FILTER_KEY, JSON.stringify(next.betsFilter))
    } catch {
      /* quota */
    }
  }
  return next
}

/** KILL uses this. Soft FAIL leaving bots armed after KILL. */
export function disarmAllBots(settings: DeskSettings): DeskSettings {
  const tapes = { ...settings.tapes }
  for (const id of TAPE_IDS) {
    tapes[id] = { ...tapes[id], botOn: false }
  }
  return saveSettings({ ...settings, togglesPicked: true, tapes })
}

export function remainingMinutes(closeAt: number, now = Date.now()) {
  if (!Number.isFinite(closeAt) || closeAt <= 0) return null
  return (closeAt - now) / 60_000
}

export function inArmWindow(recipe: TapeRecipe, closeAt: number, now = Date.now()) {
  const left = remainingMinutes(closeAt, now)
  if (left == null) return false
  const lo = Math.min(recipe.armFromMin, recipe.armToMin)
  const hi = Math.max(recipe.armFromMin, recipe.armToMin)
  return left >= lo && left <= hi
}

export function askInBand(askCents: number, recipe: TapeRecipe) {
  if (!Number.isFinite(askCents)) return false
  const lo = Math.min(recipe.centLo, recipe.centHi)
  const hi = Math.max(recipe.centLo, recipe.centHi)
  return askCents >= lo && askCents <= hi
}

export type Lean = 'up' | 'down' | 'sit'

export function tapeLean(opts: {
  id: TapeId
  live: number | null
  beat: number
  recipe: TapeRecipe
}): Lean {
  const live = opts.live
  const beat = opts.beat
  if (live == null || !Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) return 'sit'
  const gap = live - beat
  const through = Math.abs(opts.recipe.through)
  if (opts.id === 'gld' && Math.abs(gap) < through) return 'sit'
  if (gap >= through) return 'up'
  if (gap <= -through) return 'down'
  return 'sit'
}

export function tabIsOpen() {
  if (typeof document === 'undefined') return true
  return document.hidden === false && document.visibilityState === 'visible'
}

/** Tape bot + tape live cash. Soft FAIL master liveBets. Bot ON + Live cash ON posts. */
export function cashGates(settings: DeskSettings, tape: TapeId) {
  const bot = settings.tapes[tape].botOn === true
  const liveCash = settings.tapes[tape].liveOn === true
  return { bot, liveCash, ok: bot && liveCash }
}

/** Server + client Kalshi POST. Soft FAIL master liveBets. */
export function livePlaceGate(opts: { botOn?: boolean; liveOn?: boolean; hasKeys?: boolean }) {
  if (opts.botOn !== true) return { ok: false as const, reason: 'Kalshi POST needs Bot ON' }
  if (opts.liveOn !== true) return { ok: false as const, reason: 'Kalshi POST needs Live cash ON' }
  if (!opts.hasKeys) return { ok: false as const, reason: 'Kalshi host keys missing on Windows' }
  return { ok: true as const }
}

/** Client Bot + Live cash ON posts even if host recipe is still factory OFF. Soft FAIL host-lag swallow. Soft FAIL master liveBets. */
export function hostLivePlaceGate(opts: {
  settings?: unknown
  tape?: string
  clientBotOn?: boolean
  clientLiveOn?: boolean
  hasKeys?: boolean
}) {
  if (!opts.tape || !isTapeId(opts.tape)) return { ok: false as const, reason: 'Kalshi POST needs a tape' }
  const recipe = hydrateSettings(opts.settings).tapes[opts.tape]
  return livePlaceGate({
    botOn: opts.clientBotOn === true || recipe.botOn === true,
    liveOn: opts.clientLiveOn === true || recipe.liveOn === true,
    hasKeys: opts.hasKeys,
  })
}

export type SendClaim = { at: number; tries: number; filled?: string; pending?: boolean }

/** One in-flight POST per ticker. Soft FAIL 4 CU ghosts. IOC miss can retry after release, cap 4. */
export function claimSend(map: Record<string, SendClaim>, key: string, now = Date.now()): 'send' | 'skip' {
  const c = map[key]
  if (c?.filled) return 'skip'
  if (c?.pending) return 'skip'
  if (c && c.tries >= 4) return 'skip'
  if (c && now - c.at >= 8000 && !c.pending) delete map[key]
  const prev = map[key]
  const tries = (prev?.tries ?? 0) + 1
  if (tries > 4) {
    delete map[key]
    return 'skip'
  }
  map[key] = { at: now, tries, pending: true }
  return 'send'
}

export function markFilled(map: Record<string, SendClaim>, key: string, orderId: string) {
  map[key] = { at: Date.now(), tries: 4, filled: orderId, pending: true }
}

export function releaseClaim(map: Record<string, SendClaim>, key: string) {
  const c = map[key]
  if (!c || c.filled) return
  map[key] = { at: Date.now(), tries: c.tries }
}

export type DeskTicket = {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  orderId: string
  contracts: number
  beat: number
  filledAt: number
  ask?: number
}

export function isRealOrderId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  const s = id.trim()
  if (s.length < 8) return false
  if (/^(arm|armed|arming|paper|local|fake|pending|wait)/i.test(s)) return false
  return true
}

/** Local paper fill. Soft FAIL Live POST. Id must not start with paper/arm. */
export function makePaperTicket(input: {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  contracts: number
  beat: number
  ask?: number
}): DeskTicket | null {
  const orderId = `deskfill-${input.tape}-${Math.random().toString(36).slice(2, 10)}`
  return makeTicket({ ...input, orderId })
}

/** Soft FAIL ARMING as a fill. Soft FAIL ticket without a real Kalshi order id. */
export function makeTicket(input: {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  orderId: unknown
  contracts: number
  beat: number
  filledAt?: number
  ask?: number
}): DeskTicket | null {
  if (!isRealOrderId(input.orderId)) return null
  if (input.side !== 'up' && input.side !== 'down') return null
  if (!input.ticker) return null
  const ask = Number(input.ask)
  return {
    tape: input.tape,
    ticker: input.ticker,
    side: input.side,
    orderId: String(input.orderId).trim(),
    contracts: clampContracts(input.contracts),
    beat: input.beat,
    filledAt: input.filledAt ?? Date.now(),
    ask: Number.isFinite(ask) && ask > 0 ? Math.round(ask) : undefined,
  }
}

export function fillAskCents(
  ticket: { ask?: unknown; side?: unknown },
  quote?: { yesAsk?: number; noAsk?: number } | null,
  booked?: { ask?: unknown } | null,
) {
  for (const raw of [ticket.ask, booked?.ask, ticket.side === 'down' ? quote?.noAsk : quote?.yesAsk]) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return 0
}

/** Heartbeat fill strip. Soft FAIL raw Kalshi order id as the ticket line. */
export function ticketFillStrip(
  ticket: DeskTicket,
  quote?: { yesAsk?: number; noAsk?: number } | null,
  booked?: { ask?: number; spent?: number; count?: number } | null,
) {
  const count = Math.max(1, Math.round(ticket.contracts || booked?.count || 1))
  const ask = fillAskCents(ticket, quote, booked)
  const cost =
    ticket.ask == null && booked?.spent != null && Number.isFinite(booked.spent)
      ? Math.round(booked.spent * 100) / 100
      : ticketCost(count, ask)
  const win = Math.round((count - cost) * 100) / 100
  const side = ticket.side === 'down' ? 'DOWN' : 'UP'
  const noun = count === 1 ? 'contract' : 'contracts'
  const askLabel = ask > 0 ? `${ask}¢` : '—¢'
  return `${side} · ${count} ${noun} · ${askLabel} · cost ${formatCash(cost)} · win ${formatCash(win)}`
}

export function looksLikeOrderUuid(text: string) {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)
}

/** Latest fill on this tape. Prefer the live ticker, else a fresh ticket so the strip still paints. */
export function displayTicket(tickets: DeskTicket[], id: TapeId, ticker?: string) {
  if (ticker) {
    const hit = tickets.find((t) => t.tape === id && t.ticker === ticker)
    if (hit) return hit
  }
  return tickets
    .filter((t) => t.tape === id && Date.now() - (Number(t.filledAt) || 0) < 20 * 60_000)
    .sort((a, b) => (b.filledAt || 0) - (a.filledAt || 0))[0]
}

export function loadTickets(): DeskTicket[] {
  const ls = deskStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(TICKETS_KEY)
    const list = raw ? (JSON.parse(raw) as DeskTicket[]) : []
    if (!Array.isArray(list)) return []
    return list.filter((t) => t && isRealOrderId(t.orderId) && (t.side === 'up' || t.side === 'down'))
  } catch {
    return []
  }
}

export function saveTickets(tickets: DeskTicket[]) {
  const next = tickets.filter((t) => isRealOrderId(t.orderId))
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(TICKETS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  pushHostDesk({ tickets: next })
  return next
}

export function upsertTicket(tickets: DeskTicket[], ticket: DeskTicket) {
  const next = tickets.filter((t) => !(t.tape === ticket.tape && t.ticker === ticket.ticker))
  next.push(ticket)
  return saveTickets(next)
}

/** Soft FAIL flipping a confirmed ticket back to WAIT — confirmed tickets stay UP/DOWN. */
export function ticketStatus(ticket: DeskTicket | undefined): 'WAIT' | 'UP' | 'DOWN' {
  if (!ticket || !isRealOrderId(ticket.orderId)) return 'WAIT'
  return ticket.side === 'down' ? 'DOWN' : 'UP'
}

export type HitCell = { w: number; l: number }
export type HitEvent = { tape: TapeId; ticker: string; win: boolean; at: number; spent?: number; pnl?: number }
export type HitLatch = {
  asOf: number
  tapes: Record<TapeId, HitCell>
  events: HitEvent[]
}

export const TTL_MS = 24 * 60 * 60 * 1000

function emptyCells(): Record<TapeId, HitCell> {
  return { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } }
}

export function emptyHits(): HitLatch {
  return { asOf: Date.now(), tapes: emptyCells(), events: [] }
}

export function latchFromEvents(events: HitEvent[], now = Date.now()): HitLatch {
  const recent = events.filter((e) => e.at >= now - TTL_MS && isTapeId(e.tape) && e.ticker)
  const seen = new Set<string>()
  const tapes = emptyCells()
  const kept: HitEvent[] = []
  for (const e of recent) {
    if (seen.has(e.ticker)) continue
    seen.add(e.ticker)
    kept.push(e)
    if (e.win) tapes[e.tape].w += 1
    else tapes[e.tape].l += 1
  }
  return { asOf: now, tapes, events: kept }
}

/** Hold an existing 24h latch. New Kalshi-settled tickers add in; already-latched tickers do not flicker. */
export function mergeHitEvents(latch: HitLatch, incoming: HitEvent[], now = Date.now()): HitLatch {
  return latchFromEvents([...(latch.events ?? []), ...incoming], now)
}

function settlementAt(s: Record<string, unknown>, now: number) {
  const raw = s.settled_time ?? s.settled_ts ?? s.ts ?? s.settled_time_ts
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw
  const parsed = Date.parse(String(raw ?? ''))
  return Number.isFinite(parsed) ? parsed : now
}

export function eventsFromKalshiSettlements(raw: unknown, now = Date.now(), minAt = now - TTL_MS): HitEvent[] {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const nested = root && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null
  const list = Array.isArray(root?.settlements)
    ? (root!.settlements as Record<string, unknown>[])
    : Array.isArray(nested?.settlements)
      ? (nested!.settlements as Record<string, unknown>[])
      : Array.isArray(raw)
        ? (raw as Record<string, unknown>[])
        : []
  const out: HitEvent[] = []
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    const ticker = String(s.ticker ?? s.market_ticker ?? '')
    const tape = seriesToTape(ticker)
    if (!tape) continue
    const at = settlementAt(s, now)
    if (at < minAt) continue
    const yes = num(s.yes_count_fp) ?? num(s.yes_count) ?? num(s.yes_contracts) ?? num(s.yes_total_cost_fp) ?? 0
    const no = num(s.no_count_fp) ?? num(s.no_count) ?? num(s.no_contracts) ?? num(s.no_total_cost_fp) ?? 0
    const result = String(s.market_result ?? s.result ?? '').toLowerCase()
    const revenueDollars = num(s.revenue_dollars) ?? num(s.revenue_fp)
    const revenue =
      revenueDollars != null
        ? kalshiMoney(revenueDollars, 'dollars')
        : num(s.revenue) != null
          ? kalshiMoney(s.revenue, 'cents')
          : 0
    const yesCost =
      num(s.yes_total_cost_dollars) != null
        ? kalshiMoney(s.yes_total_cost_dollars, 'dollars')
        : kalshiMoney(s.yes_total_cost, 'cents')
    const noCost =
      num(s.no_total_cost_dollars) != null
        ? kalshiMoney(s.no_total_cost_dollars, 'dollars')
        : kalshiMoney(s.no_total_cost, 'cents')
    const spent = Math.round((yesCost + noCost) * 100) / 100
    const hasFill = yes > 0 || no > 0 || spent > 0 || revenue > 0
    if (!hasFill) continue
    let win = false
    if (yes > 0 && no <= 0) win = result === 'yes'
    else if (no > 0 && yes <= 0) win = result === 'no'
    else win = revenue > spent || (result === 'yes' && yesCost > noCost) || (result === 'no' && noCost > yesCost)
    const rawPnl = spent > 0 || revenue > 0 ? Math.round((revenue - spent) * 100) / 100 : null
    const pnl =
      rawPnl != null && rawPnl !== 0
        ? rawPnl
        : win
          ? Math.round(Math.max(spent > 0 ? 1 - spent : 0.01, 0.01) * 100) / 100
          : -Math.round(Math.max(spent, 0.01) * 100) / 100
    out.push({ tape, ticker, win, at, ...(spent > 0 ? { spent } : {}), pnl })
  }
  return out
}

export function eventsFromTickets(
  tickets: DeskTicket[],
  settled: Array<{ ticker: string; result: 'up' | 'down'; closeAt?: number }>,
  now = Date.now(),
): HitEvent[] {
  const byTicker = new Map(settled.map((s) => [s.ticker, s]))
  const out: HitEvent[] = []
  for (const t of tickets) {
    if (!isRealOrderId(t.orderId)) continue
    const s = byTicker.get(t.ticker)
    if (!s) continue
    const at = s.closeAt && s.closeAt > 0 ? s.closeAt : now
    if (at < now - TTL_MS) continue
    const win = (t.side === 'up' && s.result === 'up') || (t.side === 'down' && s.result === 'down')
    out.push({ tape: t.tape, ticker: t.ticker, win, at })
  }
  return out
}

export function loadHits(): HitLatch {
  const ls = deskStorage()
  if (!ls) return emptyHits()
  try {
    const raw = ls.getItem(HITS_KEY)
    if (!raw) return emptyHits()
    const parsed = JSON.parse(raw) as HitLatch
    if (Array.isArray(parsed.events) && parsed.events.length) {
      return latchFromEvents(parsed.events)
    }
    const held = emptyHits()
    for (const id of TAPE_IDS) {
      const cell = parsed?.tapes?.[id]
      held.tapes[id] = {
        w: Math.max(0, Math.round(Number(cell?.w) || 0)),
        l: Math.max(0, Math.round(Number(cell?.l) || 0)),
      }
    }
    held.asOf = Number(parsed?.asOf) || Date.now()
    return held
  } catch {
    return emptyHits()
  }
}

export function saveHits(hits: HitLatch) {
  const ls = deskStorage()
  if (!ls) return hits
  try {
    ls.setItem(HITS_KEY, JSON.stringify(hits))
  } catch {
    /* quota */
  }
  return hits
}

function settlementDollars(v: unknown) {
  const n = num(v)
  if (n == null) return 0
  if (Number.isInteger(n) && Math.abs(n) >= 1000) return n / 100
  return n
}

/** Kalshi money: *_dollars stay dollars; legacy integer fields are cents. */
export function kalshiMoney(v: unknown, unit: 'dollars' | 'cents'): number {
  const n = num(v)
  if (n == null) return 0
  if (unit === 'cents') return n / 100
  if (Number.isInteger(n) && Math.abs(n) >= 1000) return n / 100
  return n
}

/** Soft KEEP boot hydrate: portfolio settlements → tape 24H chips from Windows-host creds. */
export function hydrateHitsFromKalshiCash(raw: unknown, prev: HitLatch = loadHits(), now = Date.now()): HitLatch {
  const ev = eventsFromKalshiSettlements(raw, now)
  if (!ev.length) return prev
  return saveHits(mergeHitEvents(prev, ev, now))
}

export function hydrateCashFromKalshi(
  raw: { cash?: number | null; deposits?: unknown; settlements?: unknown; raw?: unknown },
  prev: CashLatch = loadCash(),
): { cash: CashLatch; hits: HitLatch } {
  const meta = depositsMeta(raw.deposits) ?? depositsMeta(raw.raw) ?? null
  const deposits = meta?.total ?? depositsFromPayload(raw.deposits) ?? depositsFromPayload(raw.raw) ?? prev.deposits
  const firstDepositAt = meta?.firstAt ?? prev.firstDepositAt
  const fromPayload = raw.raw != null ? cashFromBalancePayload(raw.raw) : null
  const cashAmt =
    Number.isFinite(raw.cash as number) && Number(raw.cash) > 0
      ? Number(raw.cash)
      : fromPayload != null && fromPayload > 0
        ? fromPayload
        : prev.cash
  const cash = saveCash({
    cash: cashAmt,
    deposits,
    firstDepositAt,
    pnl: cashAmt != null && deposits != null ? Math.round((cashAmt - deposits) * 100) / 100 : prev.pnl,
    asOf: Date.now(),
  })
  return { cash, hits: hydrateHitsFromKalshiCash(raw.settlements ?? raw, loadHits()) }
}

export function ttlFromHits(hits: HitLatch) {
  let w = 0
  let l = 0
  for (const id of TAPE_IDS) {
    w += hits.tapes[id].w
    l += hits.tapes[id].l
  }
  const n = w + l
  return { w, l, pct: n ? Math.round((w / n) * 100) : 0 }
}

export function hitPct(cell: HitCell) {
  const n = cell.w + cell.l
  return n ? Math.round((cell.w / n) * 100) : 0
}

export type CashLatch = {
  cash: number | null
  pnl: number | null
  deposits: number | null
  firstDepositAt: number | null
  asOf: number
}

function emptyCash(): CashLatch {
  return { cash: null, pnl: null, deposits: null, firstDepositAt: null, asOf: 0 }
}

export function loadCash(): CashLatch {
  const ls = deskStorage()
  if (!ls) return emptyCash()
  try {
    const raw = ls.getItem(CASH_KEY)
    if (!raw) return emptyCash()
    const o = JSON.parse(raw) as CashLatch
    return {
      cash: Number.isFinite(o.cash) ? Number(o.cash) : null,
      pnl: Number.isFinite(o.pnl) ? Number(o.pnl) : null,
      deposits: Number.isFinite(o.deposits) ? Number(o.deposits) : null,
      firstDepositAt: Number.isFinite(o.firstDepositAt) ? Number(o.firstDepositAt) : null,
      asOf: Number(o.asOf) || 0,
    }
  } catch {
    return emptyCash()
  }
}

export function saveCash(cash: CashLatch) {
  const ls = deskStorage()
  if (!ls) return cash
  try {
    ls.setItem(CASH_KEY, JSON.stringify(cash))
  } catch {
    /* quota */
  }
  return cash
}

function depositRowDollars(d: Record<string, unknown>) {
  const officialCents = num(d.amount_cents)
  if (officialCents != null) return officialCents / 100
  const dollars =
    num(d.amount_dollars) ?? num(d.deposit_dollars) ?? num(d.usd) ?? num(d.amount_usd) ?? num(d.value_dollars)
  if (dollars != null) return dollars
  const cents = num(d.amount) ?? num(d.deposit) ?? num(d.value)
  if (cents == null) return 0
  if (Number.isInteger(cents) && Math.abs(cents) >= 50) return cents / 100
  return cents
}

function depositRowAt(d: Record<string, unknown>) {
  const raw = d.created_ts ?? d.ts ?? d.timestamp ?? d.created_time ?? d.deposit_time ?? d.settled_time
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw
  const parsed = Date.parse(String(raw ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function depositsMeta(raw: unknown): { total: number; firstAt: number | null } | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const total = Number.isInteger(raw) && Math.abs(raw) >= 1000 ? raw / 100 : raw
    return { total, firstAt: null }
  }
  if (typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const nested = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null
  const flat = Object.assign({}, o, nested || {})
  for (const key of ['lifetime_deposits', 'total_deposits', 'deposited', 'deposit_total', 'deposits_dollars']) {
    const n = num(flat[key])
    if (n != null && !Array.isArray(flat[key])) {
      const total = Number.isInteger(n) && Math.abs(n) >= 1000 ? n / 100 : n
      return { total, firstAt: null }
    }
  }
  const list = Array.isArray(o.deposits)
    ? (o.deposits as Record<string, unknown>[])
    : Array.isArray(nested?.deposits)
      ? (nested.deposits as Record<string, unknown>[])
      : Array.isArray(o.deposit_history)
        ? (o.deposit_history as Record<string, unknown>[])
        : Array.isArray(nested?.deposit_history)
          ? (nested.deposit_history as Record<string, unknown>[])
          : []
  if (!list.length) {
    const n = num(flat.deposits)
    if (n != null) {
      const total = Number.isInteger(n) && Math.abs(n) >= 1000 ? n / 100 : n
      return { total, firstAt: null }
    }
    return null
  }
  let sum = 0
  let firstAt: number | null = null
  for (const d of list) {
    if (!d || typeof d !== 'object') continue
    const status = String(d.status ?? 'applied').toLowerCase()
    if (status === 'failed' || status === 'returned') continue
    sum += depositRowDollars(d)
    const at = depositRowAt(d)
    if (at != null && (firstAt == null || at < firstAt)) firstAt = at
  }
  return { total: Math.round(sum * 100) / 100, firstAt }
}

export function depositsFromPayload(raw: unknown): number | null {
  return depositsMeta(raw)?.total ?? null
}

export function seriesToTape(seriesOrTicker: string): TapeId | null {
  const s = seriesOrTicker.toUpperCase()
  if (s.startsWith('KXBTC')) return 'btc'
  if (s.startsWith('KXNATGAS') || s.startsWith('KXNG')) return 'ng'
  if (s.startsWith('KXCOPPER') || s.startsWith('KXCU')) return 'cu'
  if (s.startsWith('KXGOLD') || s.startsWith('KXGLD')) return 'gld'
  return null
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

const STRIKE_KEYS = new Set(['floor_strike', 'strike', 'strike_price', 'beat', 'floor'])
const LIVE_PRINT_KEYS = ['last', 'latest', 'price', 'value', 'px', 'close', 'last_price', 'spot', 'index', 'underlying']

function livePx(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    if (STRIKE_KEYS.has(k)) continue
    const v = num(row[k])
    if (v != null && v > 0) return v
  }
  return null
}

/** Last print from Kalshi live_data / timeseries. Soft FAIL strike-as-live. Prefer latest over 1M. */
export function lastPrintFromLiveData(payload: unknown): { px: number; source: 'kalshi-live' | 'kalshi-timeseries' } | null {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const live = (root?.live_data && typeof root.live_data === 'object' ? root.live_data : root) as Record<string, unknown> | null
  const details = (live?.details && typeof live.details === 'object' ? live.details : live) as Record<string, unknown> | null
  if (!details) return null

  for (const bag of [details, live!]) {
    const instant = livePx(bag, LIVE_PRINT_KEYS)
    if (instant != null) return { px: instant, source: 'kalshi-live' }
  }

  const ticks = details.ticks ?? details.trades ?? live?.ticks
  if (Array.isArray(ticks) && ticks.length) {
    for (let i = ticks.length - 1; i >= 0; i--) {
      const row = ticks[i]
      if (!row || typeof row !== 'object') continue
      const v = livePx(row as Record<string, unknown>, ['v', 'px', 'price', 'close', 'last'])
      if (v != null) return { px: v, source: 'kalshi-live' }
    }
  }

  const ts = details.timeseries
  if (Array.isArray(ts) && ts.length) {
    for (let i = ts.length - 1; i >= 0; i--) {
      const row = ts[i]
      if (Array.isArray(row)) {
        const v = num(row[1] ?? row[2])
        if (v != null && v > 0) return { px: v, source: 'kalshi-timeseries' }
        continue
      }
      if (!row || typeof row !== 'object') continue
      const v = livePx(row as Record<string, unknown>, ['v', 'px', 'price', 'close', 'value'])
      if (v != null) return { px: v, source: 'kalshi-timeseries' }
    }
  }

  const sticks = details.candlesticks
  const groups = sticks && typeof sticks === 'object' ? (sticks as Record<string, unknown>) : null
  const series = Array.isArray(sticks)
    ? sticks
    : Array.isArray(groups?.['1S'])
      ? groups!['1S']
      : Array.isArray(groups?.['1s'])
        ? groups!['1s']
        : Array.isArray(groups?.['1M'])
          ? groups!['1M']
          : Array.isArray(groups?.['1m'])
            ? groups!['1m']
            : []
  if (Array.isArray(series) && series.length) {
    for (let i = series.length - 1; i >= 0; i--) {
      const row = series[i]
      if (!row || typeof row !== 'object') continue
      const v = livePx(row as Record<string, unknown>, ['close', 'c', 'v', 'px'])
      if (v != null) return { px: v, source: 'kalshi-live' }
    }
  }

  return null
}

/** Index trail from Kalshi live_data. Soft FAIL mix 1M candle extrema into LIVE. */
export function pointsFromLiveData(payload: unknown): { t: number; px: number }[] {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const live = (root?.live_data && typeof root.live_data === 'object' ? root.live_data : root) as Record<string, unknown> | null
  const details = (live?.details && typeof live.details === 'object' ? live.details : live) as Record<string, unknown> | null
  if (!details) return []
  const out: Point[] = []
  const push = (rawT: unknown, rawPx: unknown) => {
    const t = pointTime(num(rawT) ?? 0)
    const px = num(rawPx)
    if (t != null && px != null && px > 0) out.push({ t, px })
  }
  const ts = details.timeseries
  if (Array.isArray(ts) && ts.length) {
    for (const row of ts) {
      if (Array.isArray(row)) {
        push(row[0], row[1] ?? row[2])
        continue
      }
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const nested = r.price && typeof r.price === 'object' ? (r.price as Record<string, unknown>) : null
      push(
        r.t ?? r.ts ?? r.time ?? r.timestamp,
        r.v ?? r.px ?? r.price ?? r.close ?? r.value ?? nested?.close ?? nested?.last,
      )
    }
    out.sort((a, b) => a.t - b.t)
    const bag = new Map<number, number>()
    for (const p of out) bag.set(p.t, p.px)
    return [...bag.entries()].map(([t, px]) => ({ t, px })).sort((a, b) => a.t - b.t).slice(-2400)
  }
  const sticks = details.candlesticks
  const groups = sticks && typeof sticks === 'object' ? (sticks as Record<string, unknown>) : null
  const candles = Array.isArray(sticks)
    ? sticks
    : Array.isArray(groups?.['1S'])
      ? groups!['1S']
      : Array.isArray(groups?.['1s'])
        ? groups!['1s']
        : Array.isArray(groups?.['1M'])
          ? groups!['1M']
          : Array.isArray(groups?.['1m'])
            ? groups!['1m']
            : []
  if (Array.isArray(candles) && candles.length) {
    for (const row of candles) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      push(r.t ?? r.ts ?? r.end_ts ?? r.end_period_ts, r.close ?? r.c ?? r.px ?? r.v)
    }
  }
  const ticks = details.ticks ?? details.trades ?? live?.ticks
  if (Array.isArray(ticks)) {
    for (const row of ticks) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      push(r.t ?? r.ts ?? r.created_time, r.v ?? r.px ?? r.price ?? r.close)
    }
  }
  out.sort((a, b) => a.t - b.t)
  const bag = new Map<number, number>()
  for (const p of out) bag.set(p.t, p.px)
  return [...bag.entries()].map(([t, px]) => ({ t, px })).sort((a, b) => a.t - b.t).slice(-2400)
}

/** Soft KEEP: Kalshi status=open|active and now < close. `active` is the open-filter field. */
export function marketTradingActive(
  m: { status?: unknown; close_time?: unknown; open_time?: unknown } | null | undefined,
  now = Date.now(),
): boolean {
  if (!m) return false
  const status = String(m.status ?? 'open').toLowerCase()
  if (status === 'closed' || status === 'settled' || status === 'finalized' || status === 'determined' || status === 'inactive') {
    return false
  }
  const close = Date.parse(String(m.close_time ?? ''))
  if (Number.isFinite(close) && now >= close) return false
  const open = Date.parse(String(m.open_time ?? ''))
  if (Number.isFinite(open) && now < open) return false
  return status === 'open' || status === 'active' || status === 'initialized' || m.status == null
}

export function askCentsFromMarket(m: Record<string, unknown>, yes: boolean) {
  const dollars = num(yes ? m.yes_ask_dollars : m.no_ask_dollars)
  if (dollars != null) return Math.round(dollars * 100)
  const cents = num(yes ? m.yes_ask : m.no_ask)
  return cents ?? 0
}

export function formatLive(id: TapeId, n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  const d = TAPE_META[id].decimals
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n as number)
}

export function formatCash(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n as number)
}

export function formatPnl(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  const v = n as number
  const core = formatCash(Math.abs(v))
  if (v > 0) return `+${core}`
  if (v < 0) return `−${core}`
  return core
}

/** NOW vs TO BEAT. Soft KEEP: below target is green, above is red. */
export function nowTone(live: number | null | undefined, beat: number | null | undefined): 'up' | 'down' | undefined {
  if (!Number.isFinite(live ?? NaN) || !Number.isFinite(beat ?? NaN) || (beat as number) <= 0) return undefined
  if ((live as number) < (beat as number)) return 'up'
  if ((live as number) > (beat as number)) return 'down'
  return undefined
}

export function nowDelta(live: number | null | undefined, beat: number | null | undefined) {
  if (!Number.isFinite(live ?? NaN) || !Number.isFinite(beat ?? NaN) || (beat as number) <= 0) return null
  const d = (live as number) - (beat as number)
  return { d, pct: (d / (beat as number)) * 100 }
}

export function formatNowDelta(id: TapeId, live: number | null | undefined, beat: number | null | undefined) {
  const delta = nowDelta(live, beat)
  if (!delta) return '—'
  const sign = delta.d > 0 ? '+' : delta.d < 0 ? '−' : ''
  return `${sign}${formatLive(id, Math.abs(delta.d))} (${sign}${Math.abs(delta.pct).toFixed(3)}%)`
}

export function weThink(live: number | null, beat: number, points: { t: number; px: number }[], now = Date.now()) {
  return weThinkPair(live, beat, points, now).ahead
}

/** Gold pulse: live / 4-min ahead. Soft KEEP the pair; do not swap in strike or theory. */
export function weThinkPair(
  live: number | null,
  beat: number,
  points: { t: number; px: number }[],
  now = Date.now(),
): { live: number | null; ahead: number | null } {
  if (live == null || !Number.isFinite(live)) return { live: null, ahead: null }
  const from = now - 6 * 60_000
  const slice = points.filter((p) => p.t >= from && p.t <= now + 1000)
  if (slice.length < 2) return { live, ahead: live }
  const a = slice[0]
  const b = slice[slice.length - 1]
  const mins = (b.t - a.t) / 60_000
  if (mins < 0.2) return { live, ahead: live }
  const slope = (b.px - a.px) / mins
  const ahead = live + slope * 4
  if (!Number.isFinite(ahead) || Math.abs(ahead - beat) > Math.abs(beat) * 0.2 + 500) return { live, ahead: live }
  return { live, ahead }
}

export function formatWeThink(id: TapeId, live: number | null, ahead: number | null) {
  if (live == null) return '—'
  if (ahead == null || ahead === live) return formatLive(id, live)
  return `${formatLive(id, live)} / ${formatLive(id, ahead)}`
}

export function extractOrderId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const direct = o.order_id ?? o.orderId ?? o.position_id ?? o.positionId ?? o.id
  if (isRealOrderId(direct)) return direct
  for (const nest of [o.order, o.position, o.fill]) {
    if (nest && typeof nest === 'object') {
      const inner = (nest as Record<string, unknown>).order_id
        ?? (nest as Record<string, unknown>).position_id
        ?? (nest as Record<string, unknown>).id
      if (isRealOrderId(inner)) return inner
    }
  }
  return null
}

export function pulseTone(ticket: DeskTicket | undefined, live: number | null): 'quiet' | 'green' | 'red' {
  if (!ticket || !isRealOrderId(ticket.orderId) || live == null || !Number.isFinite(live) || !Number.isFinite(ticket.beat)) {
    return 'quiet'
  }
  const onSide = ticket.side === 'up' ? live >= ticket.beat : live <= ticket.beat
  return onSide ? 'green' : 'red'
}
