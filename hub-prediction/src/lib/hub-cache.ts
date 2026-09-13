import type { Board, Dash, Quote } from './types'

const QUOTE = 'hub.cache.quote'
const BOARD = 'hub.cache.board'
const DASH = 'hub.cache.dash'
const THESIS = 'hub.thesis'

function read<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

export function readQuoteCache(): Quote | null {
  const q = read<Quote>(QUOTE)
  if (!q || !Number.isFinite(q.live)) return null
  q.points = Array.isArray(q.points) ? q.points : []
  q.past = Array.isArray(q.past) ? q.past : []
  return q
}

export function writeQuoteCache(quote: Quote) {
  write(QUOTE, quote)
}

export function readBoardCache(): Board | null {
  const b = read<Board>(BOARD)
  if (!b || !Number.isFinite(b.live)) return null
  b.points = Array.isArray(b.points) ? b.points : []
  b.prior = Array.isArray(b.prior) ? b.prior : []
  b.past = Array.isArray(b.past) ? b.past : []
  return b
}

export function writeBoardCache(board: Board) {
  write(BOARD, board)
}

export function readDashCache(day: string): Dash | null {
  const d = read<Dash & { _day?: string }>(DASH)
  if (!d || d.day !== day) return null
  d.upcoming = Array.isArray(d.upcoming) ? d.upcoming : []
  d.elapsed = Array.isArray(d.elapsed) ? d.elapsed : []
  return d
}

export function writeDashCache(dash: Dash) {
  write(DASH, dash)
}

export type HeldThesis = {
  ticker: string
  side: 'up' | 'down' | 'sit'
  willBuy: boolean
  pWin: number
  locked: boolean
}

export function peekThesis(ticker: string): HeldThesis | null {
  const held = read<HeldThesis>(THESIS)
  if (!held || held.ticker !== ticker) return null
  return held
}

export function writeThesis(held: HeldThesis) {
  write(THESIS, held)
}

export const KEYS = { QUOTE, BOARD, DASH, THESIS }
