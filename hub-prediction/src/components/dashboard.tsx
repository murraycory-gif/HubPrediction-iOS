import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getBtcDashboard, getKalshiBoard, getKalshiQuote } from '../lib/btc-data'
import { upcomingDays } from '../lib/chicago-time'
import { holdThesis, kalshiCall } from '../lib/kalshi-signal'
import {
  readBoardCache,
  readQuoteCache,
  writeBoardCache,
  writeDashCache,
  writeQuoteCache,
} from '../lib/hub-cache'
import { dollarsExact, mergeQuoteOntoBoard, signedDollars } from '../lib/rebase-kalshi'
import type { Dash, Quote } from '../lib/types'
import { CloseClock } from './close-clock'
import { KalshiView } from './kalshi-view'

export function Dashboard({ seedQuote, seedDash }: { seedQuote: Quote | null; seedDash?: Dash | null }) {
  const [clientQuote, setClientQuote] = useState<Quote | null>(null)
  const [clientBoard, setClientBoard] = useState<ReturnType<typeof readBoardCache>>(null)
  const [day, setDay] = useState(() => upcomingDays()[0]?.key ?? '')

  useEffect(() => {
    if (!seedQuote) setClientQuote(readQuoteCache())
    setClientBoard(readBoardCache())
  }, [seedQuote])

  const quoteQuery = useQuery({
    queryKey: ['quote'],
    queryFn: () => getKalshiQuote(),
    refetchInterval: 2000,
    placeholderData: keepPreviousData,
    initialData: seedQuote ?? undefined,
    staleTime: 1500,
  })

  const quote = quoteQuery.data ?? seedQuote ?? clientQuote
  const rawCall = useMemo(() => kalshiCall(quote), [quote?.ticker, quote?.live, quote?.strike, quote?.yesAsk, quote?.noAsk, quote?.fetchedAt])
  const [call, setCall] = useState(rawCall)
  useEffect(() => {
    setCall(holdThesis(quote, rawCall))
  }, [quote?.ticker, rawCall.label, rawCall.willBuy, rawCall.pWin, rawCall.side])

  const boardQuery = useQuery({
    queryKey: ['board'],
    queryFn: () => getKalshiBoard(),
    enabled: !!quote?.ticker,
    refetchInterval: 12_000,
    placeholderData: keepPreviousData,
    initialData: undefined,
    staleTime: 8000,
  })

  const dashQuery = useQuery({
    queryKey: ['dash', day],
    queryFn: () => getBtcDashboard({ data: { day } }),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
    initialData: seedDash ?? undefined,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (quoteQuery.data) writeQuoteCache(quoteQuery.data)
  }, [quoteQuery.data])
  useEffect(() => {
    if (boardQuery.data) writeBoardCache(boardQuery.data)
  }, [boardQuery.data])
  useEffect(() => {
    if (dashQuery.data) writeDashCache(dashQuery.data)
  }, [dashQuery.data])

  const board = boardQuery.data
    ? mergeQuoteOntoBoard(boardQuery.data, quote)
    : clientBoard
      ? mergeQuoteOntoBoard(clientBoard, quote)
      : null
  const days = upcomingDays()
  const tone = call.label === 'BUY UP' ? 'call-up' : call.label === 'BUY DOWN' ? 'call-down' : 'call-sit'

  return (
    <div className="desk">
      <header className="flex shrink-0 flex-col">
        <div className="overlay-slot" data-testid="overlay-slot" aria-hidden />
        <div className="call-pad">
          <div className={`call-bar px-4 py-3 ${tone}`} data-testid="call-bar">
            <div className="flex w-full items-end justify-between gap-3">
              <div>
                <p className="hud-kicker">Desk // signal</p>
                <p className="mt-1 font-mono text-3xl font-bold leading-none tracking-wide" data-testid="call-side">
                  {call.label}
                </p>
              </div>
              <CloseClock closeAt={quote?.closeAt} />
            </div>
            <p className="mt-2 font-mono text-[12px] opacity-80" data-testid="call-sub">
              {dollarsExact(quote?.live)} vs {dollarsExact(quote?.strike)} posted
              {call.locked ? ' · LOCK' : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <KalshiView quote={quote} board={board} call={call} />
        <DayFilter days={days} day={day} onDay={setDay} />
        <RestOfDay dash={dashQuery.data ?? seedDash ?? null} />
      </main>
    </div>
  )
}

function DayFilter({
  days,
  day,
  onDay,
}: {
  days: { key: string; label: string }[]
  day: string
  onDay: (k: string) => void
}) {
  return (
    <section className="mt-5 px-4">
      <p className="hud-label">Day</p>
      <div className="scroll-x-touch mt-2 flex gap-2 pb-1">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => onDay(d.key)}
            className={`chip-btn shrink-0 px-3 ${d.key === day ? 'chip-btn-on' : ''}`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function RestOfDay({ dash }: { dash: Dash | null }) {
  const upcoming = Array.isArray(dash?.upcoming) ? dash.upcoming : []
  const elapsed = Array.isArray(dash?.elapsed) ? dash.elapsed : []

  return (
    <section className="mt-5 px-4 pb-8">
      <p className="hud-label">Now + rest of day · 15 min</p>
      <p className="mt-1 text-sm text-mute">Current clock and upcoming theory. Swipe sideways for last week.</p>
      <SlotTable rows={upcoming} empty="Waiting on rest-of-day slots" />
      {elapsed.length ? (
        <>
          <p className="hud-label mt-5">Elapsed · actual vs theory</p>
          <SlotTable rows={elapsed.slice().reverse()} empty="" />
        </>
      ) : null}
    </section>
  )
}

function SlotTable({ rows, empty }: { rows: Dash['upcoming']; empty: string }) {
  if (!rows.length) {
    return <p className="mt-2 text-sm text-mute">{empty}</p>
  }
  return (
    <div className="hud-panel scroll-x-touch mt-2 px-1">
      <table className="hud-table">
        <thead>
          <tr>
            <th className="clock-col sticky left-0 z-10 py-2 pr-3">Clock</th>
            <th className="px-3 py-2">Theory</th>
            <th className="px-3 py-2">Actual</th>
            <th className="px-3 py-2">Preview</th>
            <th className="px-3 py-2">Variance</th>
            <th className="px-3 py-2">Last week</th>
            <th className="px-3 py-2">Vs open</th>
            <th className="px-3 py-2">High</th>
            <th className="px-3 py-2">Low</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t} className={r.isNow ? 'row-now' : ''}>
              <td className="clock-col sticky left-0 z-10 py-2 pr-3 font-medium">
                <span>{r.clock}{r.isNow ? ' · now' : ''}</span>
              </td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.theory)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.actual)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.preview)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{signedDollars(r.variance)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.lastWeek)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{signedDollars(r.vsOpen)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.high)}</td>
              <td className="mono px-3 py-2 whitespace-nowrap">{dollarsExact(r.low)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
