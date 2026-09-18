import { useEffect, useMemo, useRef, useState } from 'react'
import { formatChartTick } from '../lib/chicago-time'
import {
  cleanRacePoints,
  mergeRaceTrail,
  raceLinePath,
} from '../lib/race-path'
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

/** Ease the on-screen NOW print toward the latest Kalshi last. Logic still uses raw live. */
export function useSmoothedLive(live: number | null, ms = 160) {
  const [shown, setShown] = useState(live)
  const shownRef = useRef(live)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])
  useEffect(() => {
    if (live == null || !Number.isFinite(live) || live <= 0) {
      setShown(live)
      return
    }
    const from = shownRef.current
    if (from == null || !Number.isFinite(from)) {
      setShown(live)
      return
    }
    if (from === live) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - (1 - p) * (1 - p)
      setShown(from + (live - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live, ms])
  return shown
}

function useWallClock(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last >= 48) {
        last = t
        setNow(Date.now())
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on])
  return now
}

export function RaceChart({
  id,
  beat,
  live,
  displayLive,
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
  displayLive?: number | null
  points?: Point[]
  clock?: TapeClock
  chart?: ChartRange
  openAt?: number
  closeAt?: number
  onChart?: (chart: ChartRange) => void
}) {
  const wall = useWallClock(chart === 'live')
  const trailRef = useRef<Point[]>([])
  const [trail, setTrail] = useState<Point[]>([])

  useEffect(() => {
    trailRef.current = []
    setTrail([])
  }, [id, openAt, closeAt])

  useEffect(() => {
    const next = mergeRaceTrail(trailRef.current, points, live, Date.now())
    trailRef.current = next
    setTrail(next)
  }, [points, live])

  const shown =
    displayLive != null && Number.isFinite(displayLive) && (displayLive as number) > 0 ? displayLive : live
  const now = chart === 'live' ? wall : trail.length ? trail[trail.length - 1]!.t : Date.now()
  const windowMs = CHART_MS[chart] ?? CLOCK_MS[clock]
  const pts = useMemo(
    () => cleanRacePoints(trail.length ? trail : points, now, windowMs, openAt, closeAt),
    [trail, points, now, windowMs, openAt, closeAt],
  )
  const drawPts = useMemo(() => {
    if (shown == null || !Number.isFinite(shown) || !pts.length) return pts
    const last = pts[pts.length - 1]!
    if (last.px === shown) return pts
    return [...pts.slice(0, -1), { t: last.t, px: shown }]
  }, [pts, shown])
  const { lo, hi } = raceDomain(id, beat, shown, drawPts)
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

  const line = raceLinePath(drawPts, xOf, yOf)
  const area = drawPts.length
    ? `${line} L${xOf(drawPts[drawPts.length - 1]!.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)} L${xOf(drawPts[0]!.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)} Z`
    : ''

  const beatY = Number.isFinite(beat) && beat > 0 ? yOf(beat) : PAD.t + innerH / 2
  const liveY = shown != null && Number.isFinite(shown) ? yOf(shown) : null
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
