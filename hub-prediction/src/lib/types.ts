export type DeskSide = 'up' | 'down' | 'sit'

export type Point = {
  t: number
  px: number
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
  liveSource: 'brti' | 'coinbase'
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
  lastWeek: number | null
  variance: number | null
  isNow: boolean
}

export type Dash = {
  day: string
  weekday: string
  upcoming: DashRow[]
  elapsed: DashRow[]
}
