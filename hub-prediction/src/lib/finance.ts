import { deskStorage } from './desk-storage'
import { pushHostDesk } from './desk-persist'
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
  isTapeClock,
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
export const HIT_FLOOR = 83

export type BetKind = 'live' | 'paper' | 'hist'

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

export function isImportedKalshiRow(b: { betId?: unknown; orderId?: unknown }) {
  const id = typeof b.betId === 'string' ? b.betId : ''
  const ord = typeof b.orderId === 'string' ? b.orderId : ''
  if (id.startsWith('kalshi:')) return true
  if (/^(settled|pos|fill)-/i.test(ord)) return true
  return false
}

/** This desk V2 placeContract = LIVE. deskfill = PAPER. Imported kalshi:* = HIST. Soft FAIL kind live on hydrate. */
export function betKind(b: { kind?: unknown; orderId?: unknown; betId?: unknown }): BetKind {
  if (isPaperOrderId(b.orderId) || (typeof b.betId === 'string' && /^paper:/i.test(b.betId))) return 'paper'
  if (isImportedKalshiRow(b) || b.kind === 'hist') return 'hist'
  if (b.kind === 'paper') return 'paper'
  if (b.kind === 'live') return 'live'
  if (typeof b.betId === 'string' && b.betId.startsWith('bet_') && isRealOrderId(b.orderId)) return 'live'
  return 'paper'
}

/** This desk POSTed the order. Imported Kalshi history is HIST — Soft FAIL MODE LIVE. */
export function isDeskLiveBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return betKind(b) === 'live'
}

export function isPaperBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return betKind(b) === 'paper'
}

export function isHistBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return betKind(b) === 'hist'
}

export function isLiveBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  return betKind(b) === 'live'
}

export function isKalshiRecordedBet(b: { kind?: unknown; orderId?: unknown; betId?: unknown }) {
  const kind = betKind(b)
  return kind === 'live' || kind === 'hist'
}

