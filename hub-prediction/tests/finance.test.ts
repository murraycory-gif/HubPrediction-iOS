import { afterEach, describe, expect, it } from 'vitest'
import {
  ASK_CAP,
  LIVE_FLOOR_MIN,
  askAllowedByGold,
  bookFill,
  emptyFinance,
  financeSendsOrders,
  liveArmGate,
  liveCashFloor,
  liveSendGate,
  paper48hPassed,
  paperCashFloor,
  pnlVsDeposits,
  chasingLosses,
  last24hBets,
  recipeRetuneGate,
  recommendSize,
} from '../src/lib/finance'
import { GOLD_RECIPES, DEFAULT_SETTINGS, hydrateSettings } from '../src/lib/tapes'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('finance Soft KEEP', () => {
  it('uses paper $50 and live max($150, 20% deposits) — $760 → $152', () => {
    expect(paperCashFloor()).toBe(50)
    expect(liveCashFloor(760)).toBe(152)
    expect(liveCashFloor(100)).toBe(LIVE_FLOOR_MIN)
    expect(pnlVsDeposits(293.36, 760)).toBeCloseTo(-466.64)
  })

  it('recommends gold contract sizes and does not retune recipes', () => {
    expect(recommendSize('btc')).toBe(GOLD_RECIPES.btc.contracts)
    expect(recommendSize('ng')).toBe(1)
    expect(GOLD_RECIPES.btc).toMatchObject({ through: 40, armFromMin: 8, centLo: 69 })
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(DEFAULT_SETTINGS.liveBets).toBe(false)
  })

  it('Soft FAIL ghost BOT BOUGHT and ARMING ids', () => {
    const s = emptyFinance()
    expect(bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: 'ARMING',
    }).ok).toBe(false)
    expect(bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: '',
    }).ok).toBe(false)
    const ok = bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: 'ord-real-12345',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(bookFill(ok.state, {
        tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'down', count: 1, ask: 72, orderId: 'ord-real-99999',
      }).ok).toBe(false)
    }
  })

  it('Soft FAIL asks ≥80¢ unless gold lock includes them', () => {
    expect(askAllowedByGold('btc', 82)).toBe(true)
    expect(askAllowedByGold('btc', 92)).toBe(false)
    expect(askAllowedByGold('ng', 30)).toBe(false)
    const blocked = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-1', ask: 92, cash: 400, deposits: 760, spent: 0.92,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toMatch(new RegExp(String(ASK_CAP)))
  })

  it('Soft FAIL Live ON before paper 48h and under cash floor', () => {
    const fresh = emptyFinance()
    expect(paper48hPassed(fresh)).toBe(false)
    expect(liveArmGate(fresh, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(false)
    const aged = { ...fresh, paperStartedAt: Date.now() - 49 * 3600_000 }
    expect(liveArmGate(aged, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(true)
    expect(liveArmGate(aged, { cash: 100, deposits: 760, hasKeys: true }).ok).toBe(false)
    expect(liveArmGate(aged, { cash: 200, deposits: 760, hasKeys: false }).ok).toBe(false)
  })

  it('does not send Kalshi orders', () => {
    expect(() => financeSendsOrders()).toThrow(/must not send Kalshi orders/)
  })

  it('Soft FAIL mid-session through/window/¢/size retune after a loss; bot toggle still ok', () => {
    const now = Date.now()
    const chasing = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_1',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-1',
          clock: '9:15 PM',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 72,
          spent: 0.72,
          orderId: 'ord-loss-12345',
          status: 'settled' as const,
          pnl: -0.72,
          filledAt: now - 1000,
          settledAt: now,
        },
      ],
    }
    expect(chasingLosses(chasing, now)).toBe(true)
    expect(recipeRetuneGate(chasing, { through: 10 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { contracts: 8 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { armFromMin: 12 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { centLo: 20 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { botOn: true }, now).ok).toBe(true)
    expect(recipeRetuneGate(emptyFinance(), { contracts: 3 }, now).ok).toBe(true)
    expect(recipeRetuneGate({ ...emptyFinance(), killed: true }, { through: 1 }, now).ok).toBe(false)
  })

  it('Last 24H bets strip uses placed cost, settled W–L, and 24h P&L', () => {
    const now = Date.now()
    const hits = { tapes: { btc: { w: 3, l: 1 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 1, l: 1 } } }
    const state = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_a',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-A',
          clock: '9:00 PM',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 72,
          spent: 0.72,
          orderId: 'ord-win-12345',
          status: 'settled' as const,
          pnl: 0.28,
          filledAt: now - 1000,
          settledAt: now,
        },
        {
          betId: 'bet_old',
          tape: 'ng' as const,
          ticker: 'KXNATGAS15M-OLD',
          clock: '8:00 PM',
          closeAt: now - 30 * 60 * 60 * 1000,
          side: 'down' as const,
          count: 1,
          ask: 40,
          spent: 9.99,
          orderId: 'ord-old-99999',
          status: 'settled' as const,
          pnl: 0.6,
          filledAt: now - 30 * 60 * 60 * 1000,
          settledAt: now - 30 * 60 * 60 * 1000,
        },
      ],
    }
    const strip = last24hBets(state, hits, now)
    expect(strip.placed).toBeCloseTo(0.72)
    expect(strip.w).toBe(4)
    expect(strip.l).toBe(2)
    expect(strip.pnl).toBeCloseTo(0.28)
  })
})
