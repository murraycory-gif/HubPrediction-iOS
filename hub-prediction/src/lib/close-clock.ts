/** Countdown only on a live Kalshi clock. Soft FAIL CME hours replacing the timer. Soft FAIL CLOSED while LIVE. */
export const LIVE_COUNTDOWN_MAX_MS = 2 * 60 * 60_000

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

/** LIVE chip / tradingActive. Soft FAIL weekend session hours. Soft FAIL STALE driving CLOSED. CLOSED only when series openMarkets === 0. */
export function closeClockLive(opts: {
  live?: boolean
  stale?: boolean
  tradingActive?: boolean
  openMarkets?: number
  now?: number
  closeAt?: number | null
}): boolean {
  const now = opts.now ?? Date.now()
  const at = Number(opts.closeAt)
  const ended = Number.isFinite(at) && at > 0 && at <= now
  if (opts.openMarkets === 0) return false
  if ((opts.openMarkets ?? 0) > 0) return true
  if (opts.tradingActive === true) return !ended
  if (opts.tradingActive === false) return false
  if (ended) return false
  if (opts.live === true) return true
  return false
}

export function readTestCloseClock(): {
  tradingActive?: boolean
  stale?: boolean
  closeAt?: number
  openMarkets?: number
} | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    __HUB_TEST_CLOSE_CLOCK?: { tradingActive?: boolean; stale?: boolean; closeAt?: number; openMarkets?: number }
  }
  return w.__HUB_TEST_CLOSE_CLOCK ?? null
}

export function readTestOpenMarkets(tape?: string): number | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as Window & {
    __HUB_TEST_OPEN_MARKETS?: Partial<Record<string, number>>
  }
  if (tape && w.__HUB_TEST_OPEN_MARKETS && Object.prototype.hasOwnProperty.call(w.__HUB_TEST_OPEN_MARKETS, tape)) {
    const n = Number(w.__HUB_TEST_OPEN_MARKETS[tape])
    return Number.isFinite(n) ? n : undefined
  }
  const hook = readTestCloseClock()
  return typeof hook?.openMarkets === 'number' ? hook.openMarkets : undefined
}

export function closeClockView(opts: {
  closeAt?: number | null
  live?: boolean
  stale?: boolean
  tradingActive?: boolean
  openMarkets?: number
  now?: number
  nextOpenLabel?: string
}): { kind: 'live' | 'closed'; text: string } {
  const now = opts.now ?? Date.now()
  const live = closeClockLive({
    live: opts.live,
    stale: opts.stale,
    tradingActive: opts.tradingActive,
    openMarkets: opts.openMarkets,
    now,
    closeAt: opts.closeAt,
  })
  const at = Number(opts.closeAt)
  const left = at - now
  if (live) {
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
