import { describe, expect, it } from 'vitest'
import { closeClockLive, closeClockView } from '../src/lib/close-clock'
import { countOpenSeriesMarkets } from '../src/lib/kalshi.server'
import { v2EventsOrderBody } from '../src/lib/kalshi-trade.server'
import { last24hBets, liveSendGate, stripDeskRows, emptyFinance } from '../src/lib/finance'
import {
  GOLD_RECIPES,
  TAPE_IDS,
  confirmedPlaceOrderId,
  hydrateSettings,
  patchTape,
  placeOrderStatus,
  tapeAllowsLive,
} from '../src/lib/tapes'

describe('HARD QA gates', () => {
  it('1 CLOSED only when series open-market count is 0', () => {
    const now = Date.parse('2026-09-19T00:20:00-05:00')
    const closeAt = Date.parse('2026-09-19T00:30:00-05:00')
    const open = [
      {
        ticker: 'KXBTC15M-26SEP190015-15',
        status: 'open',
        open_time: new Date(now - 60_000).toISOString(),
        close_time: new Date(closeAt).toISOString(),
      },
    ]
    expect(countOpenSeriesMarkets(open, now)).toBe(1)
    expect(countOpenSeriesMarkets([], now)).toBe(0)
    expect(closeClockLive({ openMarkets: 1, tradingActive: false, stale: true, closeAt, now })).toBe(true)
    expect(closeClockView({ openMarkets: 1, tradingActive: false, closeAt, now }).text).not.toMatch(/CLOSED/)
    expect(closeClockView({ openMarkets: 0, tradingActive: true, closeAt, now }).kind).toBe('closed')
  })

  it('2 24H strip is LIVE + today paper only', () => {
    const now = Date.now()
    const hits = {
      tapes: {
        btc: { w: 255, l: 147 },
        ng: { w: 0, l: 0 },
        cu: { w: 0, l: 0 },
        gld: { w: 0, l: 0 },
        wti: { w: 0, l: 0 },
        slv: { w: 0, l: 0 },
      },
    }
    const state = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_live',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-LIVE',
          clock: '15m',
          closeAt: now + 60_000,
          side: 'up' as const,
          count: 1,
          ask: 70,
          spent: 0.7,
          orderId: 'ord-live-aaaa',
          status: 'open' as const,
          pnl: null,
          filledAt: now,
          settledAt: null,
          kind: 'live' as const,
        },
        {
          betId: 'bet_paper',
          tape: 'cu' as const,
          ticker: 'KXCOPPER15M-P',
          clock: '15m',
          closeAt: now + 60_000,
          side: 'down' as const,
          count: 1,
          ask: 40,
          spent: 0.4,
          orderId: 'deskfill-cu-today',
          status: 'open' as const,
          pnl: null,
          filledAt: now,
          settledAt: null,
          kind: 'paper' as const,
        },
        {
          betId: 'kalshi:KXBTC15M-H1',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-H1',
          clock: '15m',
          closeAt: now - 3600_000,
          side: 'up' as const,
          count: 1,
          ask: 50,
          spent: 50,
          orderId: 'settled-hist',
          status: 'settled' as const,
          pnl: 0.5,
          filledAt: now - 40 * 3600_000,
          settledAt: now - 40 * 3600_000,
          kind: 'hist' as const,
        },
      ],
    }
    const strip = last24hBets(state, hits, now)
    expect(strip.placed).toBeCloseTo(0.7)
    expect(strip.placed).not.toBeCloseTo(11784)
    expect(stripDeskRows(state.bets, TAPE_IDS, now).every((b) => b.kind !== 'hist')).toBe(true)
    expect(stripDeskRows(state.bets, TAPE_IDS, now).map((b) => b.orderId).sort()).toEqual(['deskfill-cu-today', 'ord-live-aaaa'])
  })

  it('3 BOT BOUGHT / MODE LIVE needs fill_count > 0', () => {
    expect(
      confirmedPlaceOrderId({
        order: { order_id: '01a0b7af-7b30-701f-8eb6-fa1303b858ad', status: 'canceled', fill_count: 0, count_fp: '20.00' },
      }),
    ).toBeNull()
    expect(placeOrderStatus({ order: { order_id: '01a0b7af-7b30-701f-8eb6-fa1303b858ad', status: 'canceled', fill_count: 0 } })).toBe(
      'canceled',
    )
    expect(
      confirmedPlaceOrderId({
        order: { order_id: '01a0b74f-7b30-701f-8eb6-fa1303b858ad', status: 'executed', fill_count: 1 },
      }),
    ).toBe('01a0b74f-7b30-701f-8eb6-fa1303b858ad')
  })

  it('5 DOWN is V2 BUY NO GTC — fill or rest, Soft FAIL silent cancel', () => {
    const down = v2EventsOrderBody({
      ticker: 'KXBTC15M-26SEP190015-15',
      side: 'down',
      count: 1,
      yesAsk: 70,
      noAsk: 30,
      clientOrderId: 'down-gtc-1',
    })
    expect(down.side).toBe('ask')
    expect(down.price).toBe('0.7000')
    expect(down.time_in_force).toBe('good_till_canceled')
    expect(placeOrderStatus({ order: { order_id: '01resting-order-id-0001', status: 'resting', fill_count: 0 } })).toBe('resting')
    expect(confirmedPlaceOrderId({ order: { order_id: '01resting-order-id-0001', status: 'resting', fill_count: 0 } })).toBeNull()
  })

  it('6 Live cash / contracts persist; WTI + Silver stay paper', () => {
    const s = hydrateSettings({
      tapes: {
        btc: { ...GOLD_RECIPES.btc, liveOn: true, contracts: 4 },
        wti: { ...GOLD_RECIPES.wti, liveOn: true, contracts: 9 },
        slv: { ...GOLD_RECIPES.slv, liveOn: true, contracts: 8 },
      },
      togglesPicked: true,
    })
    expect(s.tapes.btc.liveOn).toBe(true)
    expect(s.tapes.btc.contracts).toBe(4)
    expect(s.tapes.wti.liveOn).toBe(false)
    expect(s.tapes.slv.liveOn).toBe(false)
    expect(tapeAllowsLive('wti')).toBe(false)
    expect(tapeAllowsLive('slv')).toBe(false)
    const again = patchTape(s, 'wti', { liveOn: true, contracts: 3 })
    expect(again.tapes.wti.liveOn).toBe(false)
    expect(again.tapes.wti.contracts).toBe(3)
    expect(liveSendGate(emptyFinance(), { tape: 'wti', ticker: 'KXWTI15M-1', ask: 70, cash: 300, deposits: 200, spent: 0.7 }).ok).toBe(
      false,
    )
  })
})
