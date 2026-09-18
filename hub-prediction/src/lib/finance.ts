import { deskStorage } from './desk-storage'
import { ticketCost } from './size-cash'
import {
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  eventsFromKalshiSettlements,
  hydrateBetsFilter,
  isRealOrderId,
  isTapeId,
  nextBetsFilter,
  num,
  seriesToTape,
  clockFromTicker,
  windowMsForClock,
  type DeskTicket,
  type TapeId,
  type TapeRecipe,
} from './tapes'

export const FINANCE_KEY = 'hub.desk.finance.v1'
export {
  BETS_FILTER_KEY,
  allBetsFilter,
  applyBetsFilter,
  hydrateBetsFilter,
  isAllBetsFilter,
  nextBetsFilter,
} from './tapes'

export function loadBetsFilter(): TapeId[] {
  const ls = deskStorage()
  if (!ls) return hydrateBetsFilter(null)
  try {
    const fromKey = ls.getItem('hub.desk.betsFilter.v1')
    if (fromKey) return hydrateBetsFilter(JSON.parse(fromKey))
    const settings = ls.getItem('hub.desk.settings.v1')
    if (settings) return hydrateBetsFilter((JSON.parse(settings) as { betsFilter?: unknown }).betsFilter)
  } catch {
    /* ignore */
  }
  return hydrateBetsFilter(null)
}

export function saveBetsFilter(ids: readonly TapeId[]): TapeId[] {
  const next = hydrateBetsFilter([...ids])
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem('hub.desk.betsFilter.v1', JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function toggleBetsFilter(current: readonly TapeId[], chip: 'all' | TapeId): TapeId[] {
  return saveBetsFilter(nextBetsFilter(current, chip))
}

export const PAPER_CASH_FLOOR = 50
export const LIVE_FLOOR_MIN = 150
export const LIVE_FLOOR_PCT = 0.2
export const ASK_CAP = 80
export const PAPER_HOURS = 48
export const DAILY_PNL_FLOOR_PAPER = -50
export const HIT_FLOOR = 85

export type BetKind = 'live' | 'paper'

export type BookedBet = {
  betId: string
  tape: TapeId
  ticker: string
  clock: string
  closeAt: number
  side: 'up' | 'down'
  count: number
  ask: number
  spent: number
  orderId: string
  status: 'open' | 'settled'
  pnl: number | null
  filledAt: number
  settledAt: number | null
  kind: BetKind
}

export function isPaperOrderId(id: unknown) {
  return typeof id === 'string' && /^deskfill-/i.test(id.trim())
}

export function betKind(b: { kind?: unknown; orderId?: unknown; betId?: unknown }): BetKind {
  if (b.kind === 'paper' || b.kind === 'live') return b.kind
  if (isPaperOrderId(b.orderId)) return 'paper'
  if (typeof b.betId === 'string' && /^paper:/i.test(b.betId)) return 'paper'
  return 'live'
}

export function isPaperBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return betKind(b) === 'paper'
}

export function isLiveBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return !isPaperBet(b)
}

/** Live settled rows carry the Kalshi cash move. Paper never touches cash. */
export function cashUpdateForBet(b: {
  kind?: unknown
  orderId?: unknown
  betId?: unknown
  status: 'open' | 'settled'
  pnl: number | null
}): { kind: 'paper' | 'open' | 'live'; amount: number | null } {
  if (isPaperBet(b)) return { kind: 'paper', amount: null }
  if (b.status !== 'settled' || b.pnl == null) return { kind: 'open', amount: null }
  return { kind: 'live', amount: b.pnl }
}

export function betWindowMs(b: { clock?: string; ticker?: string }) {
  return windowMsForClock(b.clock || '') || windowMsForClock(b.ticker || '')
}

export type FinanceState = {
  killed: boolean
  paperStartedAt: number
  bets: BookedBet[]
}

export function emptyFinance(): FinanceState {
  return { killed: false, paperStartedAt: Date.now(), bets: [] }
}

