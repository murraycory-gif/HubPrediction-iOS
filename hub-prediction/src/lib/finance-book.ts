import { contractsFromCash, ticketCost, SIZE_CASH_RECIPE } from './size-cash'

export const FINANCE_KEY = 'hub.desk.finance.v1'
export const PAPER_START_CASH = 10_000
export const PAPER_CASH_FLOOR = 50
export const LIVE_FLOOR_MIN = 150
export const LIVE_FLOOR_PCT = 0.2

export type DeskMode = 'paper' | 'live'
export type BetMode = 'paper' | 'live'
export type BetSource = 'bot' | 'manual'
export type BetStatus = 'open' | 'settled' | 'void'
export type BetSide = 'up' | 'down'
export type PlaceBlock = 'ok' | 'kill' | 'floor' | 'no-size' | 'no-live' | 'no-keys'

export type DepositEvent = {
  deposit_id: string
  at: number
  amount: number
  note: string
  kind: 'deposit' | 'withdrawal'
}

export type BetEvent = {
  bet_id: string
  at: number
  ticker: string
  side: BetSide
  count: number
  ask: number
  mode: BetMode
  source: BetSource
  cost: number
  fee: number
  status: BetStatus
  realized_pnl: number | null
}

export type FinanceBook = {
  version: 1
  mode: DeskMode
  killed: boolean
  killedAt: number | null
  paperCash: number
  startCash: number
  deposits: DepositEvent[]
  bets: BetEvent[]
}

export function emptyFinanceBook(): FinanceBook {
  return {
    version: 1,
    mode: 'paper',
    killed: false,
    killedAt: null,
    paperCash: PAPER_START_CASH,
    startCash: PAPER_START_CASH,
    deposits: [],
    bets: [],
  }
}

function nid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function asSide(v: unknown): BetSide | null {
  return v === 'up' || v === 'down' ? v : null
}

function asMode(v: unknown): DeskMode {
  return v === 'live' ? 'live' : 'paper'
}

function asBetMode(v: unknown): BetMode {
  return v === 'live' ? 'live' : 'paper'
}

export function hydrateFinanceBook(raw: unknown): FinanceBook {
  const base = emptyFinanceBook()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<FinanceBook>
  const deposits = Array.isArray(o.deposits)
    ? o.deposits.filter((d): d is DepositEvent => {
        return (
          !!d &&
          typeof d.deposit_id === 'string' &&
          (d.kind === 'deposit' || d.kind === 'withdrawal') &&
          Number.isFinite(d.amount)
        )
      })
    : []
  const bets = Array.isArray(o.bets)
    ? o.bets.filter((b): b is BetEvent => {
        return (
          !!b &&
          typeof b.bet_id === 'string' &&
          typeof b.ticker === 'string' &&
          asSide(b.side) != null &&
          Number.isFinite(b.count) &&
          Number.isFinite(b.ask)
        )
      })
    : []
  const paperCash = Number.isFinite(o.paperCash) ? money(Number(o.paperCash)) : PAPER_START_CASH
  return {
    version: 1,
    mode: asMode(o.mode),
    killed: o.killed === true,
    killedAt: Number.isFinite(o.killedAt) ? Number(o.killedAt) : null,
    paperCash,
    startCash: PAPER_START_CASH,
    deposits,
    bets,
  }
}

