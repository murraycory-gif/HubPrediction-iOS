import { afterEach, describe, expect, it } from 'vitest'
import {
  ASK_CAP,
  HIT_FLOOR,
  LIVE_FLOOR_MIN,
  hitFloorGate,
  askAllowedByGold,
  bookFill,
  emptyFinance,
  financeSendsOrders,
  liveArmGate,
  liveBotCall,
  liveCashFloor,
  liveSendGate,
  paper48hPassed,
  paperCashFloor,
  pnlVsDeposits,
  chasingLosses,
  last24hBets,
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
    expect(HIT_FLOOR).toBe(83)
    expect(hitFloorGate(0, 0).ok).toBe(true)
    expect(hitFloorGate(3, 0).ok).toBe(true)
    expect(hitFloorGate(20, 4).ok).toBe(true)
    expect(hitFloorGate(20, 5).ok).toBe(false)
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
    expect(strip.w).toBe(4)
    expect(strip.l).toBe(2)
    expect(strip.pnl).toBeCloseTo(0.28)
    const btc = last24hBets(state, hits, now, ['btc'])
    expect(btc.placed).toBeCloseTo(0.72)
    expect(btc.w).toBe(3)
    expect(btc.l).toBe(1)
    expect(btc.pnl).toBeCloseTo(0.28)
    const ng = last24hBets(state, hits, now, ['ng'])
    expect(ng.placed).toBe(0)
    expect(ng.w).toBe(0)
    expect(ng.l).toBe(0)
    expect(ng.pnl).toBe(0)
    const both = last24hBets(state, hits, now, ['btc', 'gld'])
    expect(both.w).toBe(4)
    expect(both.l).toBe(2)
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
    expect(hydrateBetsFilter([])).toEqual(['btc', 'ng', 'cu', 'gld'])
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
    expect(saveBetsFilter(['nope' as never])).toEqual(['btc', 'ng', 'cu', 'gld'])
    const persisted = applyBetsFilter(loadSettings(), 'btc')
    expect(persisted.betsFilter).toEqual(['btc'])
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').betsFilter).toEqual(['btc'])
    expect(applyBetsFilter(persisted, 'ng').betsFilter).toEqual(['btc', 'ng'])
    expect(loadSettings().betsFilter).toEqual(['btc', 'ng'])
    expect(loadSettings().liveBets).toBe(false)
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
    const btc = next.bets.find((b) => b.ticker === 'KXBTC15M-HIST')
    const ng = next.bets.find((b) => b.ticker === 'KXNATGAS15M-OPEN')
    const cu = next.bets.find((b) => b.ticker === 'KXCOPPER15M-LIVE')
    expect(btc?.status).toBe('settled')
    expect(btc?.side).toBe('up')
    expect(btc?.pnl).toBeCloseTo(0.28)
    expect(btc?.spent).toBeCloseTo(0.72)
    expect(ng?.status).toBe('open')
    expect(ng?.side).toBe('down')
    expect(ng?.spent).toBeCloseTo(0.8)
    expect(cu?.status).toBe('open')
    expect(cu?.side).toBe('up')
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(btc?.kind).toBe('live')
    expect(ng?.kind).toBe('live')
    expect(cu?.kind).toBe('live')
  })

  it('counts paper in hit W–L only — live-only P&L and placed', () => {
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
    expect(all.l).toBe(1)
    expect(all.placed).toBeCloseTo(10)
    expect(all.pnl).toBeCloseTo(5)
    expect(bookRealizedPnl(live)).toBeCloseTo(5)
    expect(chasingLosses(withPaper, now)).toBe(false)
    const cu = last24hBets(live, hits, now, ['cu'])
    expect(cu.w).toBe(0)
    expect(cu.l).toBe(1)
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
    expect(run['live-win']).toBeCloseTo(500.48)
    expect(run['paper-win']).toBeCloseTo(500.48)
    expect(run['live-loss']).toBeCloseTo(499.48)
    expect(run['live-open']).toBeCloseTo(499.48)
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
    expect(keptOld.bets.some((b) => b.ticker === 'KXCOPPER15M-NEW')).toBe(true)
    const emptyLatch = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    expect(tapeHitCell('btc', emptyLatch, live.bets, now)).toEqual({ w: 1, l: 0 })
    expect(tapeHitCell('btc', { tapes: { ...emptyLatch.tapes, btc: { w: 3, l: 1 } } }, live.bets, now)).toEqual({
      w: 3,
      l: 1,
    })
    expect(betKind({ betId: 'bet_ord-real-12345', orderId: 'ord-real-12345', kind: 'live' })).toBe('live')
    const importedCash = cashAfterEachBet(
      [
        { betId: 'kalshi:KXBTC15M-A', kind: 'live', status: 'settled', pnl: -19, filledAt: 1, settledAt: 1 },
        { betId: 'bet_ord-live-1', kind: 'live', orderId: 'ord-live-aaaaaa', status: 'settled', pnl: 0.48, filledAt: 2, settledAt: 2 },
      ],
      293.37,
    )
    expect(importedCash['kalshi:KXBTC15M-A']).toBeCloseTo(292.89)
    expect(importedCash['bet_ord-live-1']).toBeCloseTo(293.37)
    const walk = cashAfterEachBet(
      [
        { betId: 'win-50', kind: 'live', status: 'settled', pnl: 50, filledAt: 1, settledAt: 1 },
        { betId: 'lose-10', kind: 'live', status: 'settled', pnl: -10, filledAt: 2, settledAt: 2 },
        { betId: 'paper-skip', kind: 'paper', orderId: 'deskfill-btc-skip01', status: 'settled', pnl: 99, filledAt: 3, settledAt: 3 },
      ],
      540,
    )
    expect(walk['win-50']).toBeCloseTo(550)
    expect(walk['lose-10']).toBeCloseTo(540)
    expect(walk['paper-skip']).toBeCloseTo(540)
  })
})

describe('liveBotCall instant Kalshi post', () => {
  const ready = {
    tabOpen: true,
    killed: false,
    botOn: true,
    liveBets: true,
    liveCash: true,
    rehabPaper: false,
    tradingActive: true,
    inArm: true,
    askOk: true,
    lean: 'up' as const,
    hitOk: true,
  }

  it('posts live the moment the bot calls — no extra wait', () => {
    expect(liveBotCall(ready)).toBe('live')
    expect(liveBotCall({ ...ready, liveBets: false })).toBe('paper')
    expect(liveBotCall({ ...ready, liveCash: false })).toBe('paper')
    expect(liveBotCall({ ...ready, rehabPaper: true })).toBe('paper')
    expect(liveBotCall({ ...ready, lean: 'sit' })).toBe('sit')
    expect(liveBotCall({ ...ready, hitOk: false })).toBe('sit')
    expect(liveBotCall({ ...ready, tradingActive: false })).toBe('sit')
  })
})