export function hydrateFinance(raw: unknown): FinanceState {
  const base = emptyFinance()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<FinanceState>
  const bets = Array.isArray(o.bets)
    ? o.bets
        .filter((b): b is BookedBet => {
          return (
            !!b &&
            isTapeId(b.tape) &&
            (isRealOrderId(b.orderId) || (typeof b.betId === 'string' && b.betId.startsWith('kalshi:'))) &&
            (b.side === 'up' || b.side === 'down') &&
            typeof b.ticker === 'string'
          )
        })
        .map((b) => ({ ...b, kind: betKind(b) }))
    : []
  return {
    killed: o.killed === true,
    paperStartedAt: Number.isFinite(o.paperStartedAt) ? Number(o.paperStartedAt) : base.paperStartedAt,
    bets,
  }
}

export function loadFinance(): FinanceState {
  const ls = deskStorage()
  if (!ls) return emptyFinance()
  try {
    const raw = ls.getItem(FINANCE_KEY)
    return hydrateFinance(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyFinance()
  }
}

export function saveFinance(state: FinanceState): FinanceState {
  const next = hydrateFinance(state)
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(FINANCE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function liveCashFloor(deposits: number | null | undefined) {
  const dep = Number.isFinite(deposits ?? NaN) ? Number(deposits) : 0
  return Math.round(Math.max(LIVE_FLOOR_MIN, dep * LIVE_FLOOR_PCT) * 100) / 100
}

export function paperCashFloor() {
  return PAPER_CASH_FLOOR
}

export function pnlVsDeposits(cash: number | null | undefined, deposits: number | null | undefined) {
  if (!Number.isFinite(cash ?? NaN) || !Number.isFinite(deposits ?? NaN)) return null
  return Math.round((Number(cash) - Number(deposits)) * 100) / 100
}

export function bookRealizedPnl(state: FinanceState) {
  return Math.round(
    state.bets
      .filter((b) => isLiveBet(b) && b.status === 'settled' && b.pnl != null)
      .reduce((s, b) => s + (b.pnl ?? 0), 0) * 100,
  ) / 100
}

export function last24hBets(
  state: FinanceState,
  hits: { tapes: Record<TapeId, { w: number; l: number }>; events?: Array<{ tape: TapeId; at: number; spent?: number; pnl?: number }> },
  now = Date.now(),
  tapes: readonly TapeId[] = TAPE_IDS,
  fromMs?: number,
) {
  const allow = new Set(hydrateBetsFilter([...tapes]))
  const from = Number.isFinite(fromMs) ? Number(fromMs) : now - 24 * 60 * 60 * 1000
  const recent = state.bets.filter((b) => allow.has(b.tape) && (b.filledAt || b.settledAt || 0) >= from)
  const settled = recent.filter((b) => b.status === 'settled')
  const liveRecent = recent.filter((b) => isLiveBet(b))
  const liveSettled = settled.filter((b) => isLiveBet(b))
  const open = recent.filter((b) => b.status === 'open').length
  const bookW = settled.filter((b) => (b.pnl ?? 0) > 0).length
  const bookL = settled.filter((b) => (b.pnl ?? 0) < 0).length
  const selected = TAPE_IDS.filter((id) => allow.has(id))
  const hitW = selected.reduce((s, id) => s + (hits.tapes[id]?.w ?? 0), 0)
  const hitL = selected.reduce((s, id) => s + (hits.tapes[id]?.l ?? 0), 0)
  const lifetime = fromMs != null
  const w = lifetime && recent.length > 0 ? bookW : hitW + hitL > 0 ? hitW : bookW
  const l = lifetime && recent.length > 0 ? bookL : hitW + hitL > 0 ? hitL : bookL
  const ev = (hits.events ?? []).filter((e) => allow.has(e.tape) && e.at >= from)
  const placed =
    recent.length > 0
      ? Math.round(liveRecent.reduce((s, b) => s + (Number(b.spent) || 0), 0) * 100) / 100
      : Math.round(ev.reduce((s, e) => s + (Number(e.spent) || 0), 0) * 100) / 100
  const pnl =
    recent.length > 0
      ? Math.round(liveSettled.reduce((s, b) => s + (b.pnl ?? 0), 0) * 100) / 100
      : Math.round(ev.reduce((s, e) => s + (Number(e.pnl) || 0), 0) * 100) / 100
  const n = w + l
  const pct = n ? Math.round((w / n) * 100) : 0
  return { placed, w, l, pnl, open, pct }
}

export function dailyRealizedPnl(state: FinanceState, now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const from = start.getTime()
  return Math.round(
    state.bets
      .filter((b) => isLiveBet(b) && b.status === 'settled' && b.settledAt != null && b.settledAt >= from && b.pnl != null)
      .reduce((s, b) => s + (b.pnl ?? 0), 0) * 100,
  ) / 100
}

export function paperHoursLeft(state: FinanceState, now = Date.now()) {
  const elapsed = (now - state.paperStartedAt) / 3_600_000
  return Math.max(0, PAPER_HOURS - elapsed)
}

export function paper48hPassed(state: FinanceState, now = Date.now()) {
  return paperHoursLeft(state, now) <= 0
}

/** Soft FAIL asks ≥80¢ unless the gold lock band includes that ask. */
export function askAllowedByGold(tape: TapeId, ask: number) {
  if (!Number.isFinite(ask)) return false
  const gold = GOLD_RECIPES[tape]
  if (ask >= ASK_CAP && (ask < gold.centLo || ask > gold.centHi)) return false
  return ask >= gold.centLo && ask <= gold.centHi
}

export function recommendSize(tape: TapeId) {
  return GOLD_RECIPES[tape].contracts
}

export function openOnTicker(state: FinanceState, ticker: string) {
  return state.bets.some((b) => b.ticker === ticker && b.status === 'open')
}

export type Gate = { ok: true } | { ok: false; reason: string }

export function liveArmGate(
  state: FinanceState,
  opts: { cash: number | null; deposits: number | null; hasKeys: boolean },
  now = Date.now(),
): Gate {
  if (state.killed) return { ok: false, reason: 'KILL on — Place blocked until cleared' }
  if (!opts.hasKeys) return { ok: false, reason: 'LIVE needs keys' }
  if (!paper48hPassed(state, now)) {
    return { ok: false, reason: `Paper ${paperHoursLeft(state, now).toFixed(1)}h left — Soft FAIL Live ON` }
  }
  const cash = opts.cash
  if (!Number.isFinite(cash ?? NaN)) return { ok: false, reason: 'LIVE needs Kalshi cash' }
  const floor = liveCashFloor(opts.deposits)
  if ((cash as number) < floor) {
    return { ok: false, reason: `Cash ${cash} under live floor ${floor} — Soft FAIL Live` }
  }
  return { ok: true }
}

export function liveSendGate(
  state: FinanceState,
  opts: {
    tape: TapeId
    ticker: string
    ask: number
    cash: number | null
    deposits: number | null
    spent: number
  },
  now = Date.now(),
): Gate {
  if (state.killed) return { ok: false, reason: 'KILL on — Place blocked until cleared' }
  if (!opts.ticker) return { ok: false, reason: 'No ticker' }
  if (!askAllowedByGold(opts.tape, opts.ask)) {
    return { ok: false, reason: `Ask ${opts.ask}¢ blocked (≥${ASK_CAP} unless gold lock)` }
  }
  const daily = dailyRealizedPnl(state, now)
  if (daily <= DAILY_PNL_FLOOR_PAPER) {
    return { ok: false, reason: `Daily P/L floor ${DAILY_PNL_FLOOR_PAPER} — KILL / sit` }
  }
  const floor = liveCashFloor(opts.deposits)
  if (Number.isFinite(opts.cash ?? NaN) && (opts.cash as number) - opts.spent < floor) {
    return { ok: false, reason: `Cash floor ${floor} blocks Place` }
  }
  return { ok: true }
}

export function bookFill(
  state: FinanceState,
  input: {
    tape: TapeId
    ticker: string
    clock: string
    closeAt: number
    side: 'up' | 'down'
    count: number
    ask: number
    orderId: unknown
  },
): { ok: true; state: FinanceState; bet: BookedBet } | { ok: false; state: FinanceState; reason: string } {
  if (!isRealOrderId(input.orderId)) {
    return { ok: false, state, reason: 'Soft FAIL ghost BOT BOUGHT — no real order id' }
  }
  if (openOnTicker(state, input.ticker)) {
    return { ok: false, state, reason: 'One ticket/clock — already booked' }
  }
  const spent = ticketCost(input.count, input.ask)
  const bet: BookedBet = {
    betId: `bet_${input.orderId}`,
    tape: input.tape,
    ticker: input.ticker,
    clock: input.clock,
    closeAt: input.closeAt,
    side: input.side,
    count: input.count,
    ask: input.ask,
    spent,
    orderId: String(input.orderId).trim(),
    status: 'open',
    pnl: null,
    filledAt: Date.now(),
    settledAt: null,
    kind: isPaperOrderId(input.orderId) ? 'paper' : 'live',
  }
  const next = saveFinance({ ...state, bets: [...state.bets, bet] })
  return { ok: true, state: next, bet }
}

export function syncTicketsIntoBook(state: FinanceState, tickets: DeskTicket[], clockOf: (t: DeskTicket) => { clock: string; closeAt: number; ask: number }) {
  let next = state
  for (const t of tickets) {
    if (!isRealOrderId(t.orderId)) continue
    if (next.bets.some((b) => b.orderId === t.orderId || (b.ticker === t.ticker && b.status === 'open'))) continue
    const meta = clockOf(t)
    const booked = bookFill(next, {
      tape: t.tape,
      ticker: t.ticker,
      clock: meta.clock,
      closeAt: meta.closeAt,
      side: t.side,
      count: t.contracts,
      ask: meta.ask,
      orderId: t.orderId,
    })
    if (booked.ok) next = booked.state
  }
  return next
}

export function mergeSettlementEventsToBook(
  state: FinanceState,
  events: Array<{ tape: TapeId; ticker: string; win: boolean; at: number; spent?: number; pnl?: number }>,
): FinanceState {
  const have = new Set(state.bets.map((b) => b.ticker))
  const extra: BookedBet[] = []
  for (const e of events) {
    if (have.has(e.ticker)) continue
    have.add(e.ticker)
    extra.push({
      betId: `kalshi:${e.ticker}`,
      tape: e.tape,
      ticker: e.ticker,
      clock: '',
      closeAt: e.at,
      side: e.win ? 'up' : 'down',
      count: 1,
      ask: 50,
      spent: e.spent ?? 0,
      orderId: `settled-${e.ticker}`.slice(0, 48),
      status: 'settled',
      pnl: e.pnl ?? (e.win ? 0 : 0),
      filledAt: e.at,
      settledAt: e.at,
      kind: 'live',
    })
  }
  if (!extra.length) return state
  return saveFinance({ ...state, bets: [...state.bets, ...extra] })
}

function listFromPayload(raw: unknown, keys: string[]) {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const nested = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null
  for (const key of keys) {
    if (Array.isArray(o[key])) return o[key] as Record<string, unknown>[]
    if (nested && Array.isArray(nested[key])) return nested[key] as Record<string, unknown>[]
  }
  return []
}

function kalshiAt(row: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const raw = row[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw
    const parsed = Date.parse(String(raw ?? ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function dollarsFrom(row: Record<string, unknown>, dollarKeys: string[], centKeys: string[] = []) {
  for (const key of dollarKeys) {
    const n = num(row[key])
    if (n != null) return Number.isInteger(n) && Math.abs(n) >= 1000 ? n / 100 : n
  }
  for (const key of centKeys) {
    const n = num(row[key])
    if (n != null) return n / 100
  }
  return 0
}

function fillPriceDollars(row: Record<string, unknown>, dollarKey: string, centKey: string) {
  const d = num(row[dollarKey])
  if (d != null) {
    if (Number.isInteger(d) && d >= 1 && d <= 99) return d / 100
    return d
  }
  const c = num(row[centKey])
  return c != null ? c / 100 : 0
}

function fillSide(row: Record<string, unknown>): 'up' | 'down' {
  const outcome = String(row.outcome_side ?? row.side ?? '').toLowerCase()
  if (outcome === 'no') return 'down'
  if (outcome === 'yes') return 'up'
  const book = String(row.book_side ?? '').toLowerCase()
  if (book === 'ask') return 'down'
  return 'up'
}

export function betsFromKalshiFills(raw: unknown, fromMs = 0): BookedBet[] {
  const groups = new Map<
    string,
    { tape: TapeId; ticker: string; upSpent: number; downSpent: number; upCount: number; downCount: number; filledAt: number; orderId: string }
  >()
  for (const row of listFromPayload(raw, ['fills'])) {
    if (!row || typeof row !== 'object') continue
    const ticker = String(row.ticker ?? row.market_ticker ?? '')
    const tape = seriesToTape(ticker)
    if (!tape) continue
    const at = kalshiAt(row, ['created_time', 'ts', 'created_ts'], 0)
    if (at && at < fromMs) continue
    const side = fillSide(row)
    const count = Math.abs(num(row.count_fp) ?? num(row.count) ?? 0)
    const yesPx = fillPriceDollars(row, 'yes_price_dollars', 'yes_price')
    const noPx = fillPriceDollars(row, 'no_price_dollars', 'no_price')
    const px = side === 'up' ? yesPx || noPx : noPx || yesPx
    const spent = Math.round(count * px * 100) / 100
    const orderId = String(row.order_id ?? row.fill_id ?? row.trade_id ?? `fill-${ticker}`).trim()
    const cur = groups.get(ticker) ?? {
      tape,
      ticker,
      upSpent: 0,
      downSpent: 0,
      upCount: 0,
      downCount: 0,
      filledAt: at || Date.now(),
      orderId,
    }
    if (side === 'up') {
      cur.upSpent += spent
      cur.upCount += count
    } else {
      cur.downSpent += spent
      cur.downCount += count
    }
    if (at && at < cur.filledAt) cur.filledAt = at
    if (isRealOrderId(orderId)) cur.orderId = orderId
    groups.set(ticker, cur)
  }
  const out: BookedBet[] = []
  for (const g of groups.values()) {
    const side: 'up' | 'down' = g.upSpent >= g.downSpent ? 'up' : 'down'
    const spent = Math.round((g.upSpent + g.downSpent) * 100) / 100
    const count = Math.max(1, Math.round(side === 'up' ? g.upCount : g.downCount) || 1)
    const ask = count > 0 ? Math.round(((side === 'up' ? g.upSpent : g.downSpent) / count) * 100) : 50
    out.push({
      betId: `kalshi:${g.ticker}`,
      tape: g.tape,
      ticker: g.ticker,
      clock: clockFromTicker(g.ticker),
      closeAt: 0,
      side,
      count,
      ask: Number.isFinite(ask) && ask > 0 ? ask : 50,
      spent,
      orderId: isRealOrderId(g.orderId) ? g.orderId : `fill-${g.ticker}`.slice(0, 48),
      status: 'open',
      pnl: null,
      filledAt: g.filledAt,
      settledAt: null,
      kind: 'live',
    })
  }
  return out
}

export function betsFromKalshiSettlements(raw: unknown, fromMs = 0, now = Date.now()): BookedBet[] {
  return eventsFromKalshiSettlements(raw, now, fromMs).map((e) => ({
    betId: `kalshi:${e.ticker}`,
    tape: e.tape,
    ticker: e.ticker,
    clock: clockFromTicker(e.ticker),
    closeAt: e.at,
    side: e.win ? ('up' as const) : ('down' as const),
    count: 1,
    ask: 50,
    spent: e.spent ?? 0,
    orderId: `settled-${e.ticker}`.slice(0, 48),
    status: 'settled' as const,
    pnl: e.pnl ?? (e.win ? 0 : 0),
    filledAt: e.at,
    settledAt: e.at,
    kind: 'live' as const,
  }))
}

export function betsFromKalshiPositions(raw: unknown, fromMs = 0): BookedBet[] {
  const out: BookedBet[] = []
  for (const row of listFromPayload(raw, ['market_positions', 'positions'])) {
    if (!row || typeof row !== 'object') continue
    const ticker = String(row.ticker ?? '')
    const tape = seriesToTape(ticker)
    if (!tape) continue
    const pos = num(row.position_fp) ?? num(row.position) ?? 0
    if (pos === 0) continue
    const at = kalshiAt(row, ['last_updated_ts', 'updated_ts', 'ts'], Date.now())
    if (at < fromMs) continue
    const spent = dollarsFrom(row, ['market_exposure_dollars', 'total_traded_dollars'], ['market_exposure', 'total_traded'])
    const count = Math.max(1, Math.round(Math.abs(pos)))
    out.push({
      betId: `kalshi:${ticker}`,
      tape,
      ticker,
      clock: clockFromTicker(ticker),
      closeAt: 0,
      side: pos < 0 ? 'down' : 'up',
      count,
      ask: count > 0 && spent > 0 ? Math.round((spent / count) * 100) : 50,
      spent: Math.round(spent * 100) / 100,
      orderId: `pos-${ticker}`.slice(0, 48),
      status: 'open',
      pnl: null,
      filledAt: at,
      settledAt: null,
      kind: 'live',
    })
  }
  return out
}

export function mergeKalshiHistoryToBook(
  state: FinanceState,
  input: { fills?: unknown; settlements?: unknown; positions?: unknown; fromMs?: number },
  now = Date.now(),
): FinanceState {
  const fromMs = Number.isFinite(input.fromMs) ? Number(input.fromMs) : 0
  const byTicker = new Map<string, BookedBet>()
  for (const b of betsFromKalshiSettlements(input.settlements, fromMs, now)) byTicker.set(b.ticker, b)
  for (const b of betsFromKalshiFills(input.fills, fromMs)) {
    const cur = byTicker.get(b.ticker)
    if (!cur) {
      byTicker.set(b.ticker, b)
      continue
    }
    byTicker.set(b.ticker, {
      ...cur,
      side: b.side,
      count: b.count || cur.count,
      ask: b.ask || cur.ask,
      spent: cur.spent || b.spent,
      orderId: isRealOrderId(b.orderId) ? b.orderId : cur.orderId,
      filledAt: Math.min(cur.filledAt || b.filledAt, b.filledAt || cur.filledAt),
      kind: 'live',
    })
  }
  for (const b of betsFromKalshiPositions(input.positions, fromMs)) {
    if (!byTicker.has(b.ticker)) byTicker.set(b.ticker, b)
  }
  const kalshi = [...byTicker.values()]
  if (!kalshi.length) return state
  const taken = new Set(kalshi.map((b) => b.ticker))
  const local = state.bets.filter((b) => isPaperBet(b) || (!taken.has(b.ticker) && !String(b.betId).startsWith('kalshi:')))
  return saveFinance({ ...state, bets: [...local, ...kalshi] })
}

export function settleBook(
  state: FinanceState,
  settled: Array<{ ticker: string; result: 'up' | 'down'; closeAt?: number }>,
  now = Date.now(),
) {
  let changed = false
  const bets = state.bets.map((b) => {
    if (b.status !== 'open') return b
    const s = settled.find((row) => row.ticker === b.ticker)
    if (!s) return b
    changed = true
    const win = (b.side === 'up' && s.result === 'up') || (b.side === 'down' && s.result === 'down')
    const payout = win ? b.count : 0
    return {
      ...b,
      status: 'settled' as const,
      pnl: Math.round((payout - b.spent) * 100) / 100,
      settledAt: s.closeAt && s.closeAt > 0 ? s.closeAt : now,
    }
  })
  return changed ? saveFinance({ ...state, bets }) : state
}

export function engageKill(state: FinanceState) {
  return saveFinance({ ...state, killed: true })
}

export function clearKill(state: FinanceState) {
  return saveFinance({ ...state, killed: false })
}

export function recipeLine(id: TapeId) {
  const r = GOLD_RECIPES[id]
  return `${TAPE_META[id].label} ×${r.contracts} · ${r.armFromMin}–${r.armToMin} / $${r.through} / ${r.centLo}–${r.centHi}¢`
}

const RECIPE_KEYS = ['contracts', 'armFromMin', 'armToMin', 'through', 'centLo', 'centHi'] as const

export function isRecipeRetune(patch: Partial<TapeRecipe>) {
  return RECIPE_KEYS.some((k) => k in patch)
}

/** Session is chasing if KILL is on or today's booked P/L is red. */
export function chasingLosses(state: FinanceState, now = Date.now()) {
  if (state.killed) return true
  return dailyRealizedPnl(state, now) < 0
}

export function recipeRetuneGate(state: FinanceState, patch: Partial<TapeRecipe>, now = Date.now()): Gate {
  if (!isRecipeRetune(patch)) return { ok: true }
  if (state.killed) return { ok: false, reason: 'KILL on — recipe lock' }
  if (chasingLosses(state, now)) {
    return { ok: false, reason: 'Soft FAIL mid-session recipe retune to chase losses' }
  }
  return { ok: true }
}

export function financeSendsOrders(): never {
  throw new Error('Soft FAIL: finance manager must not send Kalshi orders')
}
