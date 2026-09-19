import { describe, expect, it } from 'vitest'
import { LIVE_COUNTDOWN_MAX_MS, closeClockLive, closeClockView } from '../src/lib/close-clock'
import { tapeSessionHours } from '../src/lib/tape-hours'

describe('closeClockView — countdown only while LIVE', () => {
  it('live clock inside 2h is mm:ss', () => {
    const now = Date.parse('2026-09-19T20:57:00-05:00')
    expect(closeClockView({ closeAt: now + 125_000, live: true, now })).toEqual({ kind: 'live', text: '02:05' })
  })

  it('Gold STALE far-future closeAt is CLOSED · next open, not 11114:37', () => {
    const now = Date.parse('2026-09-18T20:57:00-05:00')
    const closeAt = now + 11_114 * 60_000 + 37_000
    const view = closeClockView({
      closeAt,
      live: false,
      now,
      nextOpenLabel: 'Sun Sep 20 5:00 PM',
    })
    expect(view.kind).toBe('closed')
    expect(view.text).toBe('CLOSED · Sun Sep 20 5:00 PM')
    expect(view.text).not.toMatch(/11114/)
    expect(view.text).not.toMatch(/^\d{2}:\d{2}$/)
  })

  it('live but more than 2h away is --:--, never CLOSED', () => {
    const now = 1_700_000_000_000
    const view = closeClockView({
      closeAt: now + LIVE_COUNTDOWN_MAX_MS + 1,
      live: true,
      now,
      nextOpenLabel: 'Sun 5:00 PM',
    })
    expect(view).toEqual({ kind: 'live', text: '--:--' })
    expect(view.text).not.toMatch(/CLOSED/)
  })

  it('Friday night BTC/NG/CU LIVE 15m is mm:ss even when CME hours are closed', () => {
    const now = Date.parse('2026-09-18T21:25:00-05:00')
    const closeAt = Date.parse('2026-09-18T21:30:00-05:00')
    expect(tapeSessionHours('ng', now).open).toBe(false)
    expect(tapeSessionHours('cu', now).open).toBe(false)
    expect(tapeSessionHours('btc', now).open).toBe(true)
    for (const tape of ['btc', 'ng', 'cu'] as const) {
      expect(closeClockLive({ stale: false, tradingActive: true, closeAt, now })).toBe(true)
      const view = closeClockView({
        closeAt,
        tradingActive: true,
        stale: false,
        now,
        nextOpenLabel: 'Sun Sep 20 5:00 PM',
      })
      expect(view.kind).toBe('live')
      expect(view.text).toBe('05:00')
      expect(view.text).not.toMatch(/CLOSED/)
      void tape
    }
  })

  it('tradingActive LIVE wins even if a caller passes live=false (CME hours)', () => {
    const now = Date.parse('2026-09-18T21:27:00-05:00')
    const closeAt = Date.parse('2026-09-18T21:30:00-05:00')
    const view = closeClockView({
      closeAt,
      live: false,
      tradingActive: true,
      stale: false,
      now,
      nextOpenLabel: 'Sun Sep 20 5:00 PM',
    })
    expect(view).toEqual({ kind: 'live', text: '03:00' })
  })

  it('not live always CLOSED even with a near closeAt', () => {
    const now = 1_700_000_000_000
    expect(closeClockView({ closeAt: now + 60_000, live: false, now })).toEqual({ kind: 'closed', text: 'CLOSED' })
  })

  it('tradingActive LIVE keeps mm:ss even when STALE is forced', () => {
    const now = Date.parse('2026-09-19T20:57:00-05:00')
    const view = closeClockView({
      closeAt: now + 95_000,
      live: false,
      stale: true,
      tradingActive: true,
      now,
      nextOpenLabel: 'Sun Sep 20 5:00 PM',
    })
    expect(closeClockLive({ stale: true, tradingActive: true, closeAt: now + 95_000, now })).toBe(true)
    expect(view.kind).toBe('live')
    expect(view.text).toBe('01:35')
    expect(view.text).not.toMatch(/CLOSED/)
  })

  it('tradingActive false stays CLOSED even if live=true', () => {
    const now = Date.parse('2026-09-19T20:57:00-05:00')
    const view = closeClockView({
      closeAt: now + 95_000,
      live: true,
      stale: false,
      tradingActive: false,
      now,
      nextOpenLabel: 'Sun Sep 20 5:00 PM',
    })
    expect(view).toEqual({ kind: 'closed', text: 'CLOSED · Sun Sep 20 5:00 PM' })
  })
})
