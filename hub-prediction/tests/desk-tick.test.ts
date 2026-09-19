import { describe, expect, it, vi } from 'vitest'
import {
  DESK_TICK_MS,
  FEED_STALE_CHECK_MS,
  FEED_STALE_MAX_MS,
  FEED_STALE_MS,
  FEED_STALE_RECOVER_MS,
  FEED_STALE_RTT_MULT,
  feedIsStale,
  feedStaleThreshold,
  lastDeskTickAt,
  subscribeDeskTick,
} from '../src/lib/desk-tick'
import { EXIT_SCAN_MS } from '../src/lib/exit-watch'
import { BOT_SCAN_MS } from '../src/lib/tapes'

describe('desk tick vs EXIT scan', () => {
  it('UI clock stays 100ms and EXIT scan is slower', () => {
    expect(DESK_TICK_MS).toBe(100)
    expect(EXIT_SCAN_MS).toBe(400)
    expect(BOT_SCAN_MS).toBe(1000)
    expect(FEED_STALE_MS).toBe(8000)
    expect(FEED_STALE_RTT_MULT).toBe(3)
    expect(FEED_STALE_MAX_MS).toBe(20_000)
    expect(FEED_STALE_RECOVER_MS).toBe(8000)
    expect(FEED_STALE_CHECK_MS).toBe(400)
    expect(EXIT_SCAN_MS).toBeGreaterThan(DESK_TICK_MS)
    expect(BOT_SCAN_MS).toBeGreaterThan(EXIT_SCAN_MS)
  })

  it('feedStaleThreshold is max(8s, 3× last print RTT) capped at 20s', () => {
    expect(feedStaleThreshold(0)).toBe(8000)
    expect(feedStaleThreshold(500)).toBe(8000)
    expect(feedStaleThreshold(3000)).toBe(9000)
    expect(feedStaleThreshold(6000)).toBe(18_000)
    expect(feedStaleThreshold(10_000)).toBe(20_000)
  })

  it('feedIsStale Soft FAIL false-positive on 3s print latency and Soft FAIL silent freeze', () => {
    const now = 10_000_000
    expect(feedIsStale({ now, hostReady: true, lastPrintOkAt: 0 })).toBe(false)
    expect(feedIsStale({ now, hostReady: true, lastPrintOkAt: 0, fetching: true, fetchStartedAt: now - 400 })).toBe(false)
    expect(feedIsStale({ now, hostReady: true, lastPrintOkAt: 0, fetching: true, fetchStartedAt: now - 3_000 })).toBe(false)
    expect(feedIsStale({ now, hostReady: true, lastPrintOkAt: now - 400, fetching: false })).toBe(false)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 3_000,
        fetching: true,
        fetchStartedAt: now - 3_000,
      }),
    ).toBe(false)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 3_000,
        fetching: false,
      }),
    ).toBe(false)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 8_000,
        fetching: true,
        fetchStartedAt: now - 6_000,
      }),
    ).toBe(false)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 12_000,
        fetching: true,
        fetchStartedAt: now - 12_000,
      }),
    ).toBe(true)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 12_000,
        fetching: false,
      }),
    ).toBe(true)
    expect(
      feedIsStale({
        now,
        hostReady: true,
        lastPrintOkAt: now - 10_000,
        fetching: true,
        fetchStartedAt: now - 4_000,
        lastPrintRttMs: 4_000,
      }),
    ).toBe(false)
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
