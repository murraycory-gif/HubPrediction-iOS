import { describe, expect, it } from 'vitest'
import { contractsFromCash } from '../src/lib/size-cash'
import { forwardRay, maxStep, rebasePrior, yDomain } from '../src/lib/forecast'

describe('forwardRay', () => {
  it('is one continuous dashed next without an 80pt cliff', () => {
    const now = 1_700_000_000_000
    const ray = forwardRay({
      now,
      closeAt: now + 8 * 60_000,
      live: 77200,
      slopePerMin: 1.4,
      lean: 'up',
    })
    expect(ray.length).toBeGreaterThanOrEqual(2)
    expect(maxStep(ray)).toBeLessThan(40)
    expect(ray[0]?.px).toBeCloseTo(77200, 5)
    const last = ray[ray.length - 1]
    expect(last?.px).toBeGreaterThan(77200)
  })

  it('does not force live±8 steps when lean is up', () => {
    const now = Date.now()
    const ray = forwardRay({
      now,
      closeAt: now + 15 * 60_000,
      live: 77000,
      slopePerMin: 0.05,
      lean: 'up',
    })
    expect(Math.abs((ray[0]?.px ?? 0) - 77000)).toBeLessThan(0.01)
    expect(maxStep(ray)).toBeLessThan(10)
  })
})

describe('rebase + domain', () => {
  it('rebases last week onto live', () => {
    const prior = [
      { t: 1, px: 80000 },
      { t: 2, px: 80100 },
    ]
    const out = rebasePrior(prior, 77200)
    expect(out[1]?.px).toBeCloseTo(77200)
    expect(out[0]?.px).toBeCloseTo(77100)
  })

  it('clamps y near live', () => {
    const [lo, hi] = yDomain(77200, [77210, 90000, 10])
    expect(lo).toBeGreaterThan(77000)
    expect(hi).toBeLessThan(77500)
  })
})

describe('contractsFromCash', () => {
  it('sizes more than one contract on high conviction', () => {
    expect(contractsFromCash(250, 31, 0.72)).toBeGreaterThanOrEqual(2)
  })

  it('sits when cash or price is unusable', () => {
    expect(contractsFromCash(0, 31, 0.8)).toBe(0)
    expect(contractsFromCash(100, 99, 0.8)).toBe(0)
  })
})
