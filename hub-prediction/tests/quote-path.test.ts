import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDeskBoard, loadLivePrints, pickOpen, resetDeskBoardForTests } from '../src/lib/kalshi.server'
import { BOARD_CLOSED_MS, BOARD_STRUCTURE_MS, LIVE_TRAIL_DOTS, boardPollMs, holdLiveEvents, holdTapeQuote, latchDeskBoard, liveRangeFromCharts, loadHeldBoard, mergeLiveOntoBoard, nextBoardRolloverWait, saveHeldBoard, slimLivePoints, trueLiveGate } from '../src/lib/tapes'
import type { DeskBoard, TapeQuote } from '../src/lib/types'

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
    expect(boardPollMs({ tapes: liveTapes }, now)).toBe(BOARD_STRUCTURE_MS)
    expect(boardPollMs({ tapes: { ...liveTapes, btc: { tradingActive: false, closeAt: now - 1 } } }, now)).toBe(BOARD_CLOSED_MS)
    expect(boardPollMs({ tapes: { ...liveTapes, btc: { tradingActive: true, closeAt: now - 1 } } }, now)).toBe(BOARD_CLOSED_MS)
    expect(boardPollMs({ tapes: { ...liveTapes, btc: { tradingActive: true, closeAt: now + 4000 } } }, now)).toBe(350)
    expect(nextBoardRolloverWait({ tapes: liveTapes }, now)).toBe(60_000 + 50)
    expect(nextBoardRolloverWait({ tapes: { ...liveTapes, btc: { tradingActive: false, closeAt: now - 1 } } }, now)).toBe(BOARD_CLOSED_MS)
  })

  it('latches the initialized next clock after close — Soft FAIL sit on 00:00', async () => {
    const t0 = Date.parse('2026-09-18T19:26:00.000Z')
    const currentClose = Date.parse('2026-09-18T19:30:00.000Z')
    const nextClose = Date.parse('2026-09-18T19:45:00.000Z')
    let nowMs = t0
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const current = {
      ticker: 'KXBTC15M-26SEP181530-30',
      event_ticker: 'KXBTC15M-26SEP181530',
      status: 'active',
      yes_ask: 70,
      no_ask: 31,
      floor_strike: 80900,
      open_time: new Date(t0 - 11 * 60_000).toISOString(),
      close_time: new Date(currentClose).toISOString(),
    }
    const next = {
      ticker: 'KXBTC15M-26SEP181545-30',
      event_ticker: 'KXBTC15M-26SEP181545',
      status: 'initialized',
      yes_ask: 50,
      no_ask: 50,
      floor_strike: 80920,
      open_time: new Date(currentClose).toISOString(),
      close_time: new Date(nextClose).toISOString(),
    }
    const dead = { ...current, status: 'finalized' }
    const calls: string[] = []

    expect(pickOpen([dead, next], currentClose + 1000)?.ticker).toBe('KXBTC15M-26SEP181545-30')

    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/markets?series_ticker=KXBTC15M')) {
          if (u.includes('status=open')) {
            return json({ markets: nowMs < currentClose ? [current] : [] })
          }
          return json({ markets: nowMs < currentClose ? [current, next] : [dead, next] })
        }
        if (u.includes('/markets?')) return json({ markets: [] })
        if (u.includes('/markets/KXBTC15M-26SEP181530-30')) {
          return json({ market: nowMs < currentClose ? current : dead })
        }
        if (u.includes('/markets/KXBTC15M-26SEP181545-30')) {
          return json({
            market: {
              ...next,
              status: nowMs >= currentClose ? 'active' : 'initialized',
              yes_ask: 66,
              no_ask: 35,
            },
          })
        }
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 80910 } } })
        throw new Error(u)
      },
    )

    const first = await loadDeskBoard()
    expect(first.tapes.btc?.ticker).toBe('KXBTC15M-26SEP181530-30')
    expect(first.tapes.btc?.tradingActive).toBe(true)
    expect(first.tapes.btc?.closeAt).toBe(currentClose)

    const beforeRollover = calls.length
    nowMs = currentClose + 1000
    const second = await loadDeskBoard()
    const after = calls.slice(beforeRollover)
    expect(second.tapes.btc?.ticker).toBe('KXBTC15M-26SEP181545-30')
    expect(second.tapes.btc?.closeAt).toBe(nextClose)
    expect(second.tapes.btc?.tradingActive).toBe(true)
    expect(second.tapes.btc?.yesAsk).toBe(66)
    expect(after.some((u) => u.includes('series_ticker=KXBTC15M') && !u.includes('status=open'))).toBe(true)
    expect(after.some((u) => u.includes('/markets/KXBTC15M-26SEP181530-30'))).toBe(false)
    expect(after.some((u) => u.includes('/markets/KXBTC15M-26SEP181545-30'))).toBe(true)
  })

  it('uses the listed next clock when the ticker GET misses — Soft FAIL keep closed prev', async () => {
    const now = Date.now()
    const next = {
      ticker: 'KXBTC15M-NEXT',
      event_ticker: 'KXBTC15M-NEXT-E',
      status: 'initialized',
      yes_ask: 61,
      no_ask: 40,
      floor_strike: 81000,
      open_time: new Date(now - 200).toISOString(),
      close_time: new Date(now + 15 * 60_000).toISOString(),
    }
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        if (u.includes('/markets?series_ticker=KXBTC15M')) {
          return json({
            markets: [
              {
                ticker: 'KXBTC15M-DEAD',
                event_ticker: 'KXBTC15M-DEAD-E',
                status: 'finalized',
                yes_ask: 70,
                no_ask: 31,
                floor_strike: 80850,
                open_time: new Date(now - 16 * 60_000).toISOString(),
                close_time: new Date(now - 1000).toISOString(),
              },
              next,
            ],
          })
        }
        if (u.includes('/markets?')) return json({ markets: [] })
        if (u.includes('/markets/KXBTC15M-NEXT')) throw new Error('ticker miss')
        if (u.includes('/markets/KXBTC15M-DEAD')) throw new Error('Soft FAIL closed ticker')
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 81010 } } })
        throw new Error(u)
      },
    )
    const board = await loadDeskBoard()
    expect(board.tapes.btc?.ticker).toBe('KXBTC15M-NEXT')
    expect(board.tapes.btc?.closeAt).toBeGreaterThan(now)
    expect(board.tapes.btc?.tradingActive).toBe(true)
  })

  it('reuses an open ticker without refetching live_data — prints ride the fast path', async () => {
    const now = Date.now()
    const open = new Date(now - 4 * 60_000).toISOString()
    const close = new Date(now + 11 * 60_000).toISOString()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/markets?series_ticker=KXBTC15M')) {
          return json({
            markets: [
              {
                ticker: 'KXBTC15M-LIVE',
                event_ticker: 'KXBTC15M-LIVE-E',
                status: 'active',
                yes_ask: 70,
                no_ask: 31,
                floor_strike: 80870,
                open_time: open,
                close_time: close,
              },
            ],
          })
        }
        if (u.includes('/markets?')) return json({ markets: [] })
        if (u.includes('/markets/KXBTC15M-LIVE')) {
          return json({
            market: {
              ticker: 'KXBTC15M-LIVE',
              event_ticker: 'KXBTC15M-LIVE-E',
              status: 'active',
              yes_ask: 71,
              no_ask: 30,
              floor_strike: 80870,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/live_data/events/KXBTC15M-LIVE-E')) {
          return json({ live_data: { details: { last: 80880 } } })
        }
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 1 } } })
        throw new Error(u)
      },
    )
    const first = await loadDeskBoard()
    expect(first.tapes.btc?.live).toBeCloseTo(80880)
    await new Promise((r) => setTimeout(r, 400))
    const before = calls.length
    const second = await loadDeskBoard()
    const replay = calls.slice(before)
    expect(second.tapes.btc?.ticker).toBe('KXBTC15M-LIVE')
    expect(replay.some((u) => u.includes('/live_data/'))).toBe(false)
    expect(replay.some((u) => u.includes('/markets/KXBTC15M-LIVE'))).toBe(true)
  })

  it('loadLivePrints hits live_data only and merge overlays the board', async () => {
    const now = Date.now()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/live_data/events/KXBTC15M-E')) {
          return json({ live_data: { details: { last: 80910, timeseries: [{ t: now, v: 80910 }] } } })
        }
        throw new Error('Soft FAIL structure on print path ' + u)
      },
    )
    const prints = await loadLivePrints({ btc: 'KXBTC15M-E' }, '5min')
    expect(prints.tapes.btc?.live).toBeCloseTo(80910)
    expect(prints.tapes.btc?.eventTicker).toBe('KXBTC15M-E')
    expect((prints.tapes.btc?.points.length ?? 0) <= LIVE_TRAIL_DOTS).toBe(true)
    expect(slimLivePoints(Array.from({ length: 400 }, (_, i) => ({ t: now - (399 - i) * 1000, px: 80_000 + i }))).length).toBeLessThanOrEqual(LIVE_TRAIL_DOTS)
    expect(calls.every((u) => u.includes('/live_data/events/'))).toBe(true)
    expect(calls.some((u) => u.includes('range=5min'))).toBe(true)
    expect(liveRangeFromCharts({ btc: 'live', ng: '5m', cu: 'live', gld: 'live' })).toBe('15min')
    expect(liveRangeFromCharts({ btc: '1h' })).toBe('1h')
    expect(liveRangeFromCharts({ btc: 'live' }, { btc: '1h' })).toBe('1h')
    const board: DeskBoard = {
      fetchedAt: now - 1000,
      tapes: {
        btc: {
          id: 'btc',
          series: 'KXBTC15M',
          ticker: 'KXBTC15M-LIVE',
          eventTicker: 'KXBTC15M-E',
          yesAsk: 70,
          noAsk: 31,
          beat: 80870,
          live: 80800,
          liveSource: 'kalshi-live',
          points: [],
          openAt: now - 60_000,
          closeAt: now + 60_000,
          fetchedAt: now - 1000,
          clock: '—',
          tradingActive: true,
        },
        ng: null,
        cu: null,
        gld: null,
      },
    }
    const merged = mergeLiveOntoBoard(board, prints)
    expect(merged?.tapes.btc?.live).toBeCloseTo(80910)
    expect(merged?.tapes.btc?.yesAsk).toBe(70)
    expect(mergeLiveOntoBoard(board, { ...prints, tapes: { ...prints.tapes, btc: { ...prints.tapes.btc!, eventTicker: 'OTHER' } } })?.tapes.btc?.live).toBeCloseTo(80800)
    const same = mergeLiveOntoBoard(merged, {
      fetchedAt: now,
      tapes: { btc: { ...prints.tapes.btc!, live: 80910, points: [] }, ng: null, cu: null, gld: null, wti: null, slv: null },
    })
    expect(same).toBe(merged)
  })
})

