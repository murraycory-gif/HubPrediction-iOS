import {
  eventsFromKalshiSettlements,
  seriesToTape,
  type TapeId,
} from './tapes'
import {
  betKind,
  collapseClockBets,
  isLiveBet,
  isPaperBet,
  saveFinance,
  type BookedBet,
  type FinanceState,
} from './finance'

/** After closeAt: poll this often until the Kalshi settlement lands. Soft FAIL a 20–30s drip. */
export const SETTLE_LATCH_MS = 1500
/** Stay on the fast latch this long after close. */
export const SETTLE_LATCH_FOR_MS = 90_000
/** Then back off until give-up. */
export const SETTLE_BACKOFF_MS = 12_000
export const SETTLE_GIVE_UP_MS = 15 * 60_000

export type ClockMarket = {
  ticker: string
  result?: string
  closeTime?: string | number
}

export type ClockSettlePayload = {
  cash?: number | null
  deposits?: unknown
  settlements?: unknown
  fills?: unknown
  positions?: unknown
  markets?: ClockMarket[]
  tickers?: string[]
  fetchedAt?: number
  hostCreds?: boolean
}

export type ClockSettleHit = {
  ticker: string
  tape: TapeId | null
  result?: 'up' | 'down'
  win?: boolean
  spent?: number
  pnl?: number
  at?: number
  fromSettlement: boolean
}

export function settlePollMs(closeAt: number, now = Date.now()): number | false {
  if (!Number.isFinite(closeAt) || closeAt <= 0 || closeAt > now) return false
  const age = now - closeAt
  if (age > SETTLE_GIVE_UP_MS) return false
  if (age <= SETTLE_LATCH_FOR_MS) return SETTLE_LATCH_MS
  return SETTLE_BACKOFF_MS
}

export function marketResultSide(raw: unknown): 'up' | 'down' | null {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'yes' || s === 'up') return 'up'
  if (s === 'no' || s === 'down') return 'down'
  return null
}

/** Open LIVE desk rows whose clock has closed. Soft FAIL paper / HIST. Soft FAIL waiting on reload. */
export function clocksNeedingSettle(
  bets: Array<{
    ticker?: unknown
    status?: unknown
    kind?: unknown
    orderId?: unknown
    betId?: unknown
    closeAt?: unknown
    tape?: unknown
  }>,
  board:
    | {
        tapes?: Partial<
          Record<string, { ticker?: string; closeAt?: number; tradingActive?: boolean } | null>
        >
      }
    | null
    | undefined,
  now = Date.now(),
) {
  const tickers = new Set<string>()
  let minClose = 0
  const noteClose = (ticker: string, closeAt: number) => {
    if (!ticker) return
    tickers.add(ticker)
    if (closeAt > 0 && (!minClose || closeAt < minClose)) minClose = closeAt
  }
  for (const b of bets) {
    if (b.status !== 'open') continue
    if (!isLiveBet(b) || isPaperBet(b)) continue
    const ticker = String(b.ticker ?? '').trim()
    const closeAt = Number(b.closeAt) || 0
    if (ticker && closeAt > 0 && closeAt <= now) noteClose(ticker, closeAt)
  }
  for (const q of Object.values(board?.tapes ?? {})) {
    if (!q?.ticker) continue
    const closeAt = Number(q.closeAt) || 0
    const closed = q.tradingActive === false || (closeAt > 0 && closeAt <= now)
    if (!closed) continue
    const open = bets.some(
      (b) => b.status === 'open' && isLiveBet(b) && String(b.ticker ?? '') === q.ticker,
    )
    if (open) noteClose(q.ticker, closeAt || now)
  }
  const list = [...tickers]
  const polls = list.map((ticker) => {
    const bet = bets.find((b) => String(b.ticker ?? '') === ticker)
    const q = Object.values(board?.tapes ?? {}).find((row) => row?.ticker === ticker)
    return settlePollMs(Number(bet?.closeAt) || Number(q?.closeAt) || minClose || now, now)
  })
  const latchMs = polls.reduce<number | false>((best, ms) => {
    if (ms === false) return best
    if (best === false) return ms
    return Math.min(best, ms)
  }, false)
  return { tickers: list, minTs: minClose || now - 10 * 60_000, latchMs }
}

