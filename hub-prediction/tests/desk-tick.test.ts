import { describe, expect, it, vi } from 'vitest'
import {
  DESK_TICK_MS,
  FEED_RECONNECT_MS,
  FEED_STALE_CHECK_MS,
  FEED_STALE_MS,
  feedIsStale,
  feedNeedsReconnect,
  feedStaleThreshold,
  lastDeskTickAt,
  subscribeDeskTick,
} from '../src/lib/desk-tick'
import { EXIT_SCAN_MS } from '../src/lib/exit-watch'
import { BOT_SCAN_MS, LIVE_PRINT_MS, PRINT_WIRE_DOTS, WARM_PRINT_MS } from '../src/lib/tapes'

describe('desk tick vs EXIT scan', () => {
  it('UI clock stays 100ms and EXIT scan is slower', () => {
    expect(DESK_TICK_MS).toBe(100)
    expect(EXIT_SCAN_MS).toBe(400)
    expect(BOT_SCAN_MS).toBe(1000)
    expect(LIVE_PRINT_MS).toBe(250)
    expect(WARM_PRINT_MS).toBe(250)
    expect(PRINT_WIRE_DOTS).toBe(12)
    expect(FEED_RECONNECT_MS).toBe(15_000)
    expect(FEED_STALE_MS).toBe(15_000)
    expect(FEED_STALE_CHECK_MS).toBe(400)
    expect(feedStaleThreshold(4000)).toBe(15_000)
    expect(EXIT_SCAN_MS).toBeGreaterThan(DESK_TICK_MS)
    expect(BOT_SCAN_MS).toBeGreaterThan(EXIT_SCAN_MS)
  })

  it('4s print delay is live; reconnect only after 15s dead', () => {
    const now = 10_000_000
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: 0 })).toBe(false)
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: 0, fetching: true, fetchStartedAt: now - 4_000 })).toBe(false)
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: now - 4_000, fetching: false })).toBe(false)
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: now - 10_000, fetching: false })).toBe(false)
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: now - 16_000, fetching: false })).toBe(true)
    expect(feedNeedsReconnect({ now, hostReady: true, lastPrintOkAt: now - 16_000, fetching: true, fetchStartedAt: now - 16_000 })).toBe(true)
    expect(feedIsStale({ now, hostReady: true, lastPrintOkAt: now, force: true })).toBe(true)
  })

  it('tick bus advances while a throttled EXIT scan runs', async () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    const scans: number[] = []
    let lastScan = 0
    const stop = subscribeDeskTick((now) => {
      ticks.push(now)
      if (now - lastScan < EXIT_SCAN_MS) return
      lastScan = now
      scans.push(now)
    })
    vi.advanceTimersByTime(3_200)
    stop()
    vi.useRealTimers()
    expect(ticks.length).toBeGreaterThanOrEqual(30)
    expect(scans.length).toBeGreaterThanOrEqual(6)
    expect(scans.length).toBeLessThan(ticks.length)
    expect(lastDeskTickAt()).toBeGreaterThan(0)
  })
})
