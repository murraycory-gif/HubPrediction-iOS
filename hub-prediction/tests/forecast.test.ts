import { describe, expect, it } from 'vitest'
import { cashFromBalancePayload, contractsFromCash } from '../src/lib/size-cash'
import {
  forwardRay,
  maxStep,
  rebasePrior,
  slotPreview,
  slotTheory,
  theoryBeatsNaive,
  vsOpen,
  yDomain,
} from '../src/lib/forecast'

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

describe('Grok Build slot theory', () => {
  const now = 1_700_000_000_000
  const nowSlot = now
  const lookNow = now
  const live = 77353

  it('upcoming theory uses fade + last-week shape, not raw last-week', () => {
    const t = now + 15 * 60_000
    const theory = slotTheory({
      t,
      nowSlot,
      lookNow,
      live,
      slope: 1.2,
      lastWeek: 79900,
      lastWeekNow: 80004,
      actual: null,
    })
    const naive = slotPreview({ t, nowSlot, lookNow, live, slope: 1.2, actual: null })
    expect(theory).not.toBeNull()
    expect(naive).not.toBeNull()
    // shape is −104; fade 15/90 keeps most of the slope but still applies shape
    expect(theory as number).toBeLessThan(naive as number)
    expect(theory as number).toBeCloseTo(live + 1.2 * 15 * (1 - 15 / 90) - 104, 5)
  })

  it('preview is empty once actual prints', () => {
    expect(
      slotPreview({
        t: nowSlot,
        nowSlot,
        lookNow,
        live,
        slope: 1.2,
        actual: 77353,
      }),
    ).toBeNull()
  })

  it('vs open is last-week slot minus last-week day open', () => {
    expect(vsOpen(80004, 79868)).toBeCloseTo(136, 5)
    expect(vsOpen(79830, 79868)).toBeCloseTo(-38, 5)
  })

  it('theory beats naive when last-week shape called the print', () => {
    const t = now + 15 * 60_000
    const theory = slotTheory({
      t,
      nowSlot,
      lookNow,
      live,
      slope: 2.0,
      lastWeek: 77000,
      lastWeekNow: 77353,
      actual: null,
    }) as number
    const naive = slotPreview({ t, nowSlot, lookNow, live, slope: 2.0, actual: null }) as number
    const actual = live - 300
    expect(theoryBeatsNaive(actual, theory, naive)).toBe(true)
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

describe('cashFromBalancePayload first-paint', () => {
  it('reads $293.37 from cents, dollars, and nested data', () => {
    expect(cashFromBalancePayload({ balance: 29337 })).toBeCloseTo(293.37)
    expect(cashFromBalancePayload({ balance_dollars: '293.37' })).toBeCloseTo(293.37)
    expect(cashFromBalancePayload({ data: { balance: 29337 } })).toBeCloseTo(293.37)
    expect(cashFromBalancePayload({ data: { balance_dollars: 293.37 } })).toBeCloseTo(293.37)
    expect(cashFromBalancePayload({ portfolio_value: 29337 })).toBeCloseTo(293.37)
    expect(cashFromBalancePayload({ balance: 293.37 })).toBeCloseTo(293.37)
  })

  it('does not paint cash from an empty payload', () => {
    expect(cashFromBalancePayload(null)).toBe(0)
    expect(cashFromBalancePayload({})).toBe(0)
  })
})
