import { deskStorage } from './desk-storage'
import { ticketCost } from './size-cash'
import {
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  isRealOrderId,
  isTapeId,
  type DeskTicket,
  type TapeId,
  type TapeRecipe,
} from './tapes'

export const FINANCE_KEY = 'hub.desk.finance.v1'
export const BETS_FILTER_KEY = 'hub.desk.betsFilter.v1'
export const PAPER_CASH_FLOOR = 50
export const LIVE_FLOOR_MIN = 150
export const LIVE_FLOOR_PCT = 0.2
export const ASK_CAP = 80
export const PAPER_HOURS = 48
export const DAILY_PNL_FLOOR_PAPER = -50

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
    ? o.bets.filter((b): b is BookedBet => {
        return (
          !!b &&
          isTapeId(b.tape) &&
          isRealOrderId(b.orderId) &&
          (b.side === 'up' || b.side === 'down') &&
          typeof b.ticker === 'string'
        )
      })
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
    state.bets.filter((b) => b.status === 'settled' && b.pnl != null).reduce((s, b) => s + (b.pnl ?? 0), 0) * 100,
  ) / 100
}

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

export function loadBetsFilter(): TapeId[] {
  const ls = deskStorage()
  if (!ls) return allBetsFilter()
  try {
    const raw = ls.getItem(BETS_FILTER_KEY)
    return hydrateBetsFilter(raw ? JSON.parse(raw) : null)
  } catch {
    return allBetsFilter()
  }
}

export function saveBetsFilter(ids: readonly TapeId[]): TapeId[] {
  const next = hydrateBetsFilter([...ids])
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(BETS_FILTER_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

/** All stays visible. Empty selection Soft FAIL — snap back to All. Last tape stays on. */
export function toggleBetsFilter(current: readonly TapeId[], chip: 'all' | TapeId): TapeId[] {
  if (chip === 'all') return saveBetsFilter(allBetsFilter())
  if (isAllBetsFilter(current)) return saveBetsFilter([chip])
  if (current.includes(chip)) {
    const next = current.filter((id) => id !== chip)
    return saveBetsFilter(next.length ? next : [chip])
  }
  return saveBetsFilter([...current, chip])
}

export function last24hBets(
  state: FinanceState,
  hits: { tapes: Record<TapeId, { w: number; l: number }> },
  now = Date.now(),
  tapes: readonly TapeId[] = TAPE_IDS,
) {
  const allow = new Set(hydrateBetsFilter([...tapes]))
  const from = now - 24 * 60 * 60 * 1000
  const recent = state.bets.filter((b) => allow.has(b.tape) && (b.filledAt || b.settledAt || 0) >= from)
  const placed = Math.round(recent.reduce((s, b) => s + (Number(b.spent) || 0), 0) * 100) / 100
  const settled = recent.filter((b) => b.status === 'settled')
  const bookW = settled.filter((b) => (b.pnl ?? 0) > 0).length
  const bookL = settled.filter((b) => (b.pnl ?? 0) < 0).length
  const selected = TAPE_IDS.filter((id) => allow.has(id))
  const hitW = selected.reduce((s, id) => s + (hits.tapes[id]?.w ?? 0), 0)
  const hitL = selected.reduce((s, id) => s + (hits.tapes[id]?.l ?? 0), 0)
  const w = hitW + hitL > 0 ? hitW : bookW
  const l = hitW + hitL > 0 ? hitL : bookL
  const pnl = Math.round(settled.reduce((s, b) => s + (b.pnl ?? 0), 0) * 100) / 100
  return { placed, w, l, pnl }
}

export function dailyRealizedPnl(state: FinanceState, now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const from = start.getTime()
  return Math.round(
    state.bets
      .filter((b) => b.status === 'settled' && b.settledAt != null && b.settledAt >= from && b.pnl != null)
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
