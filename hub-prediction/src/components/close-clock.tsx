import { useLayoutEffect, useRef, useState } from 'react'
import { closeClockView, readTestCloseClock, readTestOpenMarkets } from '../lib/close-clock'
import { holdCloseAt, useDeskTick } from '../lib/desk-tick'

export function CloseClock({
  closeAt,
  live,
  stale,
  tradingActive,
  openMarkets,
  nextOpenLabel,
  tape,
}: {
  closeAt?: number
  live?: boolean
  stale?: boolean
  tradingActive?: boolean
  openMarkets?: number
  nextOpenLabel?: string
  tape?: string
}) {
  const held = useRef(closeAt)
  const at = holdCloseAt(closeAt, held.current)
  if (at != null && Number.isFinite(at) && at > 0) held.current = at
  const now = useDeskTick()
  const [hydrated, setHydrated] = useState(false)
  useLayoutEffect(() => {
    setHydrated(true)
  }, [])
  const test = readTestCloseClock()
  const view = closeClockView({
    closeAt: test?.closeAt ?? at,
    live,
    stale: test?.stale ?? stale,
    tradingActive: test?.tradingActive ?? tradingActive,
    openMarkets: readTestOpenMarkets(tape) ?? test?.openMarkets ?? openMarkets,
    now,
    nextOpenLabel,
  })
  const text = view.kind === 'live' && !hydrated ? '--:--' : view.text

  return (
    <span
      className={`count count-${view.kind}`}
      data-testid={tape ? `close-clock-${tape}` : 'close-clock'}
      data-clock-kind={view.kind}
      suppressHydrationWarning
    >
      {text}
    </span>
  )
}
