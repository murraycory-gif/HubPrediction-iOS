/** Countdown only on a live clock. Soft FAIL a week-long fake wait. Soft FAIL CLOSED while LIVE. */
export const LIVE_COUNTDOWN_MAX_MS = 2 * 60 * 60_000

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

export function closeClockView(opts: {
  closeAt?: number | null
  live: boolean
  now?: number
  nextOpenLabel?: string
}): { kind: 'live' | 'closed'; text: string } {
  const now = opts.now ?? Date.now()
  const at = Number(opts.closeAt)
  const left = at - now
  if (opts.live) {
    if (Number.isFinite(at) && at > now && left <= LIVE_COUNTDOWN_MAX_MS) {
      const mm = Math.floor(left / 60_000)
      const ss = Math.floor((left % 60_000) / 1000)
      return { kind: 'live', text: `${pad(mm)}:${pad(ss)}` }
    }
    return { kind: 'live', text: '--:--' }
  }
  const next = String(opts.nextOpenLabel ?? '').trim()
  return { kind: 'closed', text: next ? `CLOSED · ${next}` : 'CLOSED' }
}
