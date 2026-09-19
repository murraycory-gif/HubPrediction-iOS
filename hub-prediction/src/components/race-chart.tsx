import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { formatChartTick } from '../lib/chicago-time'
import { DESK_TICK_MS, useDeskTick } from '../lib/desk-tick'
import {
  cleanRacePoints,
  holdChartTrail,
  raceLinePath,
  smoothDrawPoints,
} from '../lib/race-path'
import {
  CHART_LABELS,
  CHART_RANGES,
  DEFAULT_CHART,
  DEFAULT_CLOCK,
  chartWindowMs,
  TAPE_META,
  formatLive,
  nowTone,
  type ChartRange,
  type TapeClock,
  type TapeId,
} from '../lib/tapes'
import type { Point } from '../lib/types'

export { cleanRacePoints, MAX_RACE_DOTS as MAX_DOTS } from '../lib/race-path'

const PAD = { l: 8, r: 78, t: 18, b: 24 }
const TAPE_STROKE: Record<TapeId, string> = {
  btc: '#f7931a',
  ng: '#4ea3ff',
  cu: '#c47a3a',
  gld: '#d4af37',
}

/** Per-tape zoom around BEAT / live. Soft FAIL drawing Gold on a BTC ±$90 scale. */
export function raceDomain(id: TapeId, beat: number, live: number | null, pts: Point[]) {
  const ys = pts.map((p) => p.px)
  if (Number.isFinite(beat) && beat > 0) ys.push(beat)
  if (live != null && Number.isFinite(live) && live > 0) ys.push(live)
  const mid = (Number.isFinite(beat) && beat > 0 ? beat : live) || 0
  const floor =
    id === 'btc' ? 90 : id === 'gld' ? 2 : id === 'ng' || id === 'cu' ? 0.004 : 1
  if (!ys.length) {
    if (!(mid > 0)) return { lo: 0, hi: 1 }
    return { lo: mid - floor, hi: mid + floor }
  }
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

/** Ease NOW toward the latest Kalshi last. Soft FAIL blank last-good. Soft FAIL a rAF per tape. Soft FAIL 1Hz. */
export function useSmoothedLive(live: number | null, ms = 70) {
  const tick = useDeskTick()
  const lastTick = useRef(tick)
  const held = useRef(live)
  if (live != null && Number.isFinite(live) && live > 0) held.current = live
  const target = live != null && Number.isFinite(live) && live > 0 ? live : held.current
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  if (shownRef.current == null && target != null && target > 0) {
    shownRef.current = target
  }
  useEffect(() => {
    const now = Date.now()
    const dt = Math.max(0, now - lastTick.current)
    lastTick.current = now
    const cur = shownRef.current
    let next = cur
    if (target == null || !Number.isFinite(target) || target <= 0) next = cur ?? held.current
    else if (cur == null || !Number.isFinite(cur) || (cur as number) <= 0) next = target
    else {
      const k = 1 - Math.exp(-(dt || DESK_TICK_MS) / ms)
      next = (cur as number) + (target - (cur as number)) * k
      if (Math.abs(next - target) <= Math.max(Math.abs(target) * 1e-7, 1e-6)) next = target
    }
    shownRef.current = next
    if (next !== shown) setShown(next)
  }, [tick, target, ms, shown])
  return shown ?? held.current
}

export const RaceChart = memo(function RaceChart({
  id,
  beat,
  live,
  displayLive,
  points,
  clock = DEFAULT_CLOCK,
  chart = DEFAULT_CHART,
  ticker,
  openAt,
  closeAt,
  onChart,
}: {
  id: TapeId
  beat: number
  live: number | null
  displayLive?: number | null
  points?: Point[]
  clock?: TapeClock
  chart?: ChartRange
  ticker?: string
  openAt?: number
  closeAt?: number
  onChart?: (chart: ChartRange) => void
}) {
  const wall = useDeskTick()
  const trailRef = useRef<Point[]>([])
  const lineHold = useRef('')
  const [trail, setTrail] = useState<Point[]>([])
  const resetRef = useRef(false)

  useEffect(() => {
    resetRef.current = true
  }, [id, ticker])

  useEffect(() => {
    const next = holdChartTrail(trailRef.current, points, live, resetRef.current, Date.now())
    if (resetRef.current && points?.length) resetRef.current = false
    const prev = trailRef.current
    const same =
      prev.length === next.length &&
      prev[prev.length - 1]?.t === next[next.length - 1]?.t &&
      prev[prev.length - 1]?.px === next[next.length - 1]?.px
    trailRef.current = next
    if (!same && next.length) setTrail(next)
  }, [points, live])

  const shown =
    displayLive != null && Number.isFinite(displayLive) && (displayLive as number) > 0 ? displayLive : live
  const now = chart === 'live' ? wall : trail.length ? trail[trail.length - 1]!.t : Date.now()
  const windowMs = chartWindowMs(chart, clock)
  const pts = useMemo(() => {
    const cleaned = cleanRacePoints(trail.length ? trail : points, now, windowMs, openAt, closeAt)
    if (cleaned.length) return cleaned
    const px =
      shown != null && Number.isFinite(shown) && shown > 0
        ? shown
        : Number.isFinite(beat) && beat > 0
          ? beat
          : null
    if (px == null) return []
    return [
      { t: now - windowMs, px },
      { t: now - windowMs / 2, px },
      { t: now, px },
    ]
  }, [trail, points, now, windowMs, openAt, closeAt, shown, beat])
  const drawPts = useMemo(() => {
    const smoothed = smoothDrawPoints(pts)
    if (shown == null || !Number.isFinite(shown) || !smoothed.length) return smoothed
    const last = smoothed[smoothed.length - 1]!
    if (last.px === shown) return smoothed
    return [...smoothed.slice(0, -1), { t: last.t, px: shown }]
  }, [pts, shown])
  const domainRef = useRef({ lo: 0, hi: 1 })
  const rawDomain = raceDomain(id, beat, live, pts)
  const mid = (rawDomain.lo + rawDomain.hi) / 2
  const pad = (rawDomain.hi - rawDomain.lo) * 0.1
  const inside =
    shown != null &&
    Number.isFinite(shown) &&
    shown >= domainRef.current.lo + pad &&
    shown <= domainRef.current.hi - pad &&
    beat > 0 &&
    beat >= domainRef.current.lo &&
    beat <= domainRef.current.hi &&
    Math.abs((domainRef.current.lo + domainRef.current.hi) / 2 - mid) < (rawDomain.hi - rawDomain.lo) * 0.35
  const { lo, hi } = inside && domainRef.current.hi > domainRef.current.lo ? domainRef.current : rawDomain
  domainRef.current = { lo, hi }
  const w = 640
  const h = 220
  const innerW = w - PAD.l - PAD.r
  const innerH = h - PAD.t - PAD.b
  const start = now - windowMs
  const end = now
  const span = Math.max(1, end - start)
  const range = Math.max(1e-9, hi - lo)
  const stroke = TAPE_STROKE[id]
  const tone = nowTone(shown, beat)

  const xOf = (t: number) => PAD.l + ((t - start) / span) * innerW
  const yOf = (px: number) => PAD.t + innerH - ((px - lo) / range) * innerH

  const waiting = !(beat > 0) && (shown == null || !Number.isFinite(shown) || shown <= 0) && !drawPts.length
  const beatY = Number.isFinite(beat) && beat > 0 ? yOf(beat) : PAD.t + innerH / 2
  const liveY = shown != null && Number.isFinite(shown) ? yOf(shown) : null
  const line = raceLinePath(drawPts, xOf, yOf)
  if (line) lineHold.current = line
  const holdY = liveY != null ? liveY : beatY
  const paintLine =
    line ||
    lineHold.current ||
    `M${PAD.l.toFixed(2)},${holdY.toFixed(2)} L${(PAD.l + innerW).toFixed(2)},${holdY.toFixed(2)}`
  const area = drawPts.length
    ? `${line || paintLine} L${xOf(drawPts[drawPts.length - 1]!.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)} L${xOf(drawPts[0]!.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)} Z`
    : ''
  const liveX = liveY != null ? (drawPts.length ? xOf(drawPts[drawPts.length - 1]!.t) : PAD.l + innerW) : null
  const vsPct =
    shown != null && Number.isFinite(shown) && Number.isFinite(beat) && beat > 0
      ? ((shown - beat) / beat) * 100
      : null

  const xTicks = [0, 0.33, 0.66, 1].map((p) => start + span * p)
  const yTicks = [hi, (hi + lo) / 2, lo]

  return (
    <div className={`race race-${id}`} data-testid={`race-${id}`} aria-label={`${TAPE_META[id].label} race`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="race-svg" role="img">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {waiting ? (
          <text x={w / 2} y={h / 2} className="race-axis" textAnchor="middle">
            Waiting on this clock
          </text>
        ) : (
          yTicks.map((px) => (
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
          ))
        )}
        {xTicks.map((t) => (
          <text key={`x-${Math.round(t / 1000)}`} x={xOf(t)} y={h - 6} className="race-axis" textAnchor="middle">
            {formatChartTick(Math.round(t / 1000) * 1000, windowMs)}
          </text>
        ))}
        <line x1={PAD.l} y1={beatY} x2={PAD.l + innerW} y2={beatY} className="race-beat" />
        <text x={PAD.l + 6} y={beatY - 5} className="race-target">
          TARGET
        </text>
        {area ? <path d={area} fill={`url(#fill-${id})`} /> : null}
        {paintLine ? (
          <path d={paintLine} className="race-path" fill="none" stroke={stroke} />
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
})
