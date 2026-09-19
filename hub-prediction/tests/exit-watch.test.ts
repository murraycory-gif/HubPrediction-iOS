import { describe, expect, it } from 'vitest'
import {
  BUFFER_SALVAGE_USD,
  BUFFER_USD,
  EXIT_WATCH_LIVE,
  MIN_LOCK_USD,
  VELOCITY_USD_PER_SEC,
  applyExitDecision,
  contractBidCents,
  decideExitWatch,
  distanceToBeat,
  exitLockedDollars,
  projectedCrossesBeat,
  recentExitLogs,
  velocityTowardBeat,
  type ExitWatchInput,
} from '../src/lib/exit-watch'

const closeAt = Date.now() + 6 * 60_000
const now = Date.now()

function fadePoints(from: number, to: number, start = now - 45_000) {
  const n = 8
  return Array.from({ length: n }, (_, i) => ({
    t: start + (45_000 * i) / (n - 1),
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
    noAsk: 22,
    fillCount: 20,
    now,
    ...over,
  }
}

describe('EXIT WATCH paper', () => {
  it('Soft FAIL Live auto-sell', () => {
    expect(EXIT_WATCH_LIVE).toBe(false)
    expect(BUFFER_USD).toBe(20)
    expect(BUFFER_SALVAGE_USD).toBe(12)
    expect(VELOCITY_USD_PER_SEC).toBe(0.8)
    expect(MIN_LOCK_USD).toBe(0.4)
  })

  it('distance + velocity + projected cross', () => {
    expect(distanceToBeat('up', 80_080, 80_000)).toBe(80)
    expect(distanceToBeat('down', 79_920, 80_000)).toBe(80)
    const fade = velocityTowardBeat('btc', 'up', fadePoints(80_120, 80_040), now)
    expect(fade.firstTick).toBe(false)
    expect(fade.vel).toBeGreaterThanOrEqual(VELOCITY_USD_PER_SEC)
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

  it('fade-to-beat + velocity paper EXIT with ≥$0.40 lock', () => {
    const d = decideExitWatch(fill())
    expect(d.action).toBe('exit')
    expect(d.crosses).toBe(true)
    expect(d.vel).toBeGreaterThanOrEqual(VELOCITY_USD_PER_SEC)
    expect(d.locked).toBeGreaterThanOrEqual(MIN_LOCK_USD)
    expect(d.why).toMatch(/Profit lock/)
    expect(d.why).toMatch(/Live Soft FAIL/)
    expect(d.liveSell).toBe(false)
    expect(contractBidCents('up', 75, 22)).toBe(78)
    expect(exitLockedDollars({ count: 20, entryAsk: 70, bidCents: 78 })).toBeGreaterThanOrEqual(MIN_LOCK_USD)
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
    expect(d.liveSell).toBe(false)
  })

  it('Soft FAIL sell without 0.80/s and Soft FAIL salvage above $12', () => {
    const slow = decideExitWatch(
      fill({
        live: 80_100,
        points: fadePoints(80_120, 80_100),
      }),
    )
    expect(slow.action).toBe('hold')
    expect(slow.vel).toBeLessThan(VELOCITY_USD_PER_SEC)
    expect(slow.why).toMatch(/0\.80\/s/)

    const deep = decideExitWatch(
      fill({
        live: 80_050,
        closeAt: now + 20_000,
        points: fadePoints(80_050 + 0.9 * 45, 80_050),
      }),
    )
    expect(deep.action).toBe('hold')
    expect(deep.dist).toBeGreaterThanOrEqual(BUFFER_USD)
    expect(deep.why).toMatch(/buffer ≥ \$20/)

    const salvageHold = decideExitWatch(
      fill({
        live: 80_015,
        noAsk: 40,
        points: fadePoints(80_100, 80_015),
      }),
    )
    expect(salvageHold.action).toBe('hold')
    expect(salvageHold.locked).toBeLessThan(MIN_LOCK_USD)
    expect(salvageHold.dist).toBeGreaterThanOrEqual(BUFFER_SALVAGE_USD)
    expect(salvageHold.why).toMatch(/salvage above \$12/)

    const salvageExit = decideExitWatch(
      fill({
        live: 80_008,
        noAsk: 40,
        points: fadePoints(80_100, 80_008),
      }),
    )
    expect(salvageExit.action).toBe('exit')
    expect(salvageExit.locked).toBeLessThan(MIN_LOCK_USD)
    expect(salvageExit.why).toMatch(/Max salvage/)
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
    expect(recentExitLogs(once)[0]?.orderId).toBe('01exit-btc-fill-aaaa')
  })
})
