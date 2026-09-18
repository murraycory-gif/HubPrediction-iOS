import { useMemo } from 'react'
import { CLOCK_MS, DEFAULT_CLOCK, TAPE_META, type TapeClock, type TapeId } from '../lib/tapes'
import type { Point } from '../lib/types'

const MAX_DOTS = 48

/** Downsample live prints for the selected Kalshi window. Soft FAIL a hard-coded 15m clip on 1h. */
export function cleanRacePoints(
  points: Point[] | undefined,
  now = Date.now(),
  windowMs = CLOCK_MS[DEFAULT_CLOCK],
  openAt?: number,
  closeAt?: number,
): Point[] {
  const from = Number.isFinite(openAt) && (openAt as number) > 0 ? (openAt as number) : now - windowMs
  const to = Number.isFinite(closeAt) && (closeAt as number) > 0 ? Math.min(now, closeAt as number) : now
  const raw = (points ?? []).filter(
    (p) => p && Number.isFinite(p.t) && Number.isFinite(p.px) && p.px > 0 && p.t >= from - 2000 && p.t <= to + 2000,
  )
  if (raw.length <= MAX_DOTS) return raw
  const step = Math.ceil(raw.length / MAX_DOTS)
  const out: Point[] = []
  for (let i = 0; i < raw.length; i += step) out.push(raw[i])
  const last = raw[raw.length - 1]
  if (out[out.length - 1]?.t !== last.t) out.push(last)
  return out
}

/** Per-tape zoom around BEAT / live. Soft FAIL drawing Gold on a BTC ±$90 scale. */
export function raceDomain(id: TapeId, beat: number, live: number | null, pts: Point[]) {
  const ys = pts.map((p) => p.px)
  if (Number.isFinite(beat) && beat > 0) ys.push(beat)
  if (live != null && Number.isFinite(live) && live > 0) ys.push(live)
  const mid = (Number.isFinite(beat) && beat > 0 ? beat : live) || 1
  const floor =
    id === 'btc' ? 90 : id === 'gld' ? 2 : id === 'ng' || id === 'cu' ? 0.004 : 1
  if (!ys.length) return { lo: mid - floor, hi: mid + floor }
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  const span = hi - lo
  if (span < floor) {
    lo = mid - floor
    hi = mid + floor
  } else {
    const pad = span * 0.12
    lo -= pad
    hi += pad
  }
  return { lo, hi }
}

export function RaceChart({
  id,
  beat,
  live,
  points,
  clock = DEFAULT_CLOCK,
  openAt,
  closeAt,
}: {
  id: TapeId
  beat: number
  live: number | null
  points?: Point[]
  clock?: TapeClock
  openAt?: number
  closeAt?: number
}) {
  const now = points?.length ? points[points.length - 1]!.t : Date.now()
  const windowMs = CLOCK_MS[clock]
  const pts = useMemo(
    () => cleanRacePoints(points, now, windowMs, openAt, closeAt),
    [points, now, windowMs, openAt, closeAt],
  )
  const { lo, hi } = raceDomain(id, beat, live, pts)
  const w = 320
  const h = 72
  const start = Number.isFinite(openAt) && (openAt as number) > 0 ? (openAt as number) : (pts[0]?.t ?? now - windowMs)
  const end = Number.isFinite(closeAt) && (closeAt as number) > 0 ? (closeAt as number) : Math.max(now, pts[pts.length - 1]?.t ?? now)
  const span = Math.max(1, end - start)
  const range = Math.max(1e-9, hi - lo)

  const path = pts
    .map((p) => {
      const x = ((p.t - start) / span) * w
      const y = h - ((p.px - lo) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const beatY = Number.isFinite(beat) && beat > 0 ? h - ((beat - lo) / range) * h : h / 2
  const liveY =
    live != null && Number.isFinite(live) ? h - ((live - lo) / range) * h : null

  return (
    <div className={`race race-${id}`} data-testid={`race-${id}`} aria-label={`${TAPE_META[id].label} race`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="race-svg" role="img">
        <line x1="0" y1={beatY} x2={w} y2={beatY} className="race-beat" />
        {path ? (
          <polyline className="race-path" fill="none" points={path} />
        ) : (
          <line x1="0" y1={h / 2} x2={w} y2={h / 2} className="race-empty" />
        )}
        {liveY != null ? <circle className="race-live" cx={w - 3} cy={liveY} r="2.4" /> : null}
      </svg>
    </div>
  )
}
