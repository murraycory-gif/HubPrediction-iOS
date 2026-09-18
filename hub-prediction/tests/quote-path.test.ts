import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDeskBoard, pickOpen, resetDeskBoardForTests } from '../src/lib/kalshi.server'
import { boardPollMs } from '../src/lib/tapes'

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
    expect(board.tapes.cu?.series).toBe('KXCOPPER15M')
    expect(board.tapes.btc?.series).toBe('KXBTC15M')
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

  it('1h BTC uses KXBTCD and 1h live_data range', async () => {
    const now = Date.now()
    const open = new Date(now - 20 * 60_000).toISOString()
    const close = new Date(now + 40 * 60_000).toISOString()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/markets?series_ticker=KXBTCD')) {
          return json({
            markets: [
              {
                ticker: 'KXBTCD-ATM',
                event_ticker: 'KXBTCD-E',
                status: 'active',
                yes_ask: 51,
                no_ask: 50,
                floor_strike: 77200,
                open_time: open,
                close_time: close,
              },
            ],
          })
        }
        if (u.includes('/markets?')) return json({ markets: [] })
        if (u.includes('/markets/KXBTCD-ATM')) {
          return json({
            market: {
              ticker: 'KXBTCD-ATM',
              event_ticker: 'KXBTCD-E',
              status: 'active',
              yes_ask: 51,
              no_ask: 50,
              floor_strike: 77200,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 77205 } } })
        throw new Error(u)
      },
    )
    const { defaultClocks } = await import('../src/lib/tapes')
    const board = await loadDeskBoard({ ...defaultClocks(), btc: '1h' })
    expect(board.tapes.btc?.series).toBe('KXBTCD')
    expect(board.tapes.btc?.beat).toBe(77200)
    expect(board.tapes.btc?.live).toBeCloseTo(77205)
    expect(calls.some((u) => u.includes('series_ticker=KXBTCD'))).toBe(true)
    expect(calls.some((u) => u.includes('range=1h'))).toBe(true)
    expect(calls.some((u) => /events\/orders/.test(u))).toBe(false)
  })

  it('between runs picks the next open clock — Soft FAIL keep the 00:00 WAIT ticker', async () => {
    const now = Date.now()
    const dead = {
      ticker: 'KXBTC15M-DEAD',
      event_ticker: 'KXBTC15M-DEAD-E',
      status: 'open',
      yes_ask: 70,
      no_ask: 31,
      floor_strike: 80850,
      open_time: new Date(now - 15 * 60_000).toISOString(),
      close_time: new Date(now - 1000).toISOString(),
    }
    const next = {
      ticker: 'KXBTC15M-NEXT',
      event_ticker: 'KXBTC15M-NEXT-E',
      status: 'open',
      yes_ask: 68,
      no_ask: 33,
      floor_strike: 80880,
      open_time: new Date(now - 500).toISOString(),
      close_time: new Date(now + 15 * 60_000).toISOString(),
    }
    expect(pickOpen([dead, next], now)?.ticker).toBe('KXBTC15M-NEXT')
    expect(pickOpen([dead], now)).toBeNull()
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        if (u.includes('/markets?series_ticker=KXBTC15M')) return json({ markets: [dead, next] })
        if (u.includes('/markets?')) return json({ markets: [] })
        if (u.includes('/markets/KXBTC15M-NEXT')) {
          return json({ market: { ...next, yes_ask: 69, no_ask: 32 } })
        }
        if (u.includes('/markets/KXBTC15M-DEAD')) throw new Error('Soft FAIL closed ticker')
        if (u.includes('/live_data/events/KXBTC15M-NEXT-E')) {
          return json({ live_data: { details: { last: 80890 } } })
        }
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 1 } } })
        throw new Error(u)
      },
    )
    const board = await loadDeskBoard()
    expect(board.tapes.btc?.ticker).toBe('KXBTC15M-NEXT')
    expect(board.tapes.btc?.tradingActive).toBe(true)
    expect(board.tapes.btc?.live).toBeCloseTo(80890)
    const liveTapes = {
      btc: { tradingActive: true, closeAt: now + 60_000 },
      ng: { tradingActive: true, closeAt: now + 60_000 },
      cu: { tradingActive: true, closeAt: now + 60_000 },
      gld: { tradingActive: true, closeAt: now + 60_000 },
    }
    expect(boardPollMs({ tapes: liveTapes }, now)).toBe(800)
    expect(boardPollMs({ tapes: { ...liveTapes, btc: { tradingActive: false, closeAt: now - 1 } } }, now)).toBe(350)
    expect(boardPollMs({ tapes: { ...liveTapes, btc: { tradingActive: true, closeAt: now + 4000 } } }, now)).toBe(350)
  })
})