describe('desk never blanks on a Kalshi miss', () => {
  function q(partial: Partial<DeskBoard['tapes']['btc']> = {}): NonNullable<DeskBoard['tapes']['btc']> {
    return {
      id: 'btc',
      series: 'KXBTC15M',
      ticker: 'KXBTC15M-LIVE',
      eventTicker: 'KXBTC15M-E',
      yesAsk: 72,
      noAsk: 29,
      beat: 81100,
      live: 81080,
      liveSource: 'kalshi-timeseries',
      points: [{ t: 1, px: 81080 }],
      openAt: 1,
      closeAt: Date.now() + 9 * 60_000,
      fetchedAt: Date.now(),
      clock: '9:15 PM',
      tradingActive: true,
      ...partial,
    }
  }

  it('latchDeskBoard drops a finished run and takes the next ticker — Soft FAIL sit on dead clock', () => {
    const now = Date.now()
    const dead = q({ ticker: 'KXBTC15M-DEAD', closeAt: now - 1000, tradingActive: true, clock: '9:00 PM' })
    const next = q({ ticker: 'KXBTC15M-NEXT', closeAt: now + 15 * 60_000, tradingActive: true, clock: '9:15 PM', beat: 81200 })
    const prev: DeskBoard = { fetchedAt: 1, tapes: { btc: dead, ng: null, cu: null, gld: null, wti: null, slv: null } }
    const hole: DeskBoard = { fetchedAt: 2, tapes: { btc: null, ng: null, cu: null, gld: null, wti: null, slv: null } }
    const heldDead = latchDeskBoard(hole, prev, now)
    expect(heldDead?.tapes.btc?.ticker).toBe('KXBTC15M-DEAD')
    expect(heldDead?.tapes.btc?.tradingActive).toBe(false)
    const rolled = latchDeskBoard({ fetchedAt: 3, tapes: { btc: next, ng: null, cu: null, gld: null, wti: null, slv: null } }, prev, now)
    expect(rolled?.tapes.btc?.ticker).toBe('KXBTC15M-NEXT')
    expect(rolled?.tapes.btc?.tradingActive).toBe(true)
    expect(holdTapeQuote(null, dead, now)?.tradingActive).toBe(false)
    expect(holdTapeQuote(next, dead, now)?.ticker).toBe('KXBTC15M-NEXT')
  })

  it('latchDeskBoard keeps the last good clock when the next poll is holes', () => {
    const prev: DeskBoard = {
      fetchedAt: 1,
      tapes: { btc: q(), ng: null, cu: null, gld: null, wti: null, slv: null },
    }
    const hole: DeskBoard = {
      fetchedAt: 2,
      tapes: { btc: null, ng: null, cu: null, gld: null, wti: null, slv: null },
    }
    const held = latchDeskBoard(hole, prev)
    expect(held?.tapes.btc?.ticker).toBe('KXBTC15M-LIVE')
    expect(held?.tapes.btc?.live).toBe(81080)
    expect(held?.tapes.btc?.beat).toBe(81100)
  })

  it('latchDeskBoard keeps live + trail when the same ticker comes back without a print', () => {
    const prev: DeskBoard = {
      fetchedAt: 1,
      tapes: { btc: q(), ng: null, cu: null, gld: null, wti: null, slv: null },
    }
    const incoming: DeskBoard = {
      fetchedAt: 2,
      tapes: { btc: q({ live: null, points: [], yesAsk: 73 }), ng: null, cu: null, gld: null, wti: null, slv: null },
    }
    const held = latchDeskBoard(incoming, prev)
    expect(held?.tapes.btc?.yesAsk).toBe(73)
    expect(held?.tapes.btc?.live).toBe(81080)
    expect(held?.tapes.btc?.points).toHaveLength(1)
  })

  it('holdLiveEvents does not drop the print key when the board hiccups', () => {
    const held = holdLiveEvents({}, { btc: 'KXBTC15M-E', ng: 'KXNG-E' })
    expect(held.btc).toBe('KXBTC15M-E')
    expect(held.ng).toBe('KXNG-E')
  })

  it('loadDeskBoard after a total fetch miss keeps the last good BTC clock', async () => {
    const now = Date.now()
    const open = new Date(now - 4 * 60_000).toISOString()
    const close = new Date(now + 11 * 60_000).toISOString()
    let dead = false
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        if (dead) throw new Error('kalshi down')
        const u = String(url)
        if (u.includes('/markets?series_ticker=KXBTC15M') || u.includes('/markets?')) {
          if (u.includes('KXBTC15M')) {
            return json({
              markets: [
                {
                  ticker: 'KXBTC15M-LIVE',
                  event_ticker: 'KXBTC15M-E',
                  status: 'active',
                  yes_ask: 70,
                  no_ask: 31,
                  floor_strike: 81100,
                  open_time: open,
                  close_time: close,
                },
              ],
            })
          }
          return json({ markets: [] })
        }
        if (u.includes('/markets/KXBTC15M-LIVE')) {
          return json({
            market: {
              ticker: 'KXBTC15M-LIVE',
              event_ticker: 'KXBTC15M-E',
              status: 'active',
              yes_ask: 70,
              no_ask: 31,
              floor_strike: 81100,
              open_time: open,
              close_time: close,
            },
          })
        }
        if (u.includes('/live_data/')) return json({ live_data: { details: { last: 81080 } } })
        throw new Error(u)
      },
    )
    const first = await loadDeskBoard()
    expect(first.tapes.btc?.live).toBeCloseTo(81080)
    dead = true
    await new Promise((r) => setTimeout(r, 400))
    const second = await loadDeskBoard()
    expect(second.tapes.btc?.ticker).toBe('KXBTC15M-LIVE')
    expect(second.tapes.btc?.live).toBeCloseTo(81080)
    expect(second.tapes.btc?.beat).toBe(81100)
  })

  it('persists the last good board so a reload does not paint BTC empty', () => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
    const prev: DeskBoard = {
      fetchedAt: 3,
      tapes: { btc: q(), ng: null, cu: null, gld: null, wti: null, slv: null },
    }
    saveHeldBoard(prev)
    const held = loadHeldBoard()
    expect(held?.tapes.btc?.ticker).toBe('KXBTC15M-LIVE')
    expect(held?.tapes.btc?.beat).toBe(81100)
  })
})

