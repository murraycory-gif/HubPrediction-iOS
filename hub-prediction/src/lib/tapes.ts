import { deskStorage } from './desk-storage'

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
  live: 90_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}

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

export type DeskSettings = {
  liveBets: boolean
  tapes: Record<TapeId, TapeRecipe>
  betsFilter: TapeId[]
  clocks: Record<TapeId, TapeClock>
  charts: Record<TapeId, ChartRange>
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
  btc: { contracts: 1, botOn: false, liveOn: false, armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 },
  ng: { contracts: 1, botOn: false, liveOn: false, armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  cu: { contracts: 1, botOn: false, liveOn: false, armFromMin: 9, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  gld: { contracts: 1, botOn: false, liveOn: false, armFromMin: 10, armToMin: 3, through: 2, centLo: 34, centHi: 89 },
}

export const DEFAULT_SETTINGS: DeskSettings = {
  liveBets: false,
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

function recipeFrom(partial: Partial<TapeRecipe> | undefined, gold: TapeRecipe): TapeRecipe {
  return {
    contracts: clampContracts(Number(partial?.contracts ?? gold.contracts)),
    botOn: false,
    liveOn: false,
    armFromMin: gold.armFromMin,
    armToMin: gold.armToMin,
    through: gold.through,
    centLo: gold.centLo,
    centHi: gold.centHi,
  }
}

/** Live boots OFF unless stored true. Bots may persist ON if stored (night paper). Soft FAIL live-cash ON by default. */
export function hydrateSettings(raw: unknown): DeskSettings {
  const o = raw && typeof raw === 'object' ? (raw as Partial<DeskSettings> & { tapes?: Partial<Record<TapeId, Partial<TapeRecipe>>> }) : {}
  const tapes = {} as Record<TapeId, TapeRecipe>
  for (const id of TAPE_IDS) {
    const gold = GOLD_RECIPES[id]
    const stored = o.tapes?.[id]
    const next = recipeFrom(stored, gold)
    if (stored) {
      next.botOn = stored.botOn === true
      next.liveOn = stored.liveOn === true
    }
    tapes[id] = next
  }
  return {
    liveBets: o.liveBets === true,
    tapes,
    betsFilter: hydrateBetsFilter((o as { betsFilter?: unknown }).betsFilter),
    clocks: hydrateClocks((o as { clocks?: unknown }).clocks),
    charts: hydrateChartRanges((o as { charts?: unknown }).charts),
  }
}

export function loadSettings(): DeskSettings {
  const ls = deskStorage()
  if (!ls) return hydrateSettings(null)
  try {
    const raw = ls.getItem(SETTINGS_KEY)
    return hydrateSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return hydrateSettings(null)
  }
}

export function saveSettings(settings: DeskSettings) {
  const next = hydrateSettings(settings)
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function patchTape(settings: DeskSettings, id: TapeId, patch: Partial<TapeRecipe>): DeskSettings {
  return saveSettings({
    ...settings,
    tapes: { ...settings.tapes, [id]: { ...settings.tapes[id], ...patch } },
  })
}

export function setLiveBets(settings: DeskSettings, liveBets: boolean): DeskSettings {
  return saveSettings({ ...settings, liveBets })
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
  return saveSettings({ ...settings, liveBets: false, tapes })
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

/** Master Live + tape bot + tape live cash. Soft FAIL cold ON. Bot ON + live cash OFF = PAPER. */
export function cashGates(settings: DeskSettings, tape: TapeId) {
  const bot = settings.tapes[tape].botOn === true
  const liveCash = settings.tapes[tape].liveOn === true
  const master = settings.liveBets === true
  return { master, bot, liveCash, ok: master && bot && liveCash }
}

export type SendClaim = { at: number; tries: number; filled?: string }

/** IOC miss retries 3–4x then release. Stale claim >8s cannot block. */
export function claimSend(map: Record<string, SendClaim>, key: string, now = Date.now()): 'send' | 'skip' {
  const c = map[key]
  if (c?.filled) return 'skip'
  if (c && now - c.at < 180) return 'skip'
  if (c && c.tries >= 4 && now - c.at < 8500) return 'skip'
  if (c && now - c.at >= 8000) delete map[key]
  const prev = map[key]
  const tries = (prev?.tries ?? 0) + 1
  if (tries > 4) {
    delete map[key]
    return 'skip'
  }
  map[key] = { at: now, tries }
  return 'send'
}

export function markFilled(map: Record<string, SendClaim>, key: string, orderId: string) {
  map[key] = { at: Date.now(), tries: 4, filled: orderId }
}

export function releaseClaim(map: Record<string, SendClaim>, key: string) {
  delete map[key]
}

export type DeskTicket = {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  orderId: string
  contracts: number
  beat: number
  filledAt: number
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
}): DeskTicket | null {
  if (!isRealOrderId(input.orderId)) return null
  if (input.side !== 'up' && input.side !== 'down') return null
  if (!input.ticker) return null
  return {
    tape: input.tape,
    ticker: input.ticker,
    side: input.side,
    orderId: String(input.orderId).trim(),
    contracts: clampContracts(input.contracts),
    beat: input.beat,
    filledAt: input.filledAt ?? Date.now(),
  }
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
    const ticker = String(s.ticker ?? '')
    const tape = seriesToTape(ticker)
    if (!tape) continue
    const at = settlementAt(s, now)
    if (at < minAt) continue
    const yes = num(s.yes_count_fp) ?? num(s.yes_count) ?? num(s.yes_total_cost_fp) ?? 0
    const no = num(s.no_count_fp) ?? num(s.no_count) ?? num(s.no_total_cost_fp) ?? 0
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
    const pnl = spent > 0 || revenue > 0 ? Math.round((revenue - spent) * 100) / 100 : undefined
    out.push({ tape, ticker, win, at, ...(spent > 0 ? { spent } : {}), ...(pnl != null ? { pnl } : {}) })
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
  const cashAmt = Number.isFinite(raw.cash as number) ? Number(raw.cash) : prev.cash
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
      if (!row || typeof row !== 'object') continue
      const v = livePx(row as Record<string, unknown>, ['v', 'px', 'price', 'close'])
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
  return status === 'open' || status === 'active' || m.status == null
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