/** Keep GET /portfolio/balance hot after close — even once the row is WIN/LOSS. Soft FAIL a stale $293.37 latch. */
export function balanceLatchMs(
  bets: Array<{
    status?: unknown
    kind?: unknown
    orderId?: unknown
    betId?: unknown
    closeAt?: unknown
    settledAt?: unknown
  }>,
  board:
    | {
        tapes?: Partial<Record<string, { closeAt?: number; tradingActive?: boolean } | null>>
      }
    | null
    | undefined,
  now = Date.now(),
): number | false {
  let best: number | false = false
  const note = (closeAt: number) => {
    const ms = settlePollMs(closeAt, now)
    if (ms === false) return
    best = best === false ? ms : Math.min(best, ms)
  }
  for (const b of bets) {
    if (isPaperBet(b) || !isLiveBet(b)) continue
    const closeAt = Number(b.closeAt) || Number(b.settledAt) || 0
    if (closeAt > 0) note(closeAt)
  }
  for (const q of Object.values(board?.tapes ?? {})) {
    if (!q) continue
    const closeAt = Number(q.closeAt) || 0
    if (q.tradingActive === false || (closeAt > 0 && closeAt <= now)) note(closeAt || now)
  }
  return best
}

export function readTestClockSettle(): ClockSettlePayload | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { __HUB_CLOCK_SETTLE?: ClockSettlePayload }
  return w.__HUB_CLOCK_SETTLE ?? null
}

function indexSettles(payload: ClockSettlePayload, now = Date.now()): Map<string, ClockSettleHit> {
  const out = new Map<string, ClockSettleHit>()
  const put = (hit: ClockSettleHit) => {
    const cur = out.get(hit.ticker)
    if (!cur) {
      out.set(hit.ticker, hit)
      return
    }
    out.set(hit.ticker, {
      ...cur,
      ...hit,
      fromSettlement: cur.fromSettlement || hit.fromSettlement,
      pnl: hit.fromSettlement && hit.pnl != null ? hit.pnl : (cur.pnl ?? hit.pnl),
      spent: hit.spent ?? cur.spent,
      result: hit.result ?? cur.result,
      win: hit.win ?? cur.win,
      at: hit.at ?? cur.at,
    })
  }
  for (const m of payload.markets ?? []) {
    const ticker = String(m.ticker ?? '').trim()
    if (!ticker) continue
    const result = marketResultSide(m.result)
    const closeAt = Date.parse(String(m.closeTime ?? '')) || now
    put({
      ticker,
      tape: seriesToTape(ticker),
      result: result ?? undefined,
      at: Number.isFinite(closeAt) ? closeAt : now,
      fromSettlement: false,
    })
  }
  for (const e of eventsFromKalshiSettlements(payload.settlements, now, now - SETTLE_GIVE_UP_MS)) {
    put({
      ticker: e.ticker,
      tape: e.tape,
      win: e.win,
      spent: e.spent,
      pnl: e.pnl,
      at: e.at,
      fromSettlement: true,
    })
  }
  return out
}

function settlePnl(bet: BookedBet, hit: ClockSettleHit): { win: boolean; pnl: number } {
  const result = hit.result
  const win =
    hit.win ??
    (result != null ? (bet.side === 'up' && result === 'up') || (bet.side === 'down' && result === 'down') : false)
  const spent = Number.isFinite(bet.spent) ? bet.spent : (hit.spent ?? 0)
  if (hit.pnl != null && Number.isFinite(hit.pnl)) return { win: hit.pnl > 0 ? true : hit.pnl < 0 ? false : win, pnl: hit.pnl }
  const payout = win ? bet.count : 0
  return { win, pnl: Math.round((payout - spent) * 100) / 100 }
}

/** Apply Kalshi clock settle onto LIVE rows. Soft FAIL paper cash walk. Soft FAIL stuck OPEN. */
export function applyClockSettle(state: FinanceState, payload: ClockSettlePayload, now = Date.now()): FinanceState {
  const collapsed = collapseClockBets(state)
  const hits = indexSettles(payload, now)
  if (!hits.size) return collapsed
  let changed = collapsed !== state
  const bets = collapsed.bets.map((b) => {
    if (isPaperBet(b) || betKind(b) === 'hist') return b
    const hit = hits.get(b.ticker)
    if (!hit) return b
    if (b.status === 'settled' && b.pnl != null && !hit.fromSettlement) return b
    if (b.status === 'settled' && b.pnl != null && hit.fromSettlement && hit.pnl === b.pnl) return b
    if (hit.result == null && hit.win == null && hit.pnl == null) return b
    const next = settlePnl(b, hit)
    changed = true
    return {
      ...b,
      status: 'settled' as const,
      pnl: next.pnl,
      settledAt: hit.at && hit.at > 0 ? hit.at : now,
      spent: b.spent || hit.spent || b.spent,
    }
  })
  return changed ? saveFinance({ ...collapsed, bets }) : collapsed
}

export { collapseClockBets }
