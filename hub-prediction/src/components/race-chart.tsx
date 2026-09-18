import { useMemo } from 'react'
import { formatChartTick } from '../lib/chicago-time'
import {
  CHART_LABELS,
  CHART_MS,
  CHART_RANGES,
  CLOCK_MS,
  DEFAULT_CHART,
  DEFAULT_CLOCK,
  TAPE_META,
  formatLive,
  nowTone,
  type ChartRange,
  type TapeClock,
  type TapeId,
} from '../lib/tapes'
import type { Point } from '../lib/types'

const MAX_DOTS = 120
const PAD = { l: 8, r: 78, t: 18, b: 24 }
const TAPE_STROKE: Record<TapeId, string> = {
  btc: '#f7931a',
  ng: '#4ea3ff',
  cu: '#c47a3a',
  gld: '#d4af37',
}

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
  const h = 220
  const innerW = w - PAD.l - PAD.r
  const innerH = h - PAD.t - PAD.b
  const start = now - windowMs
  const end = now
  const span = Math.max(1, end - start)
  const range = Math.max(1e-9, hi - lo)
  const stroke = TAPE_STROKE[id]
  const tone = nowTone(live, beat)

  const xOf = (t: number) => PAD.l + ((t - start) / span) * innerW
  const yOf = (px: number) => PAD.t + innerH - ((px - lo) / range) * innerH

  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.px).toFixed(1)}`)
    .join(' ')
  const area = pts.length
    ? `${line} L${xOf(pts[pts.length - 1]!.t).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${xOf(pts[0]!.t).toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z`
    : ''

  const beatY = Number.isFinite(beat) && beat > 0 ? yOf(beat) : PAD.t + innerH / 2
  const liveY = live != null && Number.isFinite(live) ? yOf(live) : null
  const liveX = liveY != null ? (pts.length ? xOf(pts[pts.length - 1]!.t) : PAD.l + innerW) : null
  const vsPct =
    live != null && Number.isFinite(live) && Number.isFinite(beat) && beat > 0
      ? ((live - beat) / beat) * 100
      : null

  const xTicks = [0, 0.33, 0.66, 1].map((p) => start + span * p)
  const yTicks = [hi, (hi + lo) / 2, lo]

  return (
    <div className={`race race-${id}`} data-testid={`race-${id}`} aria-label={`${TAPE_META[id].label} race`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="race-svg" role="img">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((px) => (
          <g key={`y-${px}`}>
            <line
              x1={PAD.l}
              y1={yOf(px)}
              x2={PAD.l + innerW}
              y2={yOf(px)}
              className="race-grid"
            />
            <text x={w - 6} y={yOf(px) + 4} className="race-axis" textAnchor="end">
              {formatLive(id, px)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x-${t}`} x={xOf(t)} y={h - 6} className="race-axis" textAnchor="middle">
            {formatChartTick(t, windowMs)}
          </text>
        ))}
        <line x1={PAD.l} y1={beatY} x2={PAD.l + innerW} y2={beatY} className="race-beat" />
        <text x={PAD.l + 6} y={beatY - 5} className="race-target">
          TARGET
        </text>
        {area ? <path d={area} fill={`url(#fill-${id})`} /> : null}
        {line ? (
          <path d={line} className="race-path" fill="none" stroke={stroke} />
        ) : (
          <line x1={PAD.l} y1={h / 2} x2={PAD.l + innerW} y2={h / 2} className="race-empty" />
        )}
        {liveY != null && liveX != null ? (
          <>
            <line
              x1={liveX}
              y1={liveY}
              x2={PAD.l + innerW}
              y2={liveY}
              className={`race-now-line tone-stroke-${tone ?? 'flat'}`}
            />
            <circle className={`race-live tone-fill-${tone ?? 'flat'}`} cx={liveX} cy={liveY} r="4.2" />
            {vsPct != null ? (
              <text
                x={PAD.l + innerW + 4}
                y={liveY + 4}
                className={`race-now-pct tone-${tone ?? 'flat'}`}
              >
                {`${vsPct > 0 ? '+' : vsPct < 0 ? '−' : ''}${Math.abs(vsPct).toFixed(3)}%`}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>
      <div className="chart-foot">
        <p className="chart-key">
          <span className="chart-key-beat">TARGET</span>
          <span className="chart-key-live">NOW</span>
        </p>
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
      </div>
    </div>
  )
}
