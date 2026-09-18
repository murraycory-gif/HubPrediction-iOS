import type { Point } from './types'

export const MAX_RACE_DOTS = 180
export const TRAIL_KEEP_MS = 2 * 60 * 60 * 1000

export function pointTime(t: number) {
  if (!Number.isFinite(t)) return null
  if (t >= 1e12) return t
  if (t >= 1e9) return t * 1000
  return t
}

export function mergeRaceTrail(
  prev: Point[] | undefined,
  incoming: Point[] | undefined,
  live?: number | null,
  now = Date.now(),
): Point[] {
  const bag = new Map<number, number>()
  for (const row of [prev, incoming]) {
    for (const p of row ?? []) {
      const t = pointTime(p.t)
      if (t == null || t < now - TRAIL_KEEP_MS || !Number.isFinite(p.px) || p.px <= 0) continue
      bag.set(t, p.px)
    }
  }
  if (live != null && Number.isFinite(live) && live > 0) {
    let lastT = 0
    for (const t of bag.keys()) if (t > lastT) lastT = t
    if (bag.get(lastT) !== live) bag.set(now, live)
  }
  return [...bag.entries()]
    .map(([t, px]) => ({ t, px }))
    .sort((a, b) => a.t - b.t)
}

function bucketExtrema(pts: Point[], maxDots: number): Point[] {
  if (pts.length <= maxDots) return pts
  const t0 = pts[0]!.t
  const t1 = pts[pts.length - 1]!.t
  const span = Math.max(1, t1 - t0)
  const buckets = Math.max(2, Math.floor(maxDots / 2))
  const out: Point[] = []
  let i = 0
  for (let b = 0; b < buckets; b++) {
    const hi = t0 + (span * (b + 1)) / buckets
    let min = pts[i]
    let max = pts[i]
    let any = false
    while (i < pts.length && pts[i]!.t <= hi) {
      const p = pts[i]!
      any = true
      if (p.px < (min?.px ?? p.px)) min = p
      if (p.px > (max?.px ?? p.px)) max = p
      i++
    }
    if (!any || !min || !max) continue
    if (min.t <= max.t) {
      out.push(min)
      if (max.t !== min.t) out.push(max)
    } else {
      out.push(max)
      if (min.t !== max.t) out.push(min)
    }
  }
  const last = pts[pts.length - 1]!
  if (out[out.length - 1]?.t !== last.t) out.push(last)
  if (out[0]?.t !== pts[0]!.t) out.unshift(pts[0]!)
  if (out.length <= maxDots) return out
  const slim: Point[] = []
  const step = (out.length - 1) / (maxDots - 1)
  for (let i = 0; i < maxDots - 1; i++) slim.push(out[Math.round(i * step)]!)
  slim.push(last)
  return slim
}

/** Light 3-point average for draw only. Keeps the last print exact. */
export function smoothDrawPoints(pts: Point[]): Point[] {
  if (pts.length < 4) return pts
  const out: Point[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!.px
    const b = pts[i]!.px
    const c = pts[i + 1]!.px
    out.push({ t: pts[i]!.t, px: (a + b + b + c) / 4 })
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/** Window the trail, hold the last print to now (Kalshi LIVE), keep shape when downsampling. */
export function cleanRacePoints(
  points: Point[] | undefined,
  now = Date.now(),
  windowMs = 15 * 60_000,
  _openAt?: number,
  closeAt?: number,
): Point[] {
  const from = now - windowMs
  const to = Number.isFinite(closeAt) && (closeAt as number) > 0 ? Math.min(now, closeAt as number) : now
  const raw: Point[] = []
  for (const p of points ?? []) {
    const t = pointTime(p.t)
    if (t == null || !Number.isFinite(p.px) || p.px <= 0) continue
    if (t < from - 2000 || t > to + 2000) continue
    raw.push({ t, px: p.px })
  }
  raw.sort((a, b) => a.t - b.t)
  const last = raw[raw.length - 1]
  if (last && to - last.t > 80) raw.push({ t: to, px: last.px })
  if (raw.length <= MAX_RACE_DOTS) return raw
  return bucketExtrema(raw, MAX_RACE_DOTS)
}

/** Monotone cubic (no overshoot) — Kalshi-like smooth print path. */
export function raceLinePath(
  pts: Point[],
  xOf: (t: number) => number,
  yOf: (px: number) => number,
): string {
  if (!pts.length) return ''
  const xs = pts.map((p) => xOf(p.t))
  const ys = pts.map((p) => yOf(p.px))
  if (pts.length < 3) {
    return pts.map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i]!.toFixed(2)},${ys[i]!.toFixed(2)}`).join(' ')
  }
  const n = pts.length
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1]! - xs[i]!
    m[i] = dx[i] !== 0 ? (ys[i + 1]! - ys[i]!) / dx[i]! : 0
  }
  const tang = [m[0] ?? 0]
  for (let i = 1; i < n - 1; i++) {
    tang[i] = (m[i - 1] ?? 0) * (m[i] ?? 0) <= 0 ? 0 : ((m[i - 1] ?? 0) + (m[i] ?? 0)) / 2
  }
  tang[n - 1] = m[n - 2] ?? 0
  for (let i = 0; i < n - 1; i++) {
    const slope = m[i] ?? 0
    if (Math.abs(slope) < 1e-12) {
      tang[i] = 0
      tang[i + 1] = 0
      continue
    }
    const a = (tang[i] ?? 0) / slope
    const b = (tang[i + 1] ?? 0) / slope
    const s = a * a + b * b
    if (s > 9) {
      const f = 3 / Math.sqrt(s)
      tang[i] = f * a * slope
      tang[i + 1] = f * b * slope
    }
  }
  let d = `M${xs[0]!.toFixed(2)},${ys[0]!.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] ?? 0
    const x1 = xs[i]! + h / 3
    const y1 = ys[i]! + (tang[i] ?? 0) * h / 3
    const x2 = xs[i + 1]! - h / 3
    const y2 = ys[i + 1]! - (tang[i + 1] ?? 0) * h / 3
    d += ` C${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${xs[i + 1]!.toFixed(2)},${ys[i + 1]!.toFixed(2)}`
  }
  return d
}
