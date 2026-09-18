import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDeskBoard, resetDeskBoardForTests } from '../src/lib/kalshi.server'

afterEach(() => {
  resetDeskBoardForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  }
}

describe('one fast quote path Soft KEEP same ticker/second', () => {
  it('uses GET /markets/{ticker} ¢ + live_data in parallel — not stale list ¢', async () => {
    const now = Date.now()
    const open = new Date(now - 6 * 60_000).toISOString()
    const close = new Date(now + 9 * 60_000).toISOString()
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/markets?series_ticker=KXCOPPER15M')) {
          return json({
            markets: [
              {
                ticker: 'KXCOPPER15M-CU',
                event_ticker: 'KXCOPPER15M-E',
                status: 'active',
                yes_ask: 41,
                no_ask: 60,
                yes_ask_dollars: '0.4100',
                no_ask_dollars: '0.6000',
                floor_strike: 4.58,
                open_time: open,
                close_time: close,
              },
            ],
          })
        }
        if (u.includes('/markets?series_ticker=KXBTC15M')) {
          return json({
            markets: [
              {
                ticker: 'KXBTC15M-BTC',
                event_ticker: 'KXBTC15M-E',
                status: 'active',
                yes_ask: 70,
                no_ask: 31,
                floor_strike: 76530,
                open_time: open,
                close_time: close,
              },
            ],
          })
        }
        if (u.includes('/markets?')) {
          return json({ markets: [] })
        }
        if (u.includes('/markets/KXCOPPER15M-CU')) {
          return json({
            market: {
              ticker: 'KXCOPPER15M-CU',
              event_ticker: 'KXCOPPER15M-E',
              status: 'active',
              yes_ask: 29,
              no_ask: 72,
              yes_ask_dollars: '0.2900',
              no_ask_dollars: '0.7200',
              floor_strike: 4.58,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/markets/KXBTC15M-BTC')) {
          return json({
            market: {
              ticker: 'KXBTC15M-BTC',
              event_ticker: 'KXBTC15M-E',
              status: 'active',
              yes_ask: 71,
              no_ask: 30,
              floor_strike: 76530,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/live_data/events/KXCOPPER15M-E')) {
          return json({ live_data: { details: { last: 4.5821, timeseries: [{ t: now, v: 4.5821 }] } } })
        }
        if (u.includes('/live_data/events/KXBTC15M-E')) {
          return json({ live_data: { details: { last: 76540.12, timeseries: [{ t: now, v: 76540.12 }] } } })
        }
        if (u.includes('/live_data/')) {
          return json({ live_data: { details: { timeseries: [] } } })
        }
        throw new Error('unexpected ' + u)
      },
    )

    const board = await loadDeskBoard()
    expect(board.tapes.cu?.tradingActive).toBe(true)
    expect(board.tapes.cu?.yesAsk).toBe(29)
    expect(board.tapes.cu?.noAsk).toBe(72)
    expect(board.tapes.cu?.yesAsk).not.toBe(41)
    expect(board.tapes.cu?.live).toBeCloseTo(4.5821)
    expect(board.tapes.btc?.tradingActive).toBe(true)
    expect(board.tapes.btc?.live).toBeCloseTo(76540.12)
    expect(Math.abs((board.tapes.btc?.live ?? 0) - 76540.12)).toBeLessThanOrEqual(2)
    expect(calls.some((u) => u.includes('/markets/KXCOPPER15M-CU'))).toBe(true)
    expect(calls.some((u) => u.includes('/live_data/events/KXCOPPER15M-E'))).toBe(true)
    expect(calls.some((c) => c.includes('grok.me'))).toBe(false)
  })

  it('SSR/desk tradingActive stays true on an OPEN 15m window with status=active', async () => {
    const now = Date.now()
    const open = new Date(now - 2 * 60_000).toISOString()
    const close = new Date(now + 13 * 60_000).toISOString()
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        if (u.includes('/markets?')) {
          return json({
            markets: [
              {
                ticker: 'KXBTC15M-OPEN',
                event_ticker: 'KXBTC15M-OPEN-E',
                status: 'active',
                yes_ask: 73,
                no_ask: 28,
                floor_strike: 76000,
                open_time: open,
                close_time: close,
              },
            ],
          })
        }
        if (u.includes('/markets/KXBTC15M-OPEN')) {
          return json({
            market: {
              ticker: 'KXBTC15M-OPEN',
              event_ticker: 'KXBTC15M-OPEN-E',
              status: 'active',
              yes_ask: 73,
              no_ask: 28,
              floor_strike: 76000,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/live_data/')) {
          return json({ live_data: { details: { last: 76010 } } })
        }
        throw new Error(u)
      },
    )
    const board = await loadDeskBoard()
    expect(board.tapes.btc?.tradingActive).toBe(true)
    expect(board.tapes.ng?.tradingActive).toBe(true)
  })
})
