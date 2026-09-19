import { afterEach, describe, expect, it } from 'vitest'
import {
  ASK_CAP,
  CLOCK_MAX_SPEND,
  DAILY_PNL_FLOOR_PAPER,
  DAILY_PROFIT_LOCK,
  HIT_FLOOR,
  LIVE_FLOOR_MIN,
  hitFloorGate,
  askAllowedByGold,
  bookFill,
  emptyFinance,
  financeSendsOrders,
  liveArmGate,
  liveBotCall,
  paperFillAllowed,
  openDeskFillOnTicker,
  syncTicketsIntoBook,
  tapeBotNote,
  liveCashFloor,
  liveSendGate,
  liveArmGateForDesk,
  dailyPnlFloorHit,
  dailyProfitLockHit,
  feeAwareEv,
  engageKill,
  paper48hPassed,
  paperCashFloor,
  pnlVsDeposits,
  chasingLosses,
  isPaperOrderId,
  isPaperOrderId,
  last24hBets,
  latchDeskBets24,
  stripDeskRows,
  tapeHitCell,
  betClockLabel,
  hydrateFinance,
  cashAfterEachBet,
  cashUpdateForBet,
  betKind,
  bookRealizedPnl,
  mergeKalshiHistoryToBook,
  loadBetsFilter,
  recipeRetuneGate,
  recommendSize,
  saveBetsFilter,
  toggleBetsFilter,
  hydrateBetsFilter,
  isAllBetsFilter,
  BETS_FILTER_KEY,
} from '../src/lib/finance'
import { GOLD_RECIPES, DEFAULT_SETTINGS, SETTINGS_KEY, applyBetsFilter, hydrateSettings, loadSettings } from '../src/lib/tapes'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('finance Soft KEEP', () => {
  it('uses paper $50 and live max($150, 20% deposits) — $760 → $152', () => {
    expect(paperCashFloor()).toBe(50)
    expect(liveCashFloor(760)).toBe(152)
    expect(liveCashFloor(100)).toBe(LIVE_FLOOR_MIN)
    expect(pnlVsDeposits(293.36, 760)).toBeCloseTo(-466.64)
    expect(pnlVsDeposits(263, 760)).toBe(-497)
  })

  it('recommends gold contract sizes and does not retune recipes', () => {
    expect(recommendSize('btc')).toBe(GOLD_RECIPES.btc.contracts)
    expect(recommendSize('ng')).toBe(1)
    expect(GOLD_RECIPES.btc).toMatchObject({ through: 40, armFromMin: 8, centLo: 69 })
    expect(HIT_FLOOR).toBe(80)
    expect(hitFloorGate(0, 0).ok).toBe(true)
    expect(hitFloorGate(3, 0).ok).toBe(true)
    expect(hitFloorGate(20, 4).ok).toBe(true)
    expect(hitFloorGate(20, 6).ok).toBe(false)
    expect(hydrateSettings(null)).not.toHaveProperty('liveBets')
    expect(DEFAULT_SETTINGS).not.toHaveProperty('liveBets')
  })

  it('Soft FAIL ghost BOT BOUGHT and ARMING ids', () => {
    const s = emptyFinance()
    expect(bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: 'ARMING',
    }).ok).toBe(false)
    expect(bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: '',
    }).ok).toBe(false)
    expect(isPaperOrderId('deskfill-btc-ghost01')).toBe(true)
    expect(betKind({ orderId: 'deskfill-btc-ghost01', kind: 'live' })).toBe('paper')
    const ghostHits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    const ghostStrip = last24hBets(
      {
        ...emptyFinance(),
        bets: [
          {
            betId: 'deskfill-btc-ghost01',
            tape: 'btc' as const,
            ticker: 'KXBTC15M-1',
            clock: '15m',
            closeAt: Date.now(),
            side: 'up' as const,
            count: 1,
            ask: 72,
            spent: 0.72,
            orderId: 'deskfill-btc-ghost01',
            status: 'settled' as const,
            pnl: 0.28,
            filledAt: Date.now(),
            settledAt: Date.now(),
            kind: 'live' as const,
          },
        ],
      },
      ghostHits,
    )
    expect(ghostStrip.rows).toEqual([])
    expect(ghostStrip.placed).toBe(0)
    expect(bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: 'deskfill-btc-ghost01',
    }).ok).toBe(true)
    const paper = bookFill(s, {
      tape: 'btc', ticker: 'KXBTC15M-1', clock: '9:15 PM', closeAt: 1, side: 'up', count: 1, ask: 72, orderId: 'deskfill-btc-ghost01',
    })
    expect(paper.ok && paper.bet.kind === 'paper').toBe(true)
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

  it('Soft FAIL asks ≥80¢ unless the book is locked — factory 89 is not a lock', () => {
    expect(askAllowedByGold('btc', 79)).toBe(true)
    expect(askAllowedByGold('btc', 80)).toBe(false)
    expect(askAllowedByGold('btc', 82)).toBe(false)
    expect(askAllowedByGold('btc', 82, { locked: true })).toBe(true)
    expect(askAllowedByGold('btc', 92, { locked: true })).toBe(false)
    expect(askAllowedByGold('ng', 30)).toBe(false)
    expect(askAllowedByGold('ng', 80)).toBe(false)
    expect(askAllowedByGold('cu', 80)).toBe(false)
    expect(askAllowedByGold('gld', 80)).toBe(false)
    const blocked = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-1', ask: 82, cash: 400, deposits: 760, spent: 0.82,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toMatch(/skip/)
    if (!blocked.ok) expect(blocked.reason).toMatch(new RegExp(String(ASK_CAP)))
    const locked = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-1', ask: 82, cash: 400, deposits: 760, spent: 0.82, locked: true,
    })
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.reason).toMatch(/EV/)
    const over = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-1', ask: 72, cash: 400, deposits: 760, spent: CLOCK_MAX_SPEND + 1,
    })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toMatch(/Clock spend/)
    const under = liveSendGate(
      { ...emptyFinance(), paperStartedAt: Date.now() - 49 * 3600_000 },
      { tape: 'btc', ticker: 'KXBTC15M-1', ask: 72, cash: 400, deposits: 760, spent: 8 },
    )
    expect(under.ok).toBe(true)
    expect(CLOCK_MAX_SPEND).toBe(80)
    expect(CLOCK_MAX_SPEND).toBeGreaterThanOrEqual(20 * 0.79)
  })

  it('daily P/L floor is a visible kill, not a silent Place-block', () => {
    const now = Date.now()
    const hit = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_floor',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-F',
          clock: '15m',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 72,
          spent: 0.72,
          orderId: 'ord-floor-1',
          status: 'settled' as const,
          pnl: DAILY_PNL_FLOOR_PAPER,
          filledAt: now - 1000,
          settledAt: now,
          kind: 'live' as const,
        },
      ],
    }
    expect(dailyPnlFloorHit(hit, now)).toBe(true)
    const gated = liveSendGate(hit, {
      tape: 'btc', ticker: 'KXBTC15M-2', ask: 72, cash: 400, deposits: 760, spent: 0.72,
    }, now)
    expect(gated.ok).toBe(false)
    if (!gated.ok) expect(gated.reason).toMatch(/floor hit/)
    const killed = engageKill(hit)
    expect(killed.killed).toBe(true)
    expect(hit.bets[0]).not.toHaveProperty('liveOn')
  })

  it('daily lock-in and after-fee EV sit Live send Soft FAIL flipping Live', () => {
    expect(DAILY_PROFIT_LOCK).toBe(40)
    expect(feeAwareEv(72, 1, 80)).toBeGreaterThan(0)
    expect(feeAwareEv(82, 1, 80)).toBeLessThanOrEqual(0)
    const now = Date.now()
    const lock = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_lock',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-LOCK',
          clock: '15m',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 70,
          spent: 0.7,
          orderId: 'ord-lock-1',
          status: 'settled' as const,
          pnl: DAILY_PROFIT_LOCK,
          filledAt: now - 1000,
          settledAt: now,
          kind: 'live' as const,
        },
      ],
    }
    expect(dailyProfitLockHit(lock, now)).toBe(true)
    const gated = liveSendGate(lock, {
      tape: 'btc', ticker: 'KXBTC15M-3', ask: 72, cash: 400, deposits: 760, spent: 0.72,
    }, now)
    expect(gated.ok).toBe(false)
    if (!gated.ok) expect(gated.reason).toMatch(/lock-in/)
    expect(lock).not.toHaveProperty('liveOn')
    const evSit = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-EV', ask: 79, cash: 400, deposits: 760, spent: 0.79,
    })
    expect(evSit.ok).toBe(false)
    if (!evSit.ok) expect(evSit.reason).toMatch(/EV/)
    const live79 = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-EV-LIVE', ask: 79, cash: 294, deposits: 760, spent: 15.8, liveOn: true,
    })
    expect(live79.ok).toBe(true)
    const liveLock = liveSendGate(lock, {
      tape: 'btc', ticker: 'KXBTC15M-LOCK-LIVE', ask: 70, cash: 294, deposits: 760, spent: 14, liveOn: true,
    }, now)
    expect(liveLock.ok).toBe(true)
    const floorBook = {
      ...emptyFinance(),
      bets: [
        {
          ...lock.bets[0],
          betId: 'bet_floor_live',
          ticker: 'KXBTC15M-FL-LIVE',
          orderId: 'ord-floor-live',
          pnl: DAILY_PNL_FLOOR_PAPER,
        },
      ],
    }
    expect(dailyPnlFloorHit(floorBook, now)).toBe(true)
    const liveFloor = liveSendGate(floorBook, {
      tape: 'btc', ticker: 'KXBTC15M-FL-LIVE', ask: 70, cash: 294, deposits: 760, spent: 14, liveOn: true,
    }, now)
    expect(liveFloor.ok).toBe(true)
    const live20 = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-20', ask: 70, cash: 294, deposits: 760, spent: 14, liveOn: true,
    })
    expect(live20.ok).toBe(true)
    const skip80 = liveSendGate(emptyFinance(), {
      tape: 'btc', ticker: 'KXBTC15M-80', ask: 80, cash: 294, deposits: 760, spent: 16, liveOn: true,
    })
    expect(skip80.ok).toBe(false)
    if (!skip80.ok) expect(skip80.reason).toMatch(/skip/)
  })

  it('Soft FAIL Live ON before paper 48h and under cash floor', () => {
    const fresh = emptyFinance()
    expect(paper48hPassed(fresh)).toBe(false)
    expect(liveArmGate(fresh, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(false)
    const aged = { ...fresh, paperStartedAt: Date.now() - 49 * 3600_000 }
    expect(liveArmGate(aged, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(true)
    expect(liveArmGate(aged, { cash: 100, deposits: 760, hasKeys: true }).ok).toBe(false)
    expect(liveArmGate(aged, { cash: 200, deposits: 760, hasKeys: false }).ok).toBe(false)
    const bookReady = {
      ...fresh,
      bets: Array.from({ length: 12 }, (_, i) => ({
        betId: `kalshi:ready-${i}`,
        tape: 'btc' as const,
        ticker: `KXBTC15M-R${i}`,
        clock: '15m',
        closeAt: Date.now(),
        side: 'up' as const,
        count: 1,
        ask: 70,
        spent: 0.7,
        orderId: `settled-ready-${i}`,
        status: 'settled' as const,
        pnl: 0.3,
        filledAt: Date.now(),
        settledAt: Date.now(),
        kind: 'paper' as const,
      })),
    }
    expect(liveArmGate(bookReady, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(true)
    expect(liveArmGateForDesk(fresh, { cash: 293.36, deposits: 760, hasKeys: true }).ok).toBe(false)
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
    const sinceDeposit = last24hBets(state, hits, now, undefined, now - 40 * 60 * 60 * 1000)
    expect(sinceDeposit.placed).toBeCloseTo(10.71)
    const strip = last24hBets(state, hits, now)
    expect(strip.placed).toBeCloseTo(0.72)
    expect(strip.w).toBe(1)
    expect(strip.l).toBe(0)
    expect(strip.pnl).toBeCloseTo(0.28)
    const btc = last24hBets(state, hits, now, ['btc'])
    expect(btc.placed).toBeCloseTo(0.72)
    expect(btc.w).toBe(1)
    expect(btc.l).toBe(0)
    expect(btc.pnl).toBeCloseTo(0.28)
    const ng = last24hBets(state, hits, now, ['ng'])
    expect(ng.placed).toBe(0)
    expect(ng.w).toBe(0)
    expect(ng.l).toBe(0)
    expect(ng.pnl).toBe(0)
    const both = last24hBets(state, hits, now, ['btc', 'gld'])
    expect(both.w).toBe(1)
    expect(both.l).toBe(0)
    const histDump = {
      ...state,
      bets: [
        ...state.bets,
        ...Array.from({ length: 200 }, (_, i) => ({
          betId: `kalshi:KXBTC15M-H${i}`,
          tape: 'btc' as const,
          ticker: `KXBTC15M-H${i}`,
          clock: '15m',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 50,
          spent: 50,
          orderId: `settled-KXBTC15M-H${i}`,
          status: 'settled' as const,
          pnl: 0.5,
          filledAt: now,
          settledAt: now,
          kind: 'hist' as const,
        })),
      ],
    }
    const dumped = last24hBets(histDump, hits, now)
    expect(dumped.placed).toBeCloseTo(strip.placed)
    expect(dumped.w).toBe(strip.w)
    expect(dumped.l).toBe(strip.l)
    expect(stripDeskRows(histDump.bets).every((b) => b.kind !== 'hist')).toBe(true)
    expect(stripDeskRows(histDump.bets).some((b) => b.orderId === 'ord-win-12345')).toBe(true)
    const emptyHits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    const frozen = last24hBets(state, emptyHits, now)
    const dumpedPack = last24hBets(histDump, emptyHits, now)
    expect(latchDeskBets24(frozen, dumpedPack).placed).toBeCloseTo(frozen.placed)
    expect(latchDeskBets24(frozen, dumpedPack).rows.map((b) => b.betId).sort()).toEqual(frozen.rows.map((b) => b.betId).sort())
    const wiped = latchDeskBets24(frozen, { ...frozen, rows: [], placed: 0, w: 0, l: 0, pnl: 0, open: 0, pct: 0 })
    expect(wiped.placed).toBeCloseTo(frozen.placed)
    expect(wiped.rows).toHaveLength(frozen.rows.length)
    const swap = last24hBets(
      {
        ...emptyFinance(),
        bets: [
          {
            betId: 'bet_swap',
            tape: 'btc' as const,
            ticker: 'KXBTC15M-SWAP',
            clock: '15m',
            closeAt: now,
            side: 'up' as const,
            count: 1,
            ask: 70,
            spent: 99,
            orderId: 'ord-swap-aaaaaa',
            status: 'settled' as const,
            pnl: 1,
            filledAt: now,
            settledAt: now,
            kind: 'live' as const,
          },
        ],
      },
      emptyHits,
      now,
    )
    expect(latchDeskBets24(frozen, swap).placed).toBeCloseTo(frozen.placed)
  })

  it('Last 24H bets tape filter splits placed / W–L / P&L', () => {
    const now = Date.now()
    const hits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    const state = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_btc',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-A',
          clock: '9:00 PM',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 70,
          spent: 10,
          orderId: 'ord-btc-aaaaaa',
          status: 'settled' as const,
          pnl: 5,
          filledAt: now - 1000,
          settledAt: now,
        },
        {
          betId: 'bet_ng',
          tape: 'ng' as const,
          ticker: 'KXNATGAS15M-A',
          clock: '9:00 PM',
          closeAt: now,
          side: 'down' as const,
          count: 1,
          ask: 40,
          spent: 20,
          orderId: 'ord-ng-bbbbbb',
          status: 'settled' as const,
          pnl: -20,
          filledAt: now - 2000,
          settledAt: now,
        },
      ],
    }
    const all = last24hBets(state, hits, now)
    expect(all.placed).toBeCloseTo(30)
    expect(all.w).toBe(1)
    expect(all.l).toBe(1)
    expect(all.pnl).toBeCloseTo(-15)
    const btc = last24hBets(state, hits, now, ['btc'])
    expect(btc.placed).toBeCloseTo(10)
    expect(btc.w).toBe(1)
    expect(btc.l).toBe(0)
    expect(btc.pnl).toBeCloseTo(5)
    const ng = last24hBets(state, hits, now, ['ng'])
    expect(ng.placed).toBeCloseTo(20)
    expect(ng.w).toBe(0)
    expect(ng.l).toBe(1)
    expect(ng.pnl).toBeCloseTo(-20)
    const multi = last24hBets(state, hits, now, ['btc', 'ng'])
    expect(multi.placed).toBeCloseTo(30)
    expect(multi.w).toBe(1)
    expect(multi.l).toBe(1)
  })

  it('Last 24H bets filter persists All·BTC·NG·CU·GLD multi-select', () => {
    expect(isAllBetsFilter(hydrateBetsFilter(null))).toBe(true)
    expect(hydrateBetsFilter([])).toEqual(['btc', 'ng', 'cu', 'gld', 'wti', 'slv'])
    const btc = toggleBetsFilter(loadBetsFilter(), 'btc')
    expect(btc).toEqual(['btc'])
    expect(JSON.parse(localStorage.getItem(BETS_FILTER_KEY) || '[]')).toEqual(['btc'])
    const plus = toggleBetsFilter(btc, 'ng')
    expect(plus).toEqual(['btc', 'ng'])
    expect(loadBetsFilter()).toEqual(['btc', 'ng'])
    const stay = toggleBetsFilter(['btc'], 'btc')
    expect(stay).toEqual(['btc'])
    const all = toggleBetsFilter(plus, 'all')
    expect(isAllBetsFilter(all)).toBe(true)
    expect(saveBetsFilter(['nope' as never])).toEqual(['btc', 'ng', 'cu', 'gld', 'wti', 'slv'])
    const persisted = applyBetsFilter(loadSettings(), 'btc')
    expect(persisted.betsFilter).toEqual(['btc'])
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').betsFilter).toEqual(['btc'])
    expect(applyBetsFilter(persisted, 'ng').betsFilter).toEqual(['btc', 'ng'])
    expect(loadSettings().betsFilter).toEqual(['btc', 'ng'])
    expect(loadSettings()).not.toHaveProperty('liveBets')
    expect(loadSettings().tapes.btc.armFromMin).toBe(8)
  })

  it('books Kalshi fills + settlements + open positions from first deposit', () => {
    const now = Date.now()
    const first = now - 10 * 86400000
    const next = mergeKalshiHistoryToBook(emptyFinance(), {
      fromMs: first,
      fills: {
        fills: [
          {
            fill_id: 'fill-btc-1',
            order_id: 'ord-kalshi-btc-hist-01',
            ticker: 'KXBTC15M-HIST',
            outcome_side: 'yes',
            count_fp: '1.00',
            yes_price_dollars: '0.72',
            no_price_dollars: '0.28',
            created_time: new Date(now - 2000).toISOString(),
          },
          {
            fill_id: 'fill-ng-open',
            order_id: 'ord-kalshi-ng-open-01',
            ticker: 'KXNATGAS15M-OPEN',
            outcome_side: 'no',
            count_fp: '2.00',
            yes_price_dollars: '0.60',
            no_price_dollars: '0.40',
            created_time: new Date(now - 1000).toISOString(),
          },
        ],
      },
      settlements: {
        settlements: [
          {
            ticker: 'KXBTC15M-HIST',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost_dollars: 0.72,
            revenue_dollars: 1,
            settled_time: new Date(now - 500).toISOString(),
          },
        ],
      },
      positions: {
        market_positions: [
          {
            ticker: 'KXNATGAS15M-OPEN',
            position_fp: '-2.00',
            market_exposure_dollars: '0.80',
            last_updated_ts: new Date(now - 1000).toISOString(),
          },
          {
            ticker: 'KXCOPPER15M-LIVE',
            position_fp: '1.00',
            market_exposure_dollars: '0.55',
            last_updated_ts: new Date(now - 800).toISOString(),
          },
        ],
      },
    }, now)
    expect(next.bets.find((b) => b.ticker === 'KXBTC15M-HIST')).toBeUndefined()
    expect(next.bets.find((b) => b.ticker === 'KXNATGAS15M-OPEN')).toBeUndefined()
    expect(next.bets.find((b) => b.ticker === 'KXCOPPER15M-LIVE')).toBeUndefined()
    expect(hydrateSettings(null)).not.toHaveProperty('liveBets')
  })

  it('splits paper TTL from Kalshi settle W–L — live-only P&L and placed', () => {
    const now = Date.now()
    const hits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    const paper = bookFill(emptyFinance(), {
      tape: 'cu',
      ticker: 'KXCOPPER15M-PAPER',
      clock: '15m',
      closeAt: now,
      side: 'up',
      count: 1,
      ask: 40,
      orderId: 'deskfill-cu-aaaaaaaa',
    })
    expect(paper.ok).toBe(true)
    if (!paper.ok) return
    expect(paper.bet.kind).toBe('paper')
    const withPaper = {
      ...paper.state,
      bets: paper.state.bets.map((b) => ({ ...b, status: 'settled' as const, pnl: -8, settledAt: now })),
    }
    const live = {
      ...withPaper,
      bets: [
        ...withPaper.bets,
        {
          betId: 'bet_btc',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-A',
          clock: '15m',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 70,
          spent: 10,
          orderId: 'ord-btc-aaaaaa',
          status: 'settled' as const,
          pnl: 5,
          filledAt: now - 1000,
          settledAt: now,
          kind: 'live' as const,
        },
      ],
    }
    const all = last24hBets(live, hits, now)
    expect(all.w).toBe(1)
    expect(all.l).toBe(0)
    expect(all.placed).toBeCloseTo(10)
    expect(all.pnl).toBeCloseTo(5)
    expect(all.rows.some((b) => /^deskfill-/i.test(String(b.orderId)))).toBe(false)
    expect(all.rows.some((b) => b.kind === 'live')).toBe(true)
    expect(bookRealizedPnl(live)).toBeCloseTo(5)
    expect(chasingLosses(withPaper, now)).toBe(false)
    const cu = last24hBets(live, hits, now, ['cu'])
    expect(cu.w).toBe(0)
    expect(cu.l).toBe(0)
    expect(cu.placed).toBe(0)
    expect(cu.pnl).toBe(0)
    const hydrated = hydrateFinance(live)
    expect(hydrated.bets.find((b) => b.orderId.startsWith('deskfill-'))?.kind).toBe('paper')
    expect(betClockLabel({ clock: '15m', ticker: 'KXCOPPER15M-PAPER' })).toBe('15m')
    expect(betClockLabel({ ticker: 'KXBTC15M-A' })).toBe('15m')
    expect(betClockLabel({ ticker: 'KXBTC5M-A' })).toBe('5m')
    expect(betClockLabel({ ticker: 'KXBTCD-A' })).toBe('1h')
    const kept = mergeKalshiHistoryToBook(live, {
      settlements: {
        settlements: [
          {
            ticker: 'KXBTC15M-A',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost_dollars: 10,
            revenue_dollars: 15,
            settled_time: new Date(now).toISOString(),
          },
        ],
      },
    }, now)
    expect(kept.bets.some((b) => b.kind === 'paper' && b.ticker === 'KXCOPPER15M-PAPER')).toBe(true)
    const paperRow = live.bets.find((b) => b.kind === 'paper')
    const liveRow = live.bets.find((b) => b.kind === 'live')
    expect(paperRow && cashUpdateForBet(paperRow)).toEqual({ kind: 'paper', amount: null })
    expect(liveRow && cashUpdateForBet(liveRow)).toEqual({ kind: 'live', amount: 5 })
    expect(cashUpdateForBet({ kind: 'live', status: 'open', pnl: null })).toEqual({ kind: 'open', amount: null })
    const run = cashAfterEachBet(
      [
        { betId: 'live-win', kind: 'live', status: 'settled', pnl: 0.48, filledAt: 1, settledAt: 1 },
        { betId: 'paper-win', kind: 'paper', status: 'settled', pnl: 5, filledAt: 2, settledAt: 2 },
        { betId: 'live-loss', kind: 'live', status: 'settled', pnl: -1, filledAt: 3, settledAt: 3 },
        { betId: 'live-open', kind: 'live', status: 'open', pnl: null, filledAt: 4 },
      ],
      499.48,
    )
    expect(run['live-win']).toBeCloseTo(499.48)
    expect(run['paper-win']).toBeNull()
    expect(run['live-loss']).toBeCloseTo(499.48)
    expect(run['live-open']).toBeCloseTo(499.48)
    expect(hydrateFinance({
      killed: false,
      paperStartedAt: 1,
      bets: [{
        betId: 'kalshi:KXBTC15M-A',
        tape: 'btc',
        ticker: 'KXBTC15M-A',
        clock: '15m',
        closeAt: now,
        side: 'up',
        count: 1,
        ask: 50,
        spent: 0.5,
        orderId: 'ord-kalshi-btc-hist-01',
        status: 'settled',
        pnl: 0.5,
        filledAt: now,
        settledAt: now,
        kind: 'live',
      }],
    }).bets[0]?.kind).toBe('hist')
    expect(betKind({ betId: 'kalshi:KXBTC15M-A', orderId: 'ord-kalshi-btc-hist-01', kind: 'live' })).toBe('live')
    expect(betKind({ betId: 'paper:local', orderId: 'deskfill-btc-aaaaaaaa' })).toBe('paper')
    const keptOld = mergeKalshiHistoryToBook(
      {
        ...emptyFinance(),
        bets: [
          {
            betId: 'kalshi:KXBTC15M-OLDKEEP',
            tape: 'btc',
            ticker: 'KXBTC15M-OLDKEEP',
            clock: '15m',
            closeAt: now - 1000,
            side: 'up',
            count: 1,
            ask: 50,
            spent: 0.5,
            orderId: 'settled-KXBTC15M-OLDKEEP',
            status: 'settled',
            pnl: 0.5,
            filledAt: now - 1000,
            settledAt: now - 1000,
            kind: 'paper',
          },
        ],
      },
      {
        settlements: {
          settlements: [
            {
              ticker: 'KXCOPPER15M-NEW',
              market_result: 'yes',
              yes_count_fp: '1',
              no_count_fp: '0',
              yes_total_cost_dollars: 0.4,
              revenue_dollars: 1,
              settled_time: new Date(now).toISOString(),
            },
          ],
        },
      },
      now,
    )
    expect(keptOld.bets.some((b) => b.ticker === 'KXBTC15M-OLDKEEP')).toBe(true)
    expect(keptOld.bets.some((b) => b.ticker === 'KXCOPPER15M-NEW')).toBe(false)
    const emptyLatch = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    expect(tapeHitCell('btc', emptyLatch, live.bets, now)).toEqual({ w: 1, l: 0 })
    expect(tapeHitCell('btc', { tapes: { ...emptyLatch.tapes, btc: { w: 3, l: 1 } } }, live.bets, now)).toEqual({
      w: 1,
      l: 0,
    })
    const staleGld = { tapes: { ...emptyLatch.tapes, gld: { w: 0, l: 2 } }, events: [] as Array<{ tape: 'gld'; ticker: string; win: boolean; at: number }> }
    const gldBook = [
      {
        tape: 'gld' as const,
        ticker: 'KXGOLD15M-A',
        status: 'settled' as const,
        pnl: 0.6,
        settledAt: now,
        closeAt: now,
        filledAt: now,
        kind: 'live' as const,
        orderId: 'ord-gld-a',
        betId: 'bet_ord-gld-a',
      },
      {
        tape: 'gld' as const,
        ticker: 'KXGOLD15M-B',
        status: 'settled' as const,
        pnl: -0.4,
        settledAt: now,
        closeAt: now,
        filledAt: now,
        kind: 'live' as const,
        orderId: 'ord-gld-b',
        betId: 'bet_ord-gld-b',
      },
      {
        tape: 'gld' as const,
        ticker: 'KXGOLD15M-C',
        status: 'settled' as const,
        pnl: 0.55,
        settledAt: now,
        closeAt: now,
        filledAt: now,
        kind: 'live' as const,
        orderId: 'ord-gld-c',
        betId: 'bet_ord-gld-c',
      },
    ]
    expect(tapeHitCell('gld', staleGld, gldBook, now)).toEqual({ w: 2, l: 1 })
    expect(
      tapeHitCell(
        'gld',
        staleGld,
        [
          {
            tape: 'gld' as const,
            ticker: 'KXGOLD15M-PAPER',
            status: 'settled' as const,
            pnl: -8,
            settledAt: now,
            kind: 'paper' as const,
            orderId: 'deskfill-gld-ttl',
          },
        ],
        now,
      ),
    ).toEqual({ w: 0, l: 0 })
    expect(betKind({ betId: 'bet_ord-real-12345', orderId: 'ord-real-12345', kind: 'live' })).toBe('live')
    const importedCash = cashAfterEachBet(
      [
        { betId: 'kalshi:KXBTC15M-A', kind: 'hist', status: 'settled', pnl: -19, filledAt: 1, settledAt: 1 },
        { betId: 'bet_ord-live-1', kind: 'live', orderId: 'ord-live-aaaaaa', status: 'settled', pnl: 0.48, filledAt: 2, settledAt: 2 },
      ],
      293.37,
    )
    expect(importedCash['kalshi:KXBTC15M-A']).toBeNull()
    expect(importedCash['bet_ord-live-1']).toBeCloseTo(293.37)
    const walk = cashAfterEachBet(
      [
        { betId: 'win-50', kind: 'live', status: 'settled', pnl: 50, filledAt: 1, settledAt: 1 },
        { betId: 'lose-10', kind: 'live', status: 'settled', pnl: -10, filledAt: 2, settledAt: 2 },
        { betId: 'paper-skip', kind: 'paper', orderId: 'deskfill-btc-skip01', status: 'settled', pnl: 99, filledAt: 3, settledAt: 3 },
      ],
      540,
    )
    expect(walk['win-50']).toBeCloseTo(540)
    expect(walk['lose-10']).toBeCloseTo(540)
    expect(walk['paper-skip']).toBeNull()
    const kalshiNow = cashAfterEachBet(
      [
        { betId: 'live-a', kind: 'live', status: 'settled', pnl: 50, filledAt: 1, settledAt: 1 },
        { betId: 'live-b', kind: 'live', status: 'settled', pnl: -19, filledAt: 2, settledAt: 2 },
        { betId: 'paper-c', kind: 'paper', orderId: 'deskfill-gld-halt01', status: 'settled', pnl: 12, filledAt: 3, settledAt: 3 },
      ],
      293.63,
    )
    expect(kalshiNow['live-a']).toBeCloseTo(293.63)
    expect(kalshiNow['live-b']).toBeCloseTo(293.63)
    expect(kalshiNow['paper-c']).toBeNull()
    expect(kalshiNow['live-a']).toBe(kalshiNow['live-b'])
    expect(Math.min(kalshiNow['live-a'] ?? 0, kalshiNow['live-b'] ?? 0)).toBeGreaterThan(0)
  })
})

describe('liveBotCall instant Kalshi post', () => {
  const ready = {
    tabOpen: true,
    killed: false,
    botOn: true,
    liveCash: true,
    rehabPaper: false,
    tradingActive: true,
    inArm: true,
    askOk: true,
    lean: 'up' as const,
    hitOk: true,
    fresh: true,
  }

  it('posts live from Bot + Live cash — Soft FAIL master liveBets', () => {
    expect(liveBotCall(ready)).toBe('live')
    expect(liveBotCall({ ...ready, liveCash: false })).toBe('paper')
    expect(liveBotCall({ ...ready, rehabPaper: true })).toBe('paper')
    expect(liveBotCall({ ...ready, fresh: false })).toBe('live')
    expect(liveBotCall({ ...ready, stale: true })).toBe('live')
    expect(liveBotCall({ ...ready, stale: true, tradingActive: false })).toBe('sit')
    expect(liveBotCall({ ...ready, fresh: undefined })).toBe('live')
    expect(liveBotCall({ ...ready, lean: 'sit' })).toBe('sit')
    expect(liveBotCall({ ...ready, hitOk: false })).toBe('live')
    expect(liveBotCall({ ...ready, liveCash: false, hitOk: false })).toBe('paper')
    expect(liveBotCall({ ...ready, tradingActive: false })).toBe('sit')
    expect(liveBotCall({ ...ready, botOn: false })).toBe('sit')
    expect(liveBotCall({ ...ready, liveCash: true } as typeof ready & { liveBets: boolean })).toBe('live')
    expect(paperFillAllowed({ liveCash: true, rehabPaper: false, stale: false }).ok).toBe(false)
    expect(paperFillAllowed({ liveCash: true, rehabPaper: true, stale: false }).ok).toBe(true)
    expect(paperFillAllowed({ liveCash: true, rehabPaper: false, stale: true }).ok).toBe(false)
    expect(paperFillAllowed({ liveCash: false, rehabPaper: false, stale: false }).ok).toBe(true)
  })

  it('tapeBotNote names Live cash paper vs live — Soft FAIL master Live copy', () => {
    const note = {
      botOn: true,
      liveCash: false,
      rehabPaper: false,
      hostCreds: true,
      tradingActive: true,
      inArm: true,
      askOk: true,
      lean: 'up' as const,
      hitOk: true,
      armFromMin: 8,
      armToMin: 3,
    }
    expect(tapeBotNote(note)).toBe('Live cash OFF — paper only, not sent to Kalshi')
    expect(tapeBotNote({ ...note, liveCash: true })).toBe('Live cash ON — next through posts to Kalshi')
    expect(tapeBotNote({ ...note, liveCash: true, stale: true })).toBe('Live cash ON — next through posts to Kalshi')
    expect(tapeBotNote({ ...note, liveCash: true, stale: true, tradingActive: false })).toBe('Kalshi window closed — sit')
    expect(tapeBotNote({ ...note, liveCash: true, hostCreds: false })).toBe('Kalshi keys missing on this PC — cannot POST')
  })
})

describe('MODE LIVE is this-desk V2 only — Soft FAIL kalshi:* as LIVE', () => {
  const emptyHits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }

  it('Live OFF hydrate settlements → HIST, not LIVE, and do not walk cash P&L', () => {
    expect(hydrateSettings(null)).not.toHaveProperty('liveBets')
    const raw = hydrateFinance({
      killed: false,
      paperStartedAt: 1,
      bets: [
        {
          betId: 'kalshi:KXBTC15M-A',
          tape: 'btc',
          ticker: 'KXBTC15M-A',
          clock: '15m',
          closeAt: 1,
          side: 'up',
          count: 1,
          ask: 50,
          spent: 19.06,
          orderId: 'settled-KXBTC15M-A',
          status: 'settled',
          pnl: -19.06,
          filledAt: 1,
          settledAt: 1,
          kind: 'live',
        },
      ],
    })
    expect(raw.bets[0]?.kind).toBe('hist')
    expect(betKind(raw.bets[0]!)).toBe('hist')
    expect(last24hBets(raw, emptyHits, Date.now()).placed).toBe(0)
    expect(last24hBets(raw, emptyHits, Date.now()).pnl).toBe(0)
    expect(cashAfterEachBet(raw.bets, 293.37)['kalshi:KXBTC15M-A']).toBeNull()
    expect(cashUpdateForBet(raw.bets[0]!)).toEqual({ kind: 'hist', amount: null })
    expect(pnlVsDeposits(293.37, 760)).toBeCloseTo(-466.63)
  })

  it('sendPaper deskfill → MODE PAPER, cash N/A, scoreboard cash unchanged', () => {
    const booked = bookFill(emptyFinance(), {
      tape: 'cu',
      ticker: 'KXCOPPER15M-TODAY',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'up',
      count: 1,
      ask: 40,
      orderId: 'deskfill-cu-paperqa1',
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return
    expect(booked.bet.kind).toBe('paper')
    expect(betKind(booked.bet)).toBe('paper')
    const settled = { ...booked.bet, status: 'settled' as const, pnl: -8, settledAt: Date.now() }
    const run = cashAfterEachBet([settled], 505)
    expect(run[booked.bet.betId]).toBeNull()
    const paperStrip = last24hBets({ ...emptyFinance(), bets: [settled] }, emptyHits)
    expect(paperStrip.placed).toBe(0)
    expect(paperStrip.pnl).toBe(0)
    expect(paperStrip.rows).toEqual([])
    expect(stripDeskRows([settled]).every((b) => !/^deskfill-/i.test(String(b.orderId)))).toBe(true)
  })

  it('mocked placeContract order_id → MODE LIVE and cash walks', () => {
    const booked = bookFill(emptyFinance(), {
      tape: 'btc',
      ticker: 'KXBTC15M-LIVE',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'up',
      count: 1,
      ask: 70,
      orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return
    expect(booked.bet.kind).toBe('live')
    expect(betKind(booked.bet)).toBe('live')
    const settled = { ...booked.bet, status: 'settled' as const, pnl: 0.48, settledAt: Date.now() }
    const run = cashAfterEachBet([settled], 500.48)
    expect(run[booked.bet.betId]).toBeCloseTo(500.48)
    expect(last24hBets({ ...emptyFinance(), bets: [settled] }, emptyHits).placed).toBeCloseTo(booked.bet.spent)
    expect(last24hBets({ ...emptyFinance(), bets: [settled] }, emptyHits).pnl).toBeCloseTo(0.48)
  })

  it('paper deskfill books beside HIST open and shows MODE PAPER / cash N/A', () => {
    const histOpen = {
      betId: 'kalshi:KXCOPPER15M-OPEN',
      tape: 'cu' as const,
      ticker: 'KXCOPPER15M-TODAY',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'down' as const,
      count: 1,
      ask: 50,
      spent: 19,
      orderId: 'pos-cu-open-hist',
      status: 'open' as const,
      pnl: null,
      filledAt: 1,
      settledAt: null,
      kind: 'hist' as const,
    }
    const start = hydrateFinance({ killed: false, paperStartedAt: 1, bets: [histOpen] })
    expect(openDeskFillOnTicker(start, 'KXCOPPER15M-TODAY')).toBe(false)
    const booked = bookFill(start, {
      tape: 'cu',
      ticker: 'KXCOPPER15M-TODAY',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'down',
      count: 1,
      ask: 40,
      orderId: 'deskfill-cu-f8bmwqhq',
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return
    expect(booked.bet.kind).toBe('paper')
    expect(betKind(booked.bet)).toBe('paper')
    expect(cashAfterEachBet(booked.state.bets, 293.37)[booked.bet.betId]).toBeNull()
    const synced = syncTicketsIntoBook(start, [
      {
        tape: 'cu',
        ticker: 'KXCOPPER15M-TODAY',
        side: 'down',
        orderId: 'deskfill-cu-f8bmwqhq',
        contracts: 1,
        beat: 6.7,
        filledAt: Date.now(),
      },
    ], () => ({ clock: '15m', closeAt: Date.now() + 60_000, ask: 40 }))
    expect(synced.bets.some((b) => b.orderId === 'deskfill-cu-f8bmwqhq' && betKind(b) === 'paper')).toBe(true)
  })
})
