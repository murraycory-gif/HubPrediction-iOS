import { describe, expect, it } from 'vitest'
import { looksLikeOrderUuid, makeTicket, ticketFillStrip } from '../src/lib/tapes'
import { tapeHoursLine, tapeSessionHours } from '../src/lib/tape-hours'

const uuid = '01a0b74f-e288-7687-8399-a6f10015a68a'

describe('ticket fill strip — Soft FAIL raw order id', () => {
  it('DOWN 98¢ is 1 contract · cost $0.98 · win $0.02', () => {
    const t = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-FILL',
      side: 'down',
      orderId: uuid,
      contracts: 1,
      beat: 81147,
      ask: 98,
    })
    expect(t).toBeTruthy()
    const line = ticketFillStrip(t!)
    expect(line).toBe('DOWN · 1 contract · 98¢ · cost $0.98 · win $0.02')
    expect(looksLikeOrderUuid(line)).toBe(false)
    expect(line).not.toContain(uuid)
  })

  it('UP 70¢ two contracts uses real fill numbers', () => {
    const t = makeTicket({
      tape: 'ng',
      ticker: 'KXNATGAS15M-FILL',
      side: 'up',
      orderId: uuid,
      contracts: 2,
      beat: 3.1,
      ask: 70,
    })
    const line = ticketFillStrip(t!)
    expect(line).toBe('UP · 2 contracts · 70¢ · cost $1.40 · win $0.60')
    expect(looksLikeOrderUuid(line)).toBe(false)
  })

  it('prefers booked spent/ask over the quote', () => {
    const t = makeTicket({
      tape: 'cu',
      ticker: 'KXCOPPER15M-FILL',
      side: 'down',
      orderId: 'ord-cu-real-fill01',
      contracts: 1,
      beat: 4.4,
      ask: 50,
    })
    const line = ticketFillStrip(t!, { yesAsk: 40, noAsk: 61 }, { ask: 40, spent: 0.4, count: 1 })
    expect(line).toBe('DOWN · 1 contract · 40¢ · cost $0.40 · win $0.60')
  })
})

describe('tape trading hours + next open', () => {
  it('BTC is 24/7 open', () => {
    const now = Date.parse('2026-09-18T22:00:00-05:00')
    expect(tapeSessionHours('btc', now).open).toBe(true)
    expect(tapeHoursLine('btc', null, '15m', now, true)).toBe('Hours 24/7 · open')
  })

  it('Gold Friday night Soft KEEP hours and next open Sunday', () => {
    const fridayNight = Date.parse('2026-09-18T17:00:00-05:00')
    const hours = tapeSessionHours('gld', fridayNight)
    expect(hours.open).toBe(false)
    expect(hours.label).toMatch(/Sun 5:00 PM – Fri 4:00 PM CT/)
    expect(tapeHoursLine('gld', null, '15m', fridayNight)).toMatch(/Hours Sun 5:00 PM – Fri 4:00 PM CT · next open/)
    expect(tapeHoursLine('gld', null, '15m', fridayNight)).toMatch(/Sun/)
    expect(tapeSessionHours('ng', fridayNight).open).toBe(false)
    expect(tapeSessionHours('cu', fridayNight).open).toBe(false)
  })

  it('Gold Sunday evening is open again', () => {
    const sunday = Date.parse('2026-09-20T18:00:00-05:00')
    expect(tapeSessionHours('gld', sunday).open).toBe(true)
    expect(tapeHoursLine('gld', null, '15m', sunday, true)).toBe('Hours Sun 5:00 PM – Fri 4:00 PM CT · open')
  })
})