export function loadFinanceBook(): FinanceBook {
  if (typeof localStorage === 'undefined') return emptyFinanceBook()
  try {
    const raw = localStorage.getItem(FINANCE_KEY)
    return hydrateFinanceBook(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyFinanceBook()
  }
}

export function saveFinanceBook(book: FinanceBook): FinanceBook {
  const next = hydrateFinanceBook(book)
  if (typeof localStorage === 'undefined') return next
  try {
    localStorage.setItem(FINANCE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function cumulativeDeposits(book: FinanceBook) {
  return money(book.deposits.filter((d) => d.kind === 'deposit').reduce((s, d) => s + d.amount, 0))
}

export function cumulativeWithdrawals(book: FinanceBook) {
  return money(book.deposits.filter((d) => d.kind === 'withdrawal').reduce((s, d) => s + d.amount, 0))
}

export function openRisk(book: FinanceBook, mode?: BetMode) {
  return money(
    book.bets
      .filter((b) => b.status === 'open' && (mode ? b.mode === mode : true))
      .reduce((s, b) => s + b.cost + b.fee, 0),
  )
}

export function workingCash(book: FinanceBook, liveCash: number | null | undefined) {
  if (book.mode === 'live') {
    return Number.isFinite(liveCash ?? NaN) ? money(liveCash as number) : 0
  }
  return money(book.paperCash)
}

/** Soft KEEP: net = ending equity − deposits + withdrawals. Soft FAIL cash − $10k start. */
export function pnlVsDeposits(book: FinanceBook, liveCash: number | null | undefined) {
  return money(workingCash(book, liveCash) - cumulativeDeposits(book) + cumulativeWithdrawals(book))
}

/** Soft KEEP paper $50; live max($150, 20% deposits). Soft FAIL $25 / 10%. */
export function cashFloor(book: FinanceBook) {
  if (book.mode === 'live') {
    return money(Math.max(LIVE_FLOOR_MIN, cumulativeDeposits(book) * LIVE_FLOOR_PCT))
  }
  return PAPER_CASH_FLOOR
}

export function placeGate(
  book: FinanceBook,
  cost: number,
  liveCash?: number | null,
): { ok: true; code: 'ok' } | { ok: false; code: PlaceBlock; reason: string } {
  if (book.killed) {
    return { ok: false, code: 'kill', reason: 'KILL on — Place blocked until cleared' }
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false, code: 'no-size', reason: 'SizeCash size is 0' }
  }
  const cash = workingCash(book, liveCash)
  const floor = cashFloor(book)
  if (cash - cost < floor - 1e-9) {
    return { ok: false, code: 'floor', reason: `Floor ${floor.toFixed(2)} blocks Place` }
  }
  return { ok: true, code: 'ok' }
}

export function suggestedSize(book: FinanceBook, askCents: number, pWin: number, liveCash?: number | null) {
  return contractsFromCash(workingCash(book, liveCash), askCents, pWin, cashFloor(book))
}

export function logDeposit(book: FinanceBook, amount: number, note = 'deposit logged') {
  if (!Number.isFinite(amount) || amount <= 0) return saveFinanceBook(book)
  const event: DepositEvent = {
    deposit_id: nid('dep'),
    at: Date.now(),
    amount: money(amount),
    note: note.trim() || 'deposit logged',
    kind: 'deposit',
  }
  return saveFinanceBook({
    ...book,
    paperCash: money(book.paperCash + event.amount),
    deposits: [...book.deposits, event],
  })
}

export function logWithdrawal(book: FinanceBook, amount: number, note = 'withdrawal logged') {
  if (!Number.isFinite(amount) || amount <= 0) return saveFinanceBook(book)
  const event: DepositEvent = {
    deposit_id: nid('wd'),
    at: Date.now(),
    amount: money(amount),
    note: note.trim() || 'withdrawal logged',
    kind: 'withdrawal',
  }
  return saveFinanceBook({
    ...book,
    paperCash: money(book.paperCash - event.amount),
    deposits: [...book.deposits, event],
  })
}

export type BookBetInput = {
  ticker: string
  side: BetSide
  count: number
  ask: number
  mode: BetMode
  source: BetSource
  fee?: number
  liveCash?: number | null
}

export function bookBet(
  book: FinanceBook,
  input: BookBetInput,
): { ok: true; book: FinanceBook; bet: BetEvent } | { ok: false; book: FinanceBook; code: PlaceBlock; reason: string } {
  const fee = Number.isFinite(input.fee) ? money(input.fee as number) : 0
  const count = Math.max(0, Math.min(SIZE_CASH_RECIPE.maxContracts, Math.round(input.count)))
  const cost = ticketCost(count, input.ask, 0)
  const gate = placeGate(book, cost + fee, input.liveCash)
  if (!gate.ok) return { ok: false, book, code: gate.code, reason: gate.reason }
  if (!input.ticker || !asSide(input.side) || count < 1) {
    return { ok: false, book, code: 'no-size', reason: 'SizeCash size is 0' }
  }
  const bet: BetEvent = {
    bet_id: nid('bet'),
    at: Date.now(),
    ticker: input.ticker,
    side: input.side,
    count,
    ask: input.ask,
    mode: asBetMode(input.mode),
    source: input.source === 'bot' ? 'bot' : 'manual',
    cost,
    fee,
    status: 'open',
    realized_pnl: null,
  }
  const next: FinanceBook = {
    ...book,
    paperCash: bet.mode === 'paper' ? money(book.paperCash - cost - fee) : book.paperCash,
    bets: [...book.bets, bet],
  }
  return { ok: true, book: saveFinanceBook(next), bet }
}

/** Fill settle fields once. Never rewrite ticker/side/count/ask/cost. */
export function settleBet(book: FinanceBook, betId: string, result: BetSide) {
  const idx = book.bets.findIndex((b) => b.bet_id === betId)
  if (idx < 0) return saveFinanceBook(book)
  const bet = book.bets[idx]
  if (bet.status !== 'open') return saveFinanceBook(book)
  const win = bet.side === result
  const payout = win ? money(bet.count * 1) : 0
  const realized = money(payout - bet.cost - bet.fee)
  const settled: BetEvent = { ...bet, status: 'settled', realized_pnl: realized }
  const bets = book.bets.slice()
  bets[idx] = settled
  return saveFinanceBook({
    ...book,
    paperCash: bet.mode === 'paper' ? money(book.paperCash + payout) : book.paperCash,
    bets,
  })
}

export function engageKill(book: FinanceBook) {
  return saveFinanceBook({
    ...book,
    killed: true,
    killedAt: Date.now(),
  })
}

export function clearKill(book: FinanceBook) {
  return saveFinanceBook({
    ...book,
    killed: false,
    killedAt: null,
  })
}

export function setPaperMode(book: FinanceBook) {
  return saveFinanceBook({ ...book, mode: 'paper' })
}

/** Soft FAIL silent Paper→Live. Caller must have already confirmed + keys. */
export function confirmLiveMode(book: FinanceBook, hasKeys: boolean) {
  if (!hasKeys) {
    return { ok: false as const, book: saveFinanceBook({ ...book, mode: 'paper' }), reason: 'LIVE needs keys' }
  }
  return { ok: true as const, book: saveFinanceBook({ ...book, mode: 'live' }) }
}

export function defaultDeskMode(): DeskMode {
  return 'paper'
}

export { SIZE_CASH_RECIPE }
