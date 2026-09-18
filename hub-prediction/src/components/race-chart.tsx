import { useMemo } from 'react'
import {
  CHART_LABELS,
  CHART_MS,
  CHART_RANGES,
  CLOCK_MS,
  DEFAULT_CHART,
  DEFAULT_CLOCK,
  TAPE_META,
  type ChartRange,
  type TapeClock,
  type TapeId,
} from '../lib/tapes'
import type { Point } from '../lib/types'

const MAX_DOTS = 80

/** Downsample live prints for the selected Kalshi-style chart window. */
export function cleanRacePoints(
  points: Point[] | undefined,
  now = Date.now(),
  windowMs = CLOCK_MS[DEFAULT_CLOCK],
  openAt?: number,
  closeAt?: number,
): Point[] {
  const from = now - windowMs
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
  chart = DEFAULT_CHART,
  openAt,
  closeAt,
  onChart,
}: {
  id: TapeId
  beat: number
  live: number | null
  points?: Point[]
  clock?: TapeClock
  chart?: ChartRange
  openAt?: number
  closeAt?: number
  onChart?: (chart: ChartRange) => void
}) {
  const now = points?.length ? points[points.length - 1]!.t : Date.now()
  const windowMs = CHART_MS[chart] ?? CLOCK_MS[clock]
  const pts = useMemo(
    () => cleanRacePoints(points, now, windowMs, openAt, closeAt),
    [points, now, windowMs, openAt, closeAt],
  )
  const { lo, hi } = raceDomain(id, beat, live, pts)
  const w = 640
  const h = 168
  const start = now - windowMs
  const end = now
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
      <div className="chart-ranges" data-testid={`chart-range-${id}`}>
        {CHART_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={`chart-range glyph-plate${chart === r ? ' toggle-on' : ''}`}
            data-testid={`chart-range-${id}-${r}`}
            aria-pressed={chart === r}
            onClick={() => onChart?.(r)}
          >
            {CHART_LABELS[r]}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="race-svg" role="img">
        <line x1="0" y1={beatY} x2={w} y2={beatY} className="race-beat" />
        {path ? (
          <polyline className="race-path" fill="none" points={path} />
        ) : (
          <line x1="0" y1={h / 2} x2={w} y2={h / 2} className="race-empty" />
        )}
        {liveY != null ? <circle className="race-live" cx={w - 6} cy={liveY} r="4.2" /> : null}
      </svg>
      <p className="chart-key">
        <span className="chart-key-beat">BEAT</span>
        <span className="chart-key-live">LIVE</span>
        <span>{CHART_LABELS[chart]}</span>
      </p>
    </div>
  )
}
