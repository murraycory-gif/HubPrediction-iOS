import { useEffect, useState } from 'react'

/** One desk clock. Soft FAIL a rAF loop per tape / chart / timer. Soft FAIL 1Hz. */
export const DESK_TICK_MS = 100
/** Floor for visible FEED STALE. Soft FAIL 2.5s — real getLivePrints is often 3–6s. */
export const FEED_STALE_MS = 8_000
/** Adaptive ceiling: max(FEED_STALE_MS, last successful print RTT × this). */
export const FEED_STALE_RTT_MULT = 3
/** Cap so a slow RTT Soft FAIL hiding a truly dead feed. */
export const FEED_STALE_MAX_MS = 20_000
/** How often the desk re-checks stale. Soft FAIL a 100ms full-tree render just to paint the banner. */
export const FEED_STALE_CHECK_MS = 400
/** Recover refetch gap. Soft FAIL pile-up that Soft FAILs the host. */
export const FEED_STALE_RECOVER_MS = 8_000

export function feedStaleThreshold(lastPrintRttMs = 0) {
  const rtt = Number.isFinite(lastPrintRttMs) && lastPrintRttMs > 0 ? lastPrintRttMs : 0
  return Math.min(FEED_STALE_MAX_MS, Math.max(FEED_STALE_MS, Math.round(rtt * FEED_STALE_RTT_MULT)))
}

/** Soft FAIL banner while a print is in flight under threshold. Soft FAIL 2.5s false alarm. Soft FAIL silent freeze. */
export function feedIsStale(opts: {
  now: number
  hostReady: boolean
  force?: boolean
  lastPrintOkAt: number
  fetchStartedAt?: number
  fetching?: boolean
  lastPrintRttMs?: number
}): boolean {
  if (opts.force) return true
  if (!opts.hostReady) return false
  const threshold = feedStaleThreshold(opts.lastPrintRttMs)
  const started = opts.fetchStartedAt ?? 0
  const fetchAge = started > 0 ? opts.now - started : 0
  if (opts.fetching && fetchAge < threshold) return false
  if (opts.lastPrintOkAt && opts.now - opts.lastPrintOkAt <= threshold) return false
  if (opts.fetching && fetchAge >= threshold) return true
  if (opts.lastPrintOkAt && opts.now - opts.lastPrintOkAt > threshold) return true
  if (!opts.lastPrintOkAt && started > 0 && fetchAge > threshold) return true
  return false
}

type TickFn = (now: number) => void

const listeners = new Set<TickFn>()
let timer: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0

function start() {
  if (timer != null) return
  timer = setInterval(() => {
    const now = Date.now()
    lastTickAt = now
    for (const fn of listeners) fn(now)
  }, DESK_TICK_MS)
}

export function lastDeskTickAt() {
  return lastTickAt
}

export function deskTickAge(now = Date.now()) {
  if (!lastTickAt) return 0
  return now - lastTickAt
}

function stop() {
  if (timer == null) return
  clearInterval(timer)
  timer = null
}

export function subscribeDeskTick(fn: TickFn) {
  listeners.add(fn)
  start()
  return () => {
    listeners.delete(fn)
    if (!listeners.size) stop()
  }
}

export function useDeskTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => subscribeDeskTick(setNow), [])
  return now
}

export function holdCloseAt(incoming?: number | null, held?: number | null) {
  if (incoming != null && Number.isFinite(incoming) && incoming > 0) return incoming
  if (held != null && Number.isFinite(held) && held > 0) return held
  return incoming ?? held ?? undefined
}
