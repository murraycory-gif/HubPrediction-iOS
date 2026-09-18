import type { Board, Quote, Settled } from './types'

export function emptyQuote(): Quote {
  return {
    ticker: '',
    yesAsk: 0,
    noAsk: 0,
    strike: 0,
    live: 0,
    liveSource: 'coinbase',
    openAt: 0,
    closeAt: 0,
    fetchedAt: 0,
    points: [],
    past: [],
  }
}

export function payloadFromQuote(q: Partial<Quote> | null | undefined): Quote {
  const base = emptyQuote()
  if (!q) return base
  return {
    ...base,
    ...q,
    points: Array.isArray(q.points) ? q.points : [],
    past: Array.isArray(q.past) ? q.past : [],
  }
}

export function mergeQuoteOntoBoard(board: Board | null | undefined, quote: Quote | null | undefined): Board {
  const q = payloadFromQuote(quote)
  const b = board ?? { ...q, prior: [] }
  return {
    ...b,
    ticker: q.ticker || b.ticker,
    yesAsk: q.yesAsk || b.yesAsk,
    noAsk: q.noAsk || b.noAsk,
    strike: q.strike || b.strike,
    live: q.live || b.live,
    liveSource: q.live ? q.liveSource : b.liveSource,
    openAt: q.openAt || b.openAt,
    closeAt: q.closeAt || b.closeAt,
    fetchedAt: q.fetchedAt || b.fetchedAt,
    points: (q.points?.length ?? 0) > 2 ? q.points : (b.points?.length ?? 0) ? b.points : q.points,
    past: (q.past?.length ?? 0) ? q.past : (b.past ?? []),
    prior: Array.isArray(b.prior) ? b.prior : [],
  }
}

export function mergeSettled(quote: Quote, past: Settled[] | undefined): Quote {
  if (Array.isArray(past) && past.length) return { ...quote, past }
  return { ...quote, past: Array.isArray(quote.past) ? quote.past : [] }
}

export function dollars(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n as number)
}

export function dollarsExact(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n as number)
}

export function cents(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—¢'
  return `${Math.round(n as number)}¢`
}

export function signedDollars(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  const v = n as number
  const core = dollarsExact(Math.abs(v))
  if (v > 0) return `+${core}`
  if (v < 0) return `−${core}`
  return core
}