/** Only this-desk LIVE settled W/L move Kalshi cash. PAPER / HIST do not. */
export function cashUpdateForBet(b: {
  kind?: unknown
  orderId?: unknown
  betId?: unknown
  status: 'open' | 'settled'
  pnl: number | null
}): { kind: 'paper' | 'hist' | 'open' | 'live'; amount: number | null } {
  if (isHistBet(b)) return { kind: 'hist', amount: null }
  if (isPaperBet(b)) return { kind: 'paper', amount: null }
  if (!isLiveBet(b) || b.status !== 'settled' || b.pnl == null) return { kind: 'open', amount: null }
  return { kind: 'live', amount: b.pnl }
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

export function betStamp(b: { settledAt?: number | null; closeAt?: number; filledAt?: number }) {
  return Number(b.settledAt) || Number(b.closeAt) || Number(b.filledAt) || 0
}

/**
 * Running Kalshi cash after this-desk LIVE settles only.
 * PAPER / HIST rows are N/A. Soft FAIL a fake cash walk on imported or paper.
 */
export function cashAfterEachBet(
  bets: Array<{
    betId: string
    kind?: unknown
    orderId?: unknown
    status: 'open' | 'settled'
    pnl: number | null
    settledAt?: number | null
    closeAt?: number
    filledAt?: number
  }>,
  currentCash: number | null | undefined,
  deposits: number | null | undefined = null,
): Record<string, number | null> {
  const ordered = [...bets].sort((a, b) => {
    const dt = betStamp(a) - betStamp(b)
    return dt !== 0 ? dt : String(a.betId).localeCompare(String(b.betId))
  })
  const realized = ordered.reduce((s, b) => {
    if (isLiveBet(b) && b.status === 'settled' && b.pnl != null) return s + b.pnl
    return s
  }, 0)
  let cursor: number | null = null
  if (Number.isFinite(currentCash ?? NaN)) cursor = money(Number(currentCash) - realized)
  else if (Number.isFinite(deposits ?? NaN)) cursor = money(Number(deposits))
  const out: Record<string, number | null> = {}
  for (const b of ordered) {
    if (!isLiveBet(b)) {
      out[b.betId] = null
      continue
    }
    if (cursor != null && b.status === 'settled' && b.pnl != null) {
      cursor = money(cursor + b.pnl)
    }
    out[b.betId] = cursor
  }
  return out
}

export function betWindowMs(b: { clock?: string; ticker?: string }) {
  return windowMsForClock(b.clock || '') || windowMsForClock(b.ticker || '')
}

export function betClockLabel(b: { clock?: string; ticker?: string }) {
  const fromTicker = clockFromTicker(b.ticker || '')
  if (fromTicker) return fromTicker
  if (isTapeClock(b.clock)) return b.clock
  return clockFromTicker(b.clock || '') || '—'
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
          if (!b || !isTapeId(b.tape) || (b.side !== 'up' && b.side !== 'down') || typeof b.ticker !== 'string') {
            return false
          }
          const id = typeof b.betId === 'string' ? b.betId : ''
          const ord = typeof b.orderId === 'string' ? b.orderId : ''
          return (
            isRealOrderId(ord) ||
            id.startsWith('kalshi:') ||
            id.startsWith('paper:') ||
            id.startsWith('bet_') ||
            /^deskfill-/i.test(ord)
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
  pushHostDesk({ finance: next })
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

export function hitFromMs(now = Date.now(), fromMs?: number) {
  if (fromMs != null && Number.isFinite(Number(fromMs)) && Number(fromMs) > 0) return Number(fromMs)
  return now - 24 * 60 * 60 * 1000
}

export function last24hBets(
  state: FinanceState,
  hits: {
    tapes: Record<TapeId, { w: number; l: number }>
    events?: Array<{ tape: TapeId; ticker?: string; win?: boolean; at: number; spent?: number; pnl?: number }>
  },
  now = Date.now(),
  tapes: readonly TapeId[] = TAPE_IDS,
  fromMs?: number,
) {
  const allow = new Set(hydrateBetsFilter([...tapes]))
  const from = hitFromMs(now, fromMs)
  const recent = state.bets.filter((b) => allow.has(b.tape) && betStamp(b) >= from)
  const settled = recent.filter((b) => b.status === 'settled')
  const liveRecent = recent.filter((b) => isLiveBet(b))
  const liveSettled = settled.filter((b) => isLiveBet(b))
  const open = recent.filter((b) => b.status === 'open').length
  const selected = TAPE_IDS.filter((id) => allow.has(id))
  const cells = selected.map((id) => tapeHitCell(id, hits, state.bets, now, from))
  const w = cells.reduce((s, c) => s + c.w, 0)
  const l = cells.reduce((s, c) => s + c.l, 0)
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

function betWon(b: { pnl: number | null; win?: boolean }): boolean | null {
  if (b.pnl != null && b.pnl !== 0) return b.pnl > 0
  if (typeof b.win === 'boolean') return b.win
  return null
}

/**
 * Per-tape Hit percent. Union latch events + booked settled in the same window as the bets strip.
 * A stale 0W–2L latch must not hide a fuller Kalshi book.
 */
export function tapeHitCell(
  id: TapeId,
  hits: {
    tapes: Record<TapeId, { w: number; l: number }>
    events?: Array<{ tape: TapeId; ticker?: string; win?: boolean; at: number; pnl?: number }>
  },
  bets: Array<{
    tape: TapeId
    ticker?: string
    status: 'open' | 'settled'
    pnl: number | null
    settledAt?: number | null
    closeAt?: number
    filledAt?: number
    kind?: unknown
    orderId?: unknown
    betId?: unknown
  }>,
  now = Date.now(),
  fromMs?: number,
) {
  const from = hitFromMs(now, fromMs)
  const byTicker = new Map<string, boolean>()
  for (const e of hits.events ?? []) {
    if (e.tape !== id || !e.ticker || e.at < from) continue
    if (typeof e.win === 'boolean') byTicker.set(e.ticker, e.win)
    else if (e.pnl != null && e.pnl !== 0) byTicker.set(e.ticker, e.pnl > 0)
  }
  for (const b of bets) {
    if (isHistBet(b)) continue
    if (b.tape !== id || b.status !== 'settled' || betStamp(b) < from) continue
    const ticker = typeof b.ticker === 'string' && b.ticker ? b.ticker : ''
    if (!ticker || byTicker.has(ticker)) continue
    const won = betWon(b)
    if (won == null) continue
    byTicker.set(ticker, won)
  }
  let w = 0
  let l = 0
  for (const win of byTicker.values()) {
    if (win) w += 1
    else l += 1
  }
  const unionN = w + l
  const cell = hits.tapes[id] ?? { w: 0, l: 0 }
  const cellN = cell.w + cell.l
  if (unionN === 0 && cellN > 0) return cell
  if (!(hits.events && hits.events.length) && cellN > unionN) return cell
  return { w, l }
}

function dayStartMs(now: number) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

export function dailyRealizedPnl(state: FinanceState, now = Date.now()) {
  const from = dayStartMs(now)
  return Math.round(
    state.bets
      .filter((b) => isLiveBet(b) && b.status === 'settled' && b.settledAt != null && b.settledAt >= from && b.pnl != null)
      .reduce((s, b) => s + (b.pnl ?? 0), 0) * 100,
  ) / 100
}

/** Today’s desk-posted live P/L. Imported Kalshi history must not sit the bot. */
export function deskDailyRealizedPnl(state: FinanceState, now = Date.now()) {
  const from = dayStartMs(now)
  return Math.round(
    state.bets
      .filter((b) => isDeskLiveBet(b) && b.status === 'settled' && b.settledAt != null && b.settledAt >= from && b.pnl != null)
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

/** HIST imports do not occupy the desk-fill slot. Paper deskfill still books beside them. */
export function openDeskFillOnTicker(state: FinanceState, ticker: string) {
  return state.bets.some((b) => b.ticker === ticker && b.status === 'open' && betKind(b) !== 'hist')
}

export type Gate = { ok: true } | { ok: false; reason: string }

export function liveArmGate(
  state: FinanceState,
  opts: { cash: number | null; deposits: number | null; hasKeys: boolean },
  now = Date.now(),
): Gate {
  if (state.killed) return { ok: false, reason: 'KILL on — Place blocked until cleared' }
  if (!opts.hasKeys) return { ok: false, reason: 'LIVE needs keys' }
  const settled = state.bets.filter((b) => b.status === 'settled').length
  if (!paper48hPassed(state, now) && settled < 12) {
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

/** Instant bot call. Bot ON + Live cash ON → live POST. Soft FAIL liveBets. Soft FAIL paper when Live cash ON. */
export function liveBotCall(opts: {
  tabOpen: boolean
  killed: boolean
  botOn: boolean
  liveCash: boolean
  rehabPaper: boolean
  tradingActive: boolean
  inArm: boolean
  askOk: boolean
  lean: 'up' | 'down' | 'sit'
  hitOk: boolean
  fresh?: boolean
}): 'live' | 'paper' | 'sit' {
  if (
    !opts.tabOpen ||
    opts.killed ||
    !opts.botOn ||
    opts.tradingActive === false ||
    !opts.inArm ||
    !opts.askOk ||
    opts.lean === 'sit'
  ) {
    return 'sit'
  }
  if (opts.rehabPaper) return 'paper'
  if (opts.liveCash === true) {
    if (!opts.hitOk) return 'sit'
    return 'live'
  }
  return 'paper'
}

/** Why this tape is sitting / paper / live — Live cash ON is not silent. Soft FAIL master Live copy. */
export function tapeBotNote(opts: {
  botOn: boolean
  liveCash: boolean
  rehabPaper: boolean
  hostCreds: boolean
  tradingActive: boolean
  inArm: boolean
  askOk: boolean
  lean: 'up' | 'down' | 'sit'
  hitOk: boolean
  armFromMin: number
  armToMin: number
  stale?: boolean
}) {
  if (!opts.botOn) return 'Bot OFF'
  if (opts.rehabPaper) return 'Live cash HALT — paper rehab, not sent to Kalshi'
  if (opts.tradingActive === false) return 'Kalshi window closed — sit'
  if (opts.stale) return 'STALE — paper only'
  if (!opts.liveCash) return 'Live cash OFF — paper only, not sent to Kalshi'
  if (!opts.inArm) return `Sit — arm ${opts.armFromMin}–${opts.armToMin} min`
  if (opts.lean === 'sit') return 'Sit — no through / hug'
  if (!opts.askOk) return 'Sit — ask out of band'
  if (!opts.hitOk) return `Sit — under ${HIT_FLOOR}% goal`
  if (!opts.hostCreds) return 'Kalshi keys missing on this PC — cannot POST'
  return 'Live cash ON — next through posts to Kalshi'
}

/** Sit when the tape is under the 83% goal after enough settled results. */
export function hitFloorGate(w: number, l: number): Gate {
  const n = Math.max(0, Math.round(w) + Math.round(l))
  if (n < 4) return { ok: true }
  const pct = Math.round((Math.max(0, w) / n) * 100)
  if (pct < HIT_FLOOR) return { ok: false, reason: `${pct}% < ${HIT_FLOOR}% goal — sit` }
  return { ok: true }
}

/** Last N desk-live settled W–L on one tape. Soft FAIL lifetime hit lock. */
export function recentLiveTapeWL(
  bets: Array<{
    tape: TapeId
    status: 'open' | 'settled'
    pnl: number | null
    settledAt?: number | null
    closeAt?: number
    filledAt?: number
    kind?: unknown
    orderId?: unknown
    betId?: unknown
  }>,
  id: TapeId,
  n = 12,
) {
  const mine = bets
    .filter((b) => b.tape === id && b.status === 'settled' && b.pnl != null && isLiveBet(b))
    .sort((a, b) => betStamp(b) - betStamp(a))
    .slice(0, Math.max(1, n))
  const w = mine.filter((b) => (b.pnl ?? 0) > 0).length
  const l = mine.filter((b) => (b.pnl ?? 0) < 0).length
  return { w, l, n: w + l }
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
  const daily = deskDailyRealizedPnl(state, now)
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
  if (openDeskFillOnTicker(state, input.ticker)) {
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
    if (next.bets.some((b) => b.orderId === t.orderId)) continue
    if (openDeskFillOnTicker(next, t.ticker)) continue
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
      pnl: e.pnl ?? (e.win ? 0.01 : -0.01),
      filledAt: e.at,
      settledAt: e.at,
      kind: 'hist',
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
      kind: 'hist',
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
    pnl: e.pnl ?? (e.win ? 0.01 : -0.01),
    filledAt: e.at,
    settledAt: e.at,
    kind: 'hist' as const,
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
      kind: 'hist',
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
      kind: betKind(b),
    })
  }
  for (const b of betsFromKalshiPositions(input.positions, fromMs)) {
    if (!byTicker.has(b.ticker)) byTicker.set(b.ticker, b)
  }
  const kalshi = [...byTicker.values()].map((b) => ({ ...b, kind: betKind(b) }))
  if (!kalshi.length) return state
  const desk = state.bets.filter((b) => !isImportedKalshiRow(b))
  const imported = state.bets.filter((b) => isImportedKalshiRow(b))
  const deskTickers = new Set(desk.map((b) => b.ticker))
  const deskNext = desk.map((b) => {
    const k = kalshi.find((row) => row.ticker === b.ticker)
    if (!k) return { ...b, kind: betKind(b) }
    if (b.status === 'settled') return { ...b, kind: betKind(b) }
    return {
      ...b,
      status: k.status,
      pnl: b.pnl ?? k.pnl,
      settledAt: b.settledAt ?? k.settledAt,
      spent: b.spent || k.spent,
      kind: betKind(b),
    }
  })
  const extra = kalshi.filter((b) => !deskTickers.has(b.ticker))
  const incomingTickers = new Set(kalshi.map((b) => b.ticker))
  const keptImported = imported.filter((b) => !incomingTickers.has(b.ticker) && !deskTickers.has(b.ticker))
  return saveFinance({ ...state, bets: [...deskNext, ...extra, ...keptImported] })
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
  return deskDailyRealizedPnl(state, now) < 0
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
