import { useRef } from 'react'
import { closeClockView } from '../lib/close-clock'
import { holdCloseAt, useDeskTick } from '../lib/desk-tick'

export function CloseClock({
  closeAt,
  live,
  nextOpenLabel,
  tape,
}: {
  closeAt?: number
  live?: boolean
  nextOpenLabel?: string
  tape?: string
}) {
  const held = useRef(closeAt)
  const at = holdCloseAt(closeAt, held.current)
  if (at != null && Number.isFinite(at) && at > 0) held.current = at
  const now = useDeskTick()
  const view = closeClockView({
    closeAt: at,
    live: live === true,
    now,
    nextOpenLabel,
  })

  return (
    <span
      className={`count count-${view.kind}`}
      data-testid={tape ? `close-clock-${tape}` : 'close-clock'}
      data-clock-kind={view.kind}
    >
      {view.text}
    </span>
  )
}