describe('trueLiveGate Soft FAIL stale Live POST', () => {
  function fresh(now = Date.now(), partial: Partial<TapeQuote> = {}): TapeQuote {
    return {
      id: 'btc',
      series: 'KXBTC15M',
      ticker: 'KXBTC15M-NOW',
      eventTicker: 'KXBTC15M',
      yesAsk: 72,
      noAsk: 29,
      beat: 80000,
      live: 80040,
      liveSource: 'kalshi-live',
      points: [
        { t: now - 12_000, px: 80020 },
        { t: now - 8000, px: 80030 },
        { t: now - 4000, px: 80035 },
        { t: now - 200, px: 80040 },
      ],
      openAt: now - 5 * 60_000,
      closeAt: now + 10 * 60_000,
      fetchedAt: now - 400,
      clock: '15m',
      clockId: '15m',
      tradingActive: true,
      ...partial,
    }
  }

  it('fresh clock + NOW + ask + series is live', () => {
    const now = Date.now()
    expect(trueLiveGate({ quote: fresh(now), kalshiLive: 80040, now }).ok).toBe(true)
    expect(trueLiveGate({ quote: fresh(now), kalshiLive: 80041.5, now }).ok).toBe(true)
  })

  it('expired latch / dead clock is STALE — paper only', () => {
    const now = Date.now()
    expect(trueLiveGate({ quote: fresh(now, { closeAt: now - 1, tradingActive: true }), now }).stale).toBe(true)
    expect(trueLiveGate({ quote: fresh(now, { tradingActive: false }), now }).reason).toBe('STALE — paper only')
  })

  it('NOW off Kalshi by more than $2 or print older than 30s is stale', () => {
    const now = Date.now()
    expect(trueLiveGate({ quote: fresh(now), kalshiLive: 80043, now }).ok).toBe(false)
    expect(trueLiveGate({ quote: fresh(now, { fetchedAt: now - 31_000 }), kalshiLive: 80040, now }).ok).toBe(false)
  })

  it('ask off Kalshi by more than 1¢ is stale', () => {
    const now = Date.now()
    expect(trueLiveGate({ quote: fresh(now), kalshiLive: 80040, kalshiYesAsk: 74, now }).ok).toBe(false)
    expect(trueLiveGate({ quote: fresh(now), kalshiLive: 80040, kalshiYesAsk: 72, kalshiNoAsk: 29, now }).ok).toBe(true)
  })

  it('lone NOW-dot is not a live series', () => {
    const now = Date.now()
    expect(trueLiveGate({ quote: fresh(now, { points: [{ t: now, px: 80040 }] }), kalshiLive: 80040, now }).ok).toBe(false)
  })
})
