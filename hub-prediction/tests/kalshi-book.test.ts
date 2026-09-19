import { describe, expect, it } from 'vitest'
import { applyKalshiBook, classifyBookMode, indexKalshiBook, onKalshiBook } from '../src/lib/kalshi-book'
import { betKind, cashAfterEachBet, emptyFinance, hydrateFinance } from '../src/lib/finance'
import { cashFromBalancePayload } from '../src/lib/size-cash'

const now = 1_800_000_000_000

function deskLive(over: Partial<{ ticker: string; orderId: string; betId: string; kind: 'live' | 'paper' | 'hist' }> = {}) {
  const orderId = over.orderId ?? 'ord-desk-live-aaaa'
  return {
    betId: over.betId ?? `bet_${orderId}`,
    tape: 'btc' as const,
    ticker: over.ticker ?? 'KXBTC15M-BOOK',
    clock: '15m',
    closeAt: now + 60_000,
    side: 'up' as const,
    count: 1,
    ask: 70,
    spent: 0.7,
    orderId,
    status: 'open' as const,
    pnl: null,
    filledAt: now,
    settledAt: null,
    kind: over.kind ?? ('live' as const),
  }
}

function imported(over: Partial<{ ticker: string; orderId: string }> = {}) {
  const ticker = over.ticker ?? 'KXBTC15M-IMP'
  return {
    betId: `kalshi:${ticker}`,
    tape: 'btc' as const,
    ticker,
    clock: '15m',
    closeAt: now - 1000,
    side: 'up' as const,
    count: 1,
    ask: 50,
    spent: 0.5,
    orderId: over.orderId ?? `settled-${ticker}`,
    status: 'settled' as const,
    pnl: 0.5,
    filledAt: now - 1000,
    settledAt: now - 1000,
    kind: 'live' as const,
  }
}

