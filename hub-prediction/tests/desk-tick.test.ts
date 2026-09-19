import { describe, expect, it, vi } from 'vitest'
import { DESK_TICK_MS, FEED_STALE_MS, lastDeskTickAt, subscribeDeskTick } from '../src/lib/desk-tick'
import { EXIT_SCAN_MS } from '../src/lib/exit-watch'

describe('desk tick vs EXIT scan', () => {
  it('UI clock stays 100ms and EXIT scan is slower', () => {
    expect(DESK_TICK_MS).toBe(100)
    expect(EXIT_SCAN_MS).toBe(400)
    expect(FEED_STALE_MS).toBe(2500)
    expect(EXIT_SCAN_MS).toBeGreaterThan(DESK_TICK_MS)
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
