import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { claimSend, releaseClaim } from '../src/lib/tapes'
import { cashAfterEachBet, collapseClockBets, emptyFinance, hydrateFinance } from '../src/lib/finance'
import {
  SETTLE_BACKOFF_MS,
  SETTLE_LATCH_FOR_MS,
  SETTLE_LATCH_MS,
  applyClockSettle,
  balanceLatchMs,
  clocksNeedingSettle,
  settlePollMs,
} from '../src/lib/settle-latch'

function liveOpen(partial: { tape?: 'btc' | 'ng' | 'cu'; ticker: string; closeAt: number; spent?: number; orderId?: string }) {
  return {
    betId: `bet_${partial.orderId || partial.ticker}`,
    tape: partial.tape ?? ('btc' as const),
    ticker: partial.ticker,
    clock: '15m',
    closeAt: partial.closeAt,
    side: 'up' as const,
    count: 1,
    ask: 72,
    spent: partial.spent ?? 0.72,
    orderId: partial.orderId || `ord-${partial.ticker}`,
    status: 'open' as const,
    pnl: null,
    filledAt: partial.closeAt - 60_000,
    settledAt: null,
    kind: 'live' as const,
  }
}

describe('clock-close settle latch Soft FAIL reload drip', () => {
  it('latches 1.5s for 90s after close, then backs off', () => {
    const closeAt = 1_000_000
    expect(settlePollMs(closeAt, closeAt - 1)).toBe(false)
    expect(settlePollMs(closeAt, closeAt + 1_000)).toBe(SETTLE_LATCH_MS)
    expect(settlePollMs(closeAt, closeAt + SETTLE_LATCH_FOR_MS)).toBe(SETTLE_LATCH_MS)
    expect(settlePollMs(closeAt, closeAt + SETTLE_LATCH_FOR_MS + 1)).toBe(SETTLE_BACKOFF_MS)
    expect(SETTLE_LATCH_MS).toBeGreaterThanOrEqual(1000)
    expect(SETTLE_LATCH_MS).toBeLessThanOrEqual(2000)
  })

  it('needs settle on closed LIVE clocks — Soft FAIL paper', () => {
    const now = Date.now()
    const bets = [
      liveOpen({ ticker: 'KXBTC15M-SETTLE', closeAt: now - 2000 }),
      {
        ...liveOpen({ tape: 'gld', ticker: 'KXGOLD15M-HALT', closeAt: now - 2000, orderId: 'deskfill-gld-halt01' }),
        kind: 'paper' as const,
        orderId: 'deskfill-gld-halt01',
      },
    ]
    const need = clocksNeedingSettle(bets, { tapes: { btc: { ticker: 'KXBTC15M-SETTLE', closeAt: now - 2000, tradingActive: false } } }, now)
    expect(need.tickers).toEqual(['KXBTC15M-SETTLE'])
    expect(need.latchMs).toBe(SETTLE_LATCH_MS)
  })

  it('applyClockSettle flips BTC/NG/CU OPEN → WIN with Kalshi payout − spent and walks cash', () => {
    const now = Date.now()
    const start = hydrateFinance({
      killed: false,
      paperStartedAt: now,
      bets: [
        liveOpen({ tape: 'btc', ticker: 'KXBTC15M-A', closeAt: now - 1000, orderId: 'ord-btc-s1' }),
        liveOpen({ tape: 'ng', ticker: 'KXNATGAS15M-A', closeAt: now - 1000, orderId: 'ord-ng-s1' }),
        liveOpen({ tape: 'cu', ticker: 'KXCOPPER15M-A', closeAt: now - 1000, orderId: 'ord-cu-s1' }),
        {
          ...liveOpen({ tape: 'gld', ticker: 'KXGOLD15M-A', closeAt: now - 1000, orderId: 'deskfill-gld-s1' }),
          kind: 'paper' as const,
          orderId: 'deskfill-gld-s1',
        },
      ],
    })
    const next = applyClockSettle(
      start,
      {
        cash: 500.84,
        settlements: {
          settlements: [
            {
              ticker: 'KXBTC15M-A',
              market_result: 'yes',
              yes_count_fp: '1',
              no_count_fp: '0',
              yes_total_cost_dollars: 0.72,
              revenue_dollars: 1,
              settled_time: new Date(now).toISOString(),
            },
            {
              ticker: 'KXNATGAS15M-A',
              market_result: 'yes',
              yes_count_fp: '1',
              no_count_fp: '0',
              yes_total_cost_dollars: 0.72,
              revenue_dollars: 1,
              settled_time: new Date(now).toISOString(),
            },
            {
              ticker: 'KXCOPPER15M-A',
              market_result: 'yes',
              yes_count_fp: '1',
              no_count_fp: '0',
              yes_total_cost_dollars: 0.72,
              revenue_dollars: 1,
              settled_time: new Date(now).toISOString(),
            },
          ],
        },
        markets: [
          { ticker: 'KXBTC15M-A', result: 'yes' },
          { ticker: 'KXNATGAS15M-A', result: 'yes' },
          { ticker: 'KXCOPPER15M-A', result: 'yes' },
        ],
      },
      now,
    )
    for (const ticker of ['KXBTC15M-A', 'KXNATGAS15M-A', 'KXCOPPER15M-A']) {
      const row = next.bets.find((b) => b.ticker === ticker)
      expect(row?.status).toBe('settled')
      expect(row?.pnl).toBeCloseTo(0.28)
    }
    const gold = next.bets.find((b) => b.ticker === 'KXGOLD15M-A')
    expect(gold?.status).toBe('open')
    expect(gold?.pnl).toBeNull()
    const walk = cashAfterEachBet(next.bets, 500.84)
    expect(walk['bet_ord-btc-s1']).toBeCloseTo(500.84)
    expect(walk['bet_ord-cu-s1']).toBeCloseTo(500.84)
    expect(walk['bet_ord-ng-s1']).toBeCloseTo(500.84)
    expect(walk['bet_deskfill-gld-s1']).toBeNull()
    expect(walk['bet_ord-btc-s1']).toBe(walk['bet_ord-ng-s1'])
    expect(balanceLatchMs(next.bets, { tapes: { btc: { closeAt: now - 1000, tradingActive: false } } }, now)).toBe(
      SETTLE_LATCH_MS,
    )
  })

  it('collapses four CU LIVE ghosts to one row', () => {
    const now = Date.now()
    const ghosts = [1, 2, 3, 4].map((n) =>
      liveOpen({ tape: 'cu', ticker: 'KXCOPPER15M-SAME', closeAt: now + 60_000, orderId: `ord-cu-ghost-${n}` }),
    )
    const next = collapseClockBets({ ...emptyFinance(), bets: ghosts })
    expect(next.bets.filter((b) => b.ticker === 'KXCOPPER15M-SAME')).toHaveLength(1)
  })

  it('claimSend Soft FAIL a second POST while the first is in flight', () => {
    const map: Record<string, { at: number; tries: number; filled?: string; pending?: boolean }> = {}
    const now = 9_000_000
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now)).toBe('send')
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now + 200)).toBe('skip')
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now + 400)).toBe('skip')
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now + 600)).toBe('skip')
    releaseClaim(map, 'cu:KXCOPPER15M-1')
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now + 800)).toBe('send')
  })

  it('claimSend 4 IOC misses Soft FAIL permanent skip — 8s cooldown sends again', () => {
    const map: Record<string, { at: number; tries: number; filled?: string; pending?: boolean }> = {}
    const now = 9_000_000
    const key = 'btc:KXBTC15M-26SEP191245-45'
    for (let i = 0; i < 4; i += 1) {
      expect(claimSend(map, key, now + i * 200)).toBe('send')
      releaseClaim(map, key, now + i * 200)
    }
    const last = now + 3 * 200
    expect(claimSend(map, key, last + 900)).toBe('skip')
    expect(claimSend(map, key, last + 7_999)).toBe('skip')
    expect(claimSend(map, key, last + 8_000)).toBe('send')
  })

  it('desk settle path Soft FAIL location.reload and Soft FAIL 20s-only drip', async () => {
    const dash = await readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8')
    expect(dash).toMatch(/getClockSettle/)
    expect(dash).toMatch(/applyClockSettle/)
    expect(dash).toMatch(/clocksNeedingSettle/)
    expect(dash).toMatch(/readTestClockSettle/)
    expect(dash).toMatch(/data-settle-latch/)
    expect(dash).not.toMatch(/location\.reload/)
    expect(dash).toMatch(/refetchInterval: settleNeed\.latchMs \|\| false/)
    expect(dash).not.toMatch(/queryKey: \['clock-settle'[\s\S]{0,80}refetchInterval:\s*20_000/)
  })
})
