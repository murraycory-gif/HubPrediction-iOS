import { useRef } from 'react'
import { holdCloseAt, useDeskTick } from '../lib/desk-tick'

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

export function CloseClock({ closeAt }: { closeAt?: number }) {
  const held = useRef(closeAt)
  const at = holdCloseAt(closeAt, held.current)
  if (at != null && Number.isFinite(at) && at > 0) held.current = at
  const now = useDeskTick()

  if (!at || !Number.isFinite(at)) {
    return (
      <span className="count" data-testid="close-clock">
        --:--
      </span>
    )
  }

  const left = Math.max(0, at - now)
  const mm = Math.floor(left / 60_000)
  const ss = Math.floor((left % 60_000) / 1000)

  return (
    <span className="count" data-testid="close-clock">
      {pad(mm)}:{pad(ss)}
    </span>
  )
}
