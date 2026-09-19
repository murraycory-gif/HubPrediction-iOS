import { useEffect, useState } from 'react'

/** One desk clock. Soft FAIL a rAF loop per tape / chart / timer. */
export const DESK_TICK_MS = 200

type TickFn = (now: number) => void

const listeners = new Set<TickFn>()
let timer: ReturnType<typeof setInterval> | null = null

function start() {
  if (timer != null) return
  timer = setInterval(() => {
    const now = Date.now()
    for (const fn of listeners) fn(now)
  }, DESK_TICK_MS)
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
