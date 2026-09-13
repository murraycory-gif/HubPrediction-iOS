import type { DeskSide, Point } from './types'

export const MAX_SLOPE = 2.2
export const EMA_KEEP = 0.82
export const EMA_NEW = 0.18

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function slopeFromPoints(points: Point[] | undefined, now: number) {
  const list = Array.isArray(points) ? points : []
  const from = now - 6 * 60_000
  const slice = list.filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.px) && p.t >= from && p.t <= now + 1500)
  if (slice.length < 2) return 0
  const a = slice[0]
  const b = slice[slice.length - 1]
  const mins = (b.t - a.t) / 60_000
  if (mins < 0.45) return 0
  return clamp((b.px - a.px) / mins, -MAX_SLOPE, MAX_SLOPE)
}

export function emaSlope(prev: number | null, raw: number) {
  if (prev == null || !Number.isFinite(prev)) return raw
  return prev * EMA_KEEP + raw * EMA_NEW
}

export function forwardRay(opts: {
  now: number
  closeAt: number
  live: number
  slopePerMin: number
  lean: DeskSide
}): Point[] {
  const live = opts.live
  const now = opts.now
  if (!Number.isFinite(live) || !Number.isFinite(now)) return []

  let slope = clamp(opts.slopePerMin, -MAX_SLOPE, MAX_SLOPE)
  if (Math.abs(slope) < 0.18 && opts.lean !== 'sit') {
    slope += opts.lean === 'up' ? 0.12 : -0.12
  }

  const closeAt = Number.isFinite(opts.closeAt) && opts.closeAt > now ? opts.closeAt : now + 15 * 60_000
  const lastT = Math.max(now + 16 * 60_000, closeAt + 15 * 60_000)
  const pxAt = (t: number) => live + slope * ((t - now) / 60_000)
  const times: number[] = []
  for (let t = now; t < lastT - 1; t += 60_000) times.push(t)
  times.push(lastT)
  return times.map((t) => ({ t, px: pxAt(t) }))
}

export function rebasePrior(prior: Point[] | undefined, live: number): Point[] {
  const list = Array.isArray(prior) ? prior.filter((p) => p && Number.isFinite(p.px) && Number.isFinite(p.t)) : []
  if (!list.length || !Number.isFinite(live)) return []
  const last = list[list.length - 1]?.px
  if (!Number.isFinite(last)) return []
  const shift = live - last
  return list.map((p) => ({ t: p.t, px: p.px + shift }))
}

export function yDomain(live: number, values: number[]): [number, number] {
  const base = Number.isFinite(live) ? live : 0
  const clamped = (values ?? []).filter((v) => Number.isFinite(v) && Math.abs(v - base) < 250)
  const lo = Math.min(base - 20, ...clamped)
  const hi = Math.max(base + 20, ...clamped)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [base - 20, base + 20]
  return [lo, hi]
}

export function maxStep(points: Point[]) {
  let max = 0
  const list = Array.isArray(points) ? points : []
  for (let i = 1; i < list.length; i++) {
    max = Math.max(max, Math.abs(list[i].px - list[i - 1].px))
  }
  return max
}

/** Grok Build / buildDashboard theory — fade + last-week shape, beats naive slope. */
export const THEORY_FADE_MINS = 90
export const THEORY_CLAMP = 10

export function slotTheory(opts: {
  t: number
  nowSlot: number
  lookNow: number
  live: number
  slope: number
  lastWeek: number | null
  lastWeekNow: number
  actual: number | null
}): number | null {
  const mins = (opts.t - opts.lookNow) / 60_000
  const fade = Math.max(0, 1 - Math.max(0, mins) / THEORY_FADE_MINS)
  const shape = opts.lastWeek != null ? opts.lastWeek - opts.lastWeekNow : 0
  const slope = clamp(opts.slope, -MAX_SLOPE, MAX_SLOPE)
  if (opts.t >= opts.nowSlot) {
    return opts.live + slope * Math.max(0, mins) * fade + shape
  }
  if (opts.actual != null) {
    const raw = opts.lastWeek != null ? opts.live + shape : opts.actual
    return Math.max(opts.actual - THEORY_CLAMP, Math.min(opts.actual + THEORY_CLAMP, raw))
  }
  return opts.lastWeek != null ? opts.live + shape : null
}

export function slotPreview(opts: {
  t: number
  nowSlot: number
  lookNow: number
  live: number
  slope: number
  actual: number | null
}): number | null {
  if (opts.actual != null) return null
  if (opts.t < opts.nowSlot) return null
  const mins = (opts.t - opts.lookNow) / 60_000
  return opts.live + clamp(opts.slope, -MAX_SLOPE, MAX_SLOPE) * Math.max(0, mins)
}

export function vsOpen(lastWeek: number | null, dayOpen: number | null) {
  if (lastWeek == null || dayOpen == null) return null
  if (!Number.isFinite(lastWeek) || !Number.isFinite(dayOpen)) return null
  return lastWeek - dayOpen
}

export function theoryBeatsNaive(actual: number, theory: number, preview: number) {
  return Math.abs(actual - theory) < Math.abs(actual - preview)
}
