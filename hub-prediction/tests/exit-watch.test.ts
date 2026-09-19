import { describe, expect, it } from 'vitest'
import {
  EXIT_WATCH_LIVE,
  applyExitDecision,
  contractBidCents,
  decideExitWatch,
  distanceToBeat,
  exitLockedDollars,
  projectedCrossesBeat,
  velocityTowardBeat,
  type ExitWatchInput,
} from '../src/lib/exit-watch'

const closeAt = Date.now() + 6 * 60_000
const now = Date.now()

function fadePoints(from: number, to: number, start = now - 40_000) {
  const n = 8
  return Array.from({ length: n }, (_, i) => ({
    t: start + (i * 40_000) / (n - 1),
    px: from + ((to - from) * i) / (n - 1),
  }))
}

function fill(over: Partial<ExitWatchInput> = {}): ExitWatchInput {
  return {
    tape: 'btc',
    ticker: 'KXBTC15M-EXITFADE',
    orderId: '01exit-btc-fill-aaaa',
    side: 'up',
    contracts: 20,
    entryAsk: 70,
    beat: 80_000,
    live: 80_040,
    closeAt,
    points: fadePoints(80_120, 80_040),
    yesAsk: 75,
    noAsk: 26,
    fillCount: 20,
    now,
    ...over,
  }
}

describe('EXIT WATCH paper', () => {
  it('Soft FAIL Live auto-sell', () => {
    expect(EXIT_WATCH_LIVE).toBe(false)
  })

  it('distance + velocity + projected cross', () => {
    expect(distanceToBeat('up', 80_080, 80_000)).toBe(80)
    expect(distanceToBeat('down', 79_920, 80_000)).toBe(80)
    const fade = velocityTowardBeat('btc', 'up', fadePoints(80_120, 80_040), now)
    expect(fade.firstTick).toBe(false)
    expect(fade.vel).toBeGreaterThan(0)
    const path = projectedCrossesBeat({ dist: 40, vel: fade.vel, closeAt, now })
    expect(path.crosses).toBe(true)
  })

  it('Soft FAIL first down tick', () => {
    const d = decideExitWatch(
      fill({
        points: [
          { t: now - 900, px: 80_080 },
          { t: now, px: 80_070 },
        ],
      }),
    )
    expect(d.action).toBe('hold')
    expect(d.firstTick).toBe(true)
    expect(d.why).toMatch(/first down tick/)
    expect(d.liveSell).toBe(false)
    expect(d.paper).toBe(true)
  })

  it('fade-to-beat paper EXIT with profit lock', () => {
    const d = decideExitWatch(fill())
    expect(d.action).toBe('exit')
    expect(d.crosses).toBe(true)
    expect(d.locked).toBeGreaterThan(0)
    expect(d.why).toMatch(/Profit lock/)
    expect(d.why).toMatch(/Live Soft FAIL/)
    expect(d.liveSell).toBe(false)
    expect(contractBidCents('up', 75, 26)).toBe(74)
    expect(exitLockedDollars({ count: 20, entryAsk: 70, bidCents: 74 })).toBeGreaterThan(0)
  })

  it('no-fade holds to settle', () => {
    const d = decideExitWatch(
      fill({
        live: 80_120,
        points: fadePoints(80_100, 80_130),
      }),
    )
    expect(d.action).toBe('hold')
    expect(d.crosses).toBe(false)
    expect(d.why).toMatch(/hold to settle/)
    expect(d.liveSell).toBe(false)
  })

  it('Soft FAIL already through / ghost / 0-fill', () => {
    expect(decideExitWatch(fill({ live: 79_900 })).action).toBe('hold')
    expect(decideExitWatch(fill({ live: 79_900 })).alreadyThrough).toBe(true)
    expect(decideExitWatch(fill({ orderId: 'deskfill-btc-ghost', fillCount: 20 })).action).toBe('hold')
    expect(decideExitWatch(fill({ fillCount: 0 })).action).toBe('hold')
  })

  it('Soft FAIL ghost sell rows and a second EXIT', () => {
    const d = decideExitWatch(fill())
    const once = applyExitDecision([], d, now)
    expect(once).toHaveLength(1)
    expect(once[0].action).toBe('exit')
    expect(once[0].paper).toBe(true)
    expect(once[0].liveSell).toBe(false)
    const twice = applyExitDecision(once, d, now + 1000)
    expect(twice).toHaveLength(1)
    const ghost = decideExitWatch(fill({ orderId: 'deskfill-btc-x' }))
    expect(applyExitDecision([], { ...ghost, action: 'exit', orderId: 'deskfill-btc-x' }, now)).toEqual([])
  })
})
