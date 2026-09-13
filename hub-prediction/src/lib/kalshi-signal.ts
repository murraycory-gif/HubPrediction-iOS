import { peekThesis, writeThesis } from './hub-cache'
import type { DeskCall, DeskSide, Point, Quote } from './types'

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function last6Slope(points: Point[] | undefined, now: number) {
  const list = Array.isArray(points) ? points : []
  const from = now - 6 * 60_000
  const slice = list.filter((p) => p && p.t >= from && p.t <= now + 1000)
  if (slice.length < 2) return 0
  const a = slice[0]
  const b = slice[slice.length - 1]
  const mins = (b.t - a.t) / 60_000
  if (mins < 0.45) return 0
  return clamp((b.px - a.px) / mins, -2.2, 2.2)
}

export function kalshiCall(quote: Quote | null | undefined): DeskCall {
  if (!quote || !Number.isFinite(quote.live) || !Number.isFinite(quote.strike)) {
    return { side: 'sit', willBuy: false, label: 'SIT', pWin: 0.5, locked: false }
  }
  const live = quote.live
  const strike = quote.strike
  const yes = quote.yesAsk / 100
  const gap = live - strike
  const slope = last6Slope(quote.points, quote.fetchedAt || Date.now())
  const gapScore = clamp(0.5 + gap / 80, 0.08, 0.92)
  const slopeScore = clamp(0.5 + slope / 4.4, 0.15, 0.85)
  const tapeScore = Number.isFinite(yes) ? clamp(1 - yes, 0.05, 0.95) : 0.5
  const pUp = clamp(gapScore * 0.5 + slopeScore * 0.28 + (1 - tapeScore) * 0.22, 0.05, 0.95)
  const side: DeskSide = gap > 4 ? 'up' : gap < -4 ? 'down' : Math.abs(slope) > 0.35 ? (slope > 0 ? 'up' : 'down') : 'sit'
  const pWin = side === 'up' ? pUp : side === 'down' ? 1 - pUp : 0.5
  const ask = side === 'up' ? yes : side === 'down' ? quote.noAsk / 100 : 1
  const edge = pWin - ask
  const willBuy = side !== 'sit' && pWin >= 0.58 && edge >= 0.04
  return {
    side,
    willBuy,
    label: willBuy ? (side === 'up' ? 'BUY UP' : 'BUY DOWN') : 'SIT',
    pWin,
    locked: false,
  }
}

/** Hold the desk call for the current ticker. Hard reverse only. */
export function holdThesis(quote: Quote | null | undefined, next = kalshiCall(quote)): DeskCall {
  if (!quote?.ticker) return next
  const prev = peekThesis(quote.ticker)
  const live = quote.live
  const strike = quote.strike

  if (!prev) {
    const locked = next.willBuy
    writeThesis({ ticker: quote.ticker, side: next.side, willBuy: next.willBuy, pWin: next.pWin, locked })
    return { ...next, locked }
  }

  if (prev.locked && (prev.side === 'up' || prev.side === 'down')) {
    const through =
      prev.side === 'up' ? live < strike - 28 : live > strike + 28
    const hard =
      through &&
      next.willBuy &&
      next.side !== prev.side &&
      next.side !== 'sit' &&
      next.pWin >= 0.72
    if (hard) {
      writeThesis({
        ticker: quote.ticker,
        side: next.side,
        willBuy: true,
        pWin: next.pWin,
        locked: true,
      })
      return {
        side: next.side,
        willBuy: true,
        label: next.side === 'up' ? 'BUY UP' : 'BUY DOWN',
        pWin: next.pWin,
        locked: true,
      }
    }
    return {
      side: prev.side,
      willBuy: true,
      label: prev.side === 'up' ? 'BUY UP' : 'BUY DOWN',
      pWin: Math.max(prev.pWin, next.pWin),
      locked: true,
    }
  }

  if (!next.willBuy) {
    writeThesis({ ticker: quote.ticker, side: 'sit', willBuy: false, pWin: next.pWin, locked: false })
    return { side: 'sit', willBuy: false, label: 'SIT', pWin: next.pWin, locked: false }
  }

  writeThesis({
    ticker: quote.ticker,
    side: next.side,
    willBuy: true,
    pWin: next.pWin,
    locked: true,
  })
  return { ...next, willBuy: true, locked: true }
}
