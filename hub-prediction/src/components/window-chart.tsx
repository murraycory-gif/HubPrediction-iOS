import { useMemo, useRef, useState } from 'react'
import { formatClock } from '../lib/chicago-time'
import { emaSlope, forwardRay, rebasePrior, slopeFromPoints, yDomain } from '../lib/forecast'
import type { DeskSide, Point } from '../lib/types'

type Zoom = 60 | 30 | 15

function mergePath(a: Point[] | undefined, b: Point[] | undefined) {
  const map = new Map<number, number>()
  for (const p of a ?? []) {
    if (p && Number.isFinite(p.t) && Number.isFinite(p.px)) map.set(Math.round(p.t / 1000) * 1000, p.px)
  }
  for (const p of b ?? []) {
    if (p && Number.isFinite(p.t) && Number.isFinite(p.px)) map.set(Math.round(p.t / 1000) * 1000, p.px)
  }
  return [...map.entries()]
    .map(([t, px]) => ({ t, px }))
    .sort((x, y) => x.t - y.t)
}

function toPoints(list: Point[], start: number, end: number, lo: number, hi: number, w: number, h: number) {
  const span = Math.max(1, end - start)
  const range = Math.max(1, hi - lo)
  return list
    .filter((p) => p.t >= start - 2000 && p.t <= end + 2000)
    .map((p) => {
      const x = ((p.t - start) / span) * w
      const y = h - ((p.px - lo) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function WindowChart(props: {
  live: number
  closeAt: number
  openAt: number
  points?: Point[]
  prior?: Point[]
  trail?: Point[]
  lean: DeskSide
}) {
  const [zoom, setZoom] = useState<Zoom>(60)
  const [pan, setPan] = useState(0)
  const slopeRef = useRef<number | null>(null)

  const now = props.points?.length ? props.points[props.points.length - 1]?.t || Date.now() : Date.now()
  const actual = mergePath(props.points, props.trail)
  const rawSlope = slopeFromPoints(actual, now)
  const slope = emaSlope(slopeRef.current, rawSlope)
  slopeRef.current = slope

  const prior = rebasePrior(props.prior, props.live)
  const forecast = forwardRay({
    now,
    closeAt: props.closeAt,
    live: props.live,
    slopePerMin: slope,
    lean: props.lean,
  })

  const lastForecast = forecast[forecast.length - 1]?.t ?? now
  const cursor = now + pan
  const start = cursor - zoom * 60_000
  const end = cursor + Math.max(16 * 60_000, lastForecast - now)
  const ys = [...actual.map((p) => p.px), ...prior.map((p) => p.px), ...forecast.map((p) => p.px), props.live]
  const [lo, hi] = yDomain(props.live, ys)
  const forecastPts = forecast.map((p) => p.px.toFixed(2)).join(',')

  const w = 300
  const h = 168
  const actualD = useMemo(() => toPoints(actual, start, end, lo, hi, w, h), [actual, start, end, lo, hi])
  const priorD = useMemo(() => toPoints(prior, start, end, lo, hi, w, h), [prior, start, end, lo, hi])
  const nextD = useMemo(() => toPoints(forecast, start, end, lo, hi, w, h), [forecast, start, end, lo, hi])

  const ticks = [start, start + (end - start) / 2, end]

  return (
    <section className="mt-3 px-4" data-testid="window-chart">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="hud-label">Trend // path</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => setPan((p) => p - zoom * 30_000)}
            aria-label="Pan earlier"
          >
            {'<'}
          </button>
          {([60, 30, 15] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                setZoom(z)
                setPan(0)
              }}
              className={`zoom-btn min-w-[3.1rem] ${zoom === z ? 'zoom-btn-on' : ''}`}
            >
              {z}m
            </button>
          ))}
          <button
            type="button"
            className="zoom-btn"
            onClick={() => setPan((p) => p + zoom * 30_000)}
            aria-label="Pan later"
          >
            {'>'}
          </button>
        </div>
      </div>
      <div data-testid="forecast-pts" data-pts={forecastPts} className="hidden" />
      <div className="hud-panel px-1 pt-1">
        <svg viewBox={`0 0 ${w + 44} 200`} className="h-[220px] w-full" role="img" aria-label="BTC trend">
          <text x="0" y="14" fill="#6f8a7d" fontSize="10">
            {Math.round(hi)}
          </text>
          <text x="0" y="100" fill="#00e57a" fontSize="10">
            {Math.round(props.live)}
          </text>
          <text x="0" y="186" fill="#6f8a7d" fontSize="10">
            {Math.round(lo)}
          </text>
          <g transform="translate(44,8)">
            <line x1="0" y1={h / 3} x2={w} y2={h / 3} stroke="#163226" />
            <line x1="0" y1={(h * 2) / 3} x2={w} y2={(h * 2) / 3} stroke="#163226" />
            <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#1d3d2c" />
            {priorD ? (
              <polyline
                data-testid="prior-line"
                fill="none"
                stroke="#4d5c55"
                strokeWidth="1.5"
                points={priorD}
              />
            ) : null}
            {actualD ? (
              <polyline
                data-testid="actual-line"
                fill="none"
                stroke="#00e57a"
                strokeWidth="2.2"
                points={actualD}
              />
            ) : null}
            {nextD ? (
              <polyline
                data-testid="next-line"
                fill="none"
                stroke="#00e57a"
                strokeWidth="1.6"
                strokeDasharray="5 4"
                points={nextD}
              />
            ) : null}
          </g>
          {ticks.map((t, i) => (
            <text key={t} x={44 + (i * w) / 2} y={198} fill="#6f8a7d" fontSize="10">
              {formatClock(t)}
            </text>
          ))}
        </svg>
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-wide text-mute">
        GREEN this week · GRAY last week rebased · DASH next 15m
      </p>
    </section>
  )
}
