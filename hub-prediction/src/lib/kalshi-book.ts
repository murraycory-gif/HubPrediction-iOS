import {
  collapseClockBets,
  isImportedKalshiRow,
  isPaperOrderId,
  mergeKalshiHistoryToBook,
  saveFinance,
  type BookedBet,
  type BetKind,
  type FinanceState,
} from './finance'
import { isRealOrderId } from './tapes'

/** Whole Kalshi book latch. Soft FAIL a 20–30s drip. */
export const BOOK_LATCH_MS = 4000

export type KalshiBookPayload = {
  cash?: number | null
  deposits?: unknown
  fills?: unknown
  settlements?: unknown
  positions?: unknown
  orders?: unknown
  hostCreds?: boolean
  fetchedAt?: number
}

export type KalshiBookIndex = {
  orderIds: Set<string>
  tickers: Set<string>
  fetchedAt: number
  hostCreds: boolean
}

function listRows(raw: unknown, keys: string[]) {
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

function pushId(set: Set<string>, raw: unknown) {
  const id = String(raw ?? '').trim()
  if (id && isRealOrderId(id) && !isPaperOrderId(id)) set.add(id)
}

function pushTicker(set: Set<string>, raw: unknown) {
  const ticker = String(raw ?? '').trim()
  if (ticker) set.add(ticker)
}

/** Index order ids + tickers that exist on Kalshi. Soft FAIL deskfill-as-LIVE. */
export function indexKalshiBook(raw: KalshiBookPayload | null | undefined): KalshiBookIndex {
  const orderIds = new Set<string>()
  const tickers = new Set<string>()
  const bags: Array<{ rows: Record<string, unknown>[]; orderKeys: string[] }> = [
    { rows: listRows(raw?.fills, ['fills']), orderKeys: ['order_id', 'orderId'] },
    { rows: listRows(raw?.orders, ['orders', 'event_orders']), orderKeys: ['order_id', 'orderId', 'client_order_id'] },
    { rows: listRows(raw?.settlements, ['settlements']), orderKeys: ['order_id', 'orderId'] },
    { rows: listRows(raw?.positions, ['market_positions', 'positions']), orderKeys: ['order_id', 'orderId'] },
  ]
  for (const bag of bags) {
    for (const row of bag.rows) {
      if (!row || typeof row !== 'object') continue
      pushTicker(tickers, row.ticker ?? row.market_ticker)
      for (const key of bag.orderKeys) pushId(orderIds, row[key])
    }
  }
  return {
    orderIds,
    tickers,
    fetchedAt: Number(raw?.fetchedAt) || Date.now(),
    hostCreds: raw?.hostCreds === true,
  }
}

export function onKalshiBook(
  b: { orderId?: unknown; ticker?: unknown; betId?: unknown },
  book: KalshiBookIndex,
) {
  if (isPaperOrderId(b.orderId)) return false
  const orderId = String(b.orderId ?? '').trim()
  if (orderId && book.orderIds.has(orderId)) return true
  const ticker = String(b.ticker ?? '').trim()
  if (ticker && book.tickers.has(ticker) && isImportedKalshiRow(b)) return true
  return false
}

/** Book membership is MODE. Missing from Kalshi → PAPER. Present → LIVE. Soft FAIL ghost LIVE. */
export function classifyBookMode(
  b: { kind?: unknown; orderId?: unknown; betId?: unknown; ticker?: unknown },
  book: KalshiBookIndex | null | undefined,
): BetKind {
  if (isPaperOrderId(b.orderId) || (typeof b.betId === 'string' && /^paper:/i.test(b.betId))) return 'paper'
  if (isImportedKalshiRow(b) || b.kind === 'hist') return 'hist'
  if (!book || !book.fetchedAt) {
    if (b.kind === 'paper') return 'paper'
    if (b.kind === 'live') return 'live'
    return 'paper'
  }
  if (onKalshiBook(b, book)) return 'live'
  return 'paper'
}

/** Kalshi book ∪ desk paper extras. Soft FAIL label LIVE unless the fill is on Kalshi. */
export function applyKalshiBook(state: FinanceState, payload: KalshiBookPayload, now = Date.now()): FinanceState {
  const haveBook =
    payload.fills != null || payload.orders != null || payload.settlements != null || payload.positions != null
  if (!haveBook) return state
  const index = indexKalshiBook(payload)
  const merged = mergeKalshiHistoryToBook(
    state,
    {
      fills: payload.fills,
      settlements: payload.settlements,
      positions: payload.positions,
      orders: payload.orders,
      fromMs: now - 24 * 60 * 60 * 1000,
    },
    now,
  )
  const bets = merged.bets.map((b: BookedBet) => ({ ...b, kind: classifyBookMode(b, index) }))
  return collapseClockBets(saveFinance({ ...merged, bets }))
}
