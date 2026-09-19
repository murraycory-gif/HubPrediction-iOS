import type { TapeId } from './tapes'

export type DeskSide = 'up' | 'down' | 'sit'

export type Point = {
  t: number
  px: number
}

export type Candle = {
  t: number
  open: number
  high: number
  low: number
  close: number
}

export type Settled = {
  ticker: string
  closeAt: number
  result: 'up' | 'down'
}

export type Quote = {
  ticker: string
  yesAsk: number
  noAsk: number
  strike: number
  live: number
  liveSource: 'brti' | 'coinbase' | 'kalshi-live' | 'kalshi-timeseries'
  openAt: number
  closeAt: number
  fetchedAt: number
  exchangeActive?: boolean
  tradingActive?: boolean
  points: Point[]
  prior?: Point[]
  past: Settled[]
}

export type Board = Quote & {
  prior: Point[]
}

export type DeskCall = {
  side: DeskSide
  willBuy: boolean
  label: 'BUY UP' | 'BUY DOWN' | 'SIT'
  pWin: number
  locked: boolean
}

export type DashRow = {
  t: number
  clock: string
  theory: number | null
  actual: number | null
  preview: number | null
  lastWeek: number | null
  variance: number | null
  vsOpen: number | null
  high: number | null
  low: number | null
  isNow: boolean
}

export type Dash = {
  day: string
  weekday: string
  upcoming: DashRow[]
  elapsed: DashRow[]
}

export type TapeQuote = {
  id: TapeId
  series: string
  ticker: string
  eventTicker: string
  yesAsk: number
  noAsk: number
  beat: number
  live: number | null
  liveSource: 'kalshi-live' | 'kalshi-timeseries' | null
  points: Point[]
  openAt: number
  closeAt: number
  fetchedAt: number
  clock: string
  clockId?: '5m' | '15m' | '1h'
  tradingActive: boolean
  /** Kalshi series status=open count. CLOSED only when this is 0. */
  openMarkets?: number
}

export type DeskBoard = {
  tapes: Record<TapeId, TapeQuote | null>
  fetchedAt: number
}

export type LiveOverlay = {
  eventTicker: string
  live: number | null
  liveSource: TapeQuote['liveSource']
  points: Point[]
  fetchedAt: number
}

export type LivePrints = {
  tapes: Record<TapeId, LiveOverlay | null>
  fetchedAt: number
}