describe('Kalshi book MODE — missing PAPER, present LIVE, cash = balance', () => {
  it('desk ticket missing from Kalshi → MODE PAPER', () => {
    const ghost = deskLive({ orderId: 'ord-ghost-not-on-kalshi', ticker: 'KXBTC15M-GHOST' })
    const next = applyKalshiBook(
      { ...emptyFinance(), bets: [ghost] },
      {
        cash: 293.63,
        fills: { fills: [] },
        settlements: { settlements: [] },
        positions: { market_positions: [] },
        orders: { orders: [] },
        fetchedAt: now,
        hostCreds: true,
      },
      now,
    )
    expect(next.bets[0]?.kind).toBe('paper')
    expect(betKind(next.bets[0]!)).toBe('paper')
    expect(classifyBookMode(ghost, indexKalshiBook({ fills: { fills: [] }, fetchedAt: now, hostCreds: true }))).toBe(
      'paper',
    )
    expect(cashAfterEachBet(next.bets, 293.63)[ghost.betId]).toBeNull()
  })

  it('order/fill present on Kalshi → MODE LIVE and CASH matches balance payload', () => {
    const live = deskLive({ orderId: 'ord-kalshi-real-01', ticker: 'KXBTC15M-LIVE' })
    const payload = {
      cash: 293.63,
      fills: {
        fills: [{ ticker: 'KXBTC15M-LIVE', order_id: 'ord-kalshi-real-01', count: 1, yes_price_dollars: 0.7 }],
      },
      settlements: { settlements: [] },
      positions: { market_positions: [] },
      orders: { orders: [{ ticker: 'KXBTC15M-LIVE', order_id: 'ord-kalshi-real-01', status: 'executed' }] },
      fetchedAt: now,
      hostCreds: true,
    }
    const next = applyKalshiBook({ ...emptyFinance(), bets: [live] }, payload, now)
    expect(onKalshiBook(live, indexKalshiBook(payload))).toBe(true)
    expect(next.bets[0]?.kind).toBe('live')
    expect(betKind(next.bets[0]!)).toBe('live')
    expect(cashAfterEachBet(next.bets, payload.cash)[live.betId]).toBeCloseTo(293.63)
    expect(cashFromBalancePayload({ balance_dollars: '293.63' })).toBeCloseTo(293.63)
    expect(cashAfterEachBet(next.bets, cashFromBalancePayload({ balance_dollars: 293.63 }))[live.betId]).toBeCloseTo(
      293.63,
    )
  })

  it('Soft FAIL deskfill-as-LIVE even when the ticker is on the Kalshi book', () => {
    const paper = deskLive({
      orderId: 'deskfill-cu-f8bmwqhq',
      betId: 'bet_deskfill-cu-f8bmwqhq',
      ticker: 'KXCOPPER15M-BOOK',
      kind: 'live',
    })
    const next = applyKalshiBook(
      { ...emptyFinance(), bets: [paper] },
      {
        cash: 293.63,
        fills: { fills: [{ ticker: 'KXCOPPER15M-BOOK', order_id: 'ord-other-cu-fill' }] },
        settlements: { settlements: [] },
        orders: { orders: [] },
        fetchedAt: now,
        hostCreds: true,
      },
      now,
    )
    expect(next.bets[0]?.kind).toBe('paper')
    expect(betKind(next.bets[0]!)).toBe('paper')
    expect(cashAfterEachBet(next.bets, 293.63)[paper.betId]).toBeNull()
  })

  it('Soft FAIL label imports LIVE unless they exist on the Kalshi book', () => {
    const raw = imported({ ticker: 'KXBTC15M-OFFBOOK' })
    const hydrated = hydrateFinance({ killed: false, paperStartedAt: 1, bets: [raw] })
    expect(hydrated.bets[0]?.kind).toBe('hist')
    expect(cashAfterEachBet(hydrated.bets, 293.63)[raw.betId]).toBeNull()

    const missing = applyKalshiBook(hydrated, {
      cash: 293.63,
      fills: { fills: [] },
      settlements: { settlements: [] },
      orders: { orders: [] },
      fetchedAt: now,
      hostCreds: true,
    }, now)
    expect(missing.bets.find((b) => b.ticker === raw.ticker)?.kind).toBe('hist')

    const present = applyKalshiBook(hydrated, {
      cash: 293.63,
      fills: { fills: [] },
      settlements: {
        settlements: [
          {
            ticker: 'KXBTC15M-OFFBOOK',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost_dollars: 0.5,
            revenue_dollars: 1,
            settled_time: new Date(now).toISOString(),
          },
        ],
      },
      orders: { orders: [] },
      fetchedAt: now,
      hostCreds: true,
    }, now)
    const row = present.bets.find((b) => b.ticker === raw.ticker)
    expect(row?.kind).toBe('live')
    expect(betKind(row!)).toBe('live')
    expect(cashAfterEachBet(present.bets, 293.63)[row!.betId]).toBeCloseTo(293.63)
  })

  it('BETS is Kalshi book ∪ desk paper extras', () => {
    const paper = deskLive({
      orderId: 'deskfill-btc-paper01',
      betId: 'bet_deskfill-btc-paper01',
      ticker: 'KXBTC15M-PAPER',
      kind: 'paper',
    })
    const next = applyKalshiBook(
      { ...emptyFinance(), bets: [paper] },
      {
        cash: 293.63,
        fills: {
          fills: [{ ticker: 'KXBTC15M-ONBOOK', order_id: 'ord-on-book-fill01', count: 1, yes_price_dollars: 0.4 }],
        },
        settlements: { settlements: [] },
        orders: { orders: [] },
        fetchedAt: now,
        hostCreds: true,
      },
      now,
    )
    expect(next.bets.some((b) => b.orderId === 'deskfill-btc-paper01' && b.kind === 'paper')).toBe(true)
    expect(next.bets.some((b) => b.ticker === 'KXBTC15M-ONBOOK' && b.kind === 'live')).toBe(true)
  })
})
