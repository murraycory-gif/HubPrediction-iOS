import { describe, expect, it } from 'vitest'
import { V2_EVENTS_ORDERS, v2EventsOrderBody } from '../src/lib/kalshi-trade.server'
import { GOLD_RECIPES, cashGates, extractOrderId, hydrateSettings, tabIsOpen } from '../src/lib/tapes'

describe('placeContract V2 Soft KEEP', () => {
  it('BUY UP is bid at yes_ask 0.xxxx with taker_at_cross', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const body = v2EventsOrderBody({
      ticker: 'KXBTC15M-1',
      side: 'up',
      count: 2,
      yesAsk: 73,
      noAsk: 28,
      clientOrderId: id,
    })
    expect(V2_EVENTS_ORDERS).toBe('/trade-api/v2/portfolio/events/orders')
    expect(body.side).toBe('bid')
    expect(body.price).toBe('0.7300')
    expect(body.self_trade_prevention_type).toBe('taker_at_cross')
    expect(body.client_order_id).toBe(id)
    expect(body.time_in_force).toBe('immediate_or_cancel')
    expect(body).not.toHaveProperty('yes_price')
    expect(body).not.toHaveProperty('no_price')
  })

  it('BUY DOWN is ask at (1 − no_ask), not no_ask and not bid', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const body = v2EventsOrderBody({
      ticker: 'KXCOPPER15M-1',
      side: 'down',
      count: 1,
      yesAsk: 88,
      noAsk: 12,
      clientOrderId: id,
    })
    expect(body.side).toBe('ask')
    expect(body.side).not.toBe('bid')
    expect(body.price).toBe('0.8800')
    expect(body.price).not.toBe('0.1200')
    expect(body.self_trade_prevention_type).toBe('taker_at_cross')
    expect(body.client_order_id).toBe(id)
  })

  it('retries keep the same client_order_id', () => {
    const id = 'sticky-client-order-id-99'
    const a = v2EventsOrderBody({ ticker: 't', side: 'up', count: 1, yesAsk: 70, noAsk: 31, clientOrderId: id })
    const b = v2EventsOrderBody({ ticker: 't', side: 'down', count: 1, yesAsk: 70, noAsk: 31, clientOrderId: id })
    expect(a.client_order_id).toBe(b.client_order_id)
    expect(a.client_order_id).toBe(id)
  })

  it('ticket extractor Soft FAIL ARMING and accepts order.order_id', () => {
    expect(extractOrderId({ order: { order_id: 'ARMING' } })).toBeNull()
    expect(extractOrderId({ status: 'paper' })).toBeNull()
    expect(extractOrderId({ order: { order_id: 'ord-live-fill-01' } })).toBe('ord-live-fill-01')
    expect(extractOrderId({ position: { position_id: 'pos-live-fill-01' } })).toBe('pos-live-fill-01')
  })

  it('does not flip Live/bots ON or retune recipes', () => {
    const s = hydrateSettings(null)
    expect(s.liveBets).toBe(false)
    expect(cashGates(s, 'btc').ok).toBe(false)
    expect(GOLD_RECIPES.btc).toMatchObject({ armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 })
    expect(GOLD_RECIPES.ng).toMatchObject({ armFromMin: 8, armToMin: 0.45, through: 0.002 })
    expect(GOLD_RECIPES.cu).toMatchObject({ armFromMin: 9, armToMin: 0.45, through: 0.002 })
    expect(GOLD_RECIPES.gld).toMatchObject({ armFromMin: 10, armToMin: 3, through: 2, centLo: 34 })
    expect(tabIsOpen()).toBe(true)
  })
})
