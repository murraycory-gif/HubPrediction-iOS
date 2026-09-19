import { useEffect, useState } from 'react'

/** Local desk clock. Countdown and NOW ease off this, not the print poll. */
export const DESK_TICK_MS = 100
/** Quiet reconnect only after the print snapshot is this dead. No orange cry-wolf banner. */
export const FEED_RECONNECT_MS = 15_000
export const FEED_STALE_MS = FEED_RECONNECT_MS
export const FEED_STALE_CHECK_MS = 400
export const FEED_STALE_RECOVER_MS = 15_000
export const FEED_STALE_RTT_MULT = 1
export const FEED_STALE_MAX_MS = FEED_RECONNECT_MS

export function feedStaleThreshold(_lastPrintRttMs = 0) {
  return FEED_RECONNECT_MS
}

/** True only when the last good print is older than 15s. 4s latency is live. */
export function feedNeedsReconnect(opts: {
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
  const started = opts.fetchStartedAt ?? 0
  const fetchAge = started > 0 ? opts.now - started : 0
  if (opts.fetching && fetchAge < FEED_RECONNECT_MS) return false
  if (opts.lastPrintOkAt && opts.now - opts.lastPrintOkAt <= FEED_RECONNECT_MS) return false
  if (opts.fetching && fetchAge >= FEED_RECONNECT_MS) return true
  if (opts.lastPrintOkAt && opts.now - opts.lastPrintOkAt > FEED_RECONNECT_MS) return true
  if (!opts.lastPrintOkAt && started > 0 && fetchAge > FEED_RECONNECT_MS) return true
  return false
}

export function feedIsStale(opts: Parameters<typeof feedNeedsReconnect>[0]): boolean {
  return feedNeedsReconnect(opts)
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
