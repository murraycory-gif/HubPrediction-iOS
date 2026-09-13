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
