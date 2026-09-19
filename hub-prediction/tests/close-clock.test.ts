import { describe, expect, it } from 'vitest'
import { LIVE_COUNTDOWN_MAX_MS, closeClockView } from '../src/lib/close-clock'

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

  it('Friday night CU LIVE 15m is mm:ss, not CLOSED · Sunday', () => {
    const now = Date.parse('2026-09-18T21:25:00-05:00')
    const closeAt = Date.parse('2026-09-18T21:30:00-05:00')
    const view = closeClockView({
      closeAt,
      live: true,
      now,
      nextOpenLabel: 'Sun Sep 20 5:00 PM',
    })
    expect(view.kind).toBe('live')
    expect(view.text).toBe('05:00')
    expect(view.text).not.toMatch(/CLOSED/)
  })

  it('not live always CLOSED even with a near closeAt', () => {
    const now = 1_700_000_000_000
    expect(closeClockView({ closeAt: now + 60_000, live: false, now })).toEqual({ kind: 'closed', text: 'CLOSED' })
  })
})
