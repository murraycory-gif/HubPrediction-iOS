import { describe, expect, it } from 'vitest'
import {
  CUT_FRAC,
  MAX_LIVE_CLOCKS,
  RESERVE_CASH,
  RESERVE_RISK,
  STEP_UP_WINS,
  chiefNeverWritesLiveOn,
  hydrateChief,
  mergeChiefState,
  pickChiefClock,
  runDeskChief,
  tapeLiveArmGate,
} from '../src/lib/desk-chief'
import { DAILY_PROFIT_LOCK, HIT_FLOOR, emptyFinance, feeAwareEv, liveCashFloor, livePairGate, liveSendGate } from '../src/lib/finance'
import { GOLD_RECIPES, hydrateSettings } from '../src/lib/tapes'

const now = 1_800_000_000_000

function paperSettled(tape: 'btc' | 'ng' | 'cu' | 'gld', i: number, pnl: number) {
  return {
    betId: `paper:${tape}-${i}`,
    tape,
    ticker: `KXBTC15M-P${i}`,
    clock: '15m',
    closeAt: now - i * 60_000,
    side: 'up' as const,
    count: 1,
    ask: 70,
    spent: 0.7,
    orderId: `deskfill-${tape}-w${i}`,
    status: 'settled' as const,
    pnl,
    filledAt: now - i * 60_000,
    settledAt: now - i * 60_000,
    kind: 'paper' as const,
  }
}

function liveSettled(tape: 'btc' | 'ng' | 'cu' | 'gld', i: number, pnl: number) {
  return {
    betId: `bet_ord-live-${tape}-${i}`,
    tape,
    ticker: `KXBTC15M-L${i}`,
    clock: '15m',
    closeAt: now - i * 60_000,
    side: 'up' as const,
    count: 1,
    ask: 70,
    spent: 0.7,
    orderId: `ord-live-${tape}-aaaa${i}`,
    status: 'settled' as const,
    pnl,
    filledAt: now - i * 60_000,
    settledAt: now - i * 60_000,
    kind: 'live' as const,
  }
}

describe('Desk Chief paper allocator', () => {
  it('defaults are 60/40 reserve, max 2 Live clocks, +$40 lock-in, 80% goal', () => {
    expect(RESERVE_CASH).toBe(0.6)
    expect(RESERVE_RISK).toBe(0.4)
    expect(RESERVE_CASH).not.toBe(0.5)
    expect(RESERVE_RISK).not.toBe(0.5)
    expect(MAX_LIVE_CLOCKS).toBe(2)
    expect(MAX_LIVE_CLOCKS).toBeLessThan(3)
    expect(DAILY_PROFIT_LOCK).toBe(40)
    expect(HIT_FLOOR).toBe(80)
    expect(STEP_UP_WINS).toBe(3)
    expect(CUT_FRAC).toBe(0.5)
    expect(feeAwareEv(72, 1, 80)).toBeGreaterThan(0)
    expect(feeAwareEv(82, 1, 80)).toBeLessThanOrEqual(0)
  })

  it('paper 3W sizes up and Soft FAIL flipping Live', () => {
    const settings = hydrateSettings({
      tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: false, botOn: true, contracts: 1 } },
    })
    const book = {
      ...emptyFinance(),
      bets: [1, 2, 3].map((i) => paperSettled('btc', i, 0.3)),
    }
    const result = runDeskChief({
      settings,
      book,
      cash: 293.93,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies.some((a) => a.tape === 'btc' && a.contracts === 2)).toBe(true)
    expect(result.liveOnWrites).toEqual({})
    expect(chiefNeverWritesLiveOn(result)).toBe(true)
    expect(settings.tapes.btc.liveOn).toBe(false)
    expect(result.state.progress.btc.liveOn).toBe(false)
  })

  it('cash floor Soft FAIL Live size-up and Soft FAIL Live ON write', () => {
    const settings = hydrateSettings({
      tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: true, botOn: true, contracts: 2 } },
    })
    const book = {
      ...emptyFinance(),
      paperStartedAt: now - 49 * 3600_000,
      bets: [1, 2, 3].map((i) => liveSettled('btc', i, 0.3)),
    }
    const cash = 50
    expect(cash).toBeLessThan(liveCashFloor(760))
    const result = runDeskChief({
      settings,
      book,
      cash,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies).toEqual([])
    expect(result.liveOnWrites).toEqual({})
    expect(result.state.proposals.some((p) => p.kind === 'block' && /cash floor|under live floor/i.test(p.reason))).toBe(
      true,
    )
    expect(settings.tapes.btc.liveOn).toBe(true)
    expect(settings.tapes.btc.contracts).toBe(2)
  })

  it('Live pair is BTC + one of NG/CU — Soft FAIL 3–4 and GLD', () => {
    expect(livePairGate('btc', []).ok).toBe(true)
    expect(livePairGate('ng', ['btc']).ok).toBe(true)
    expect(livePairGate('cu', ['btc', 'ng']).ok).toBe(false)
    expect(livePairGate('ng', ['cu']).ok).toBe(false)
    expect(livePairGate('gld', ['btc']).ok).toBe(false)
    expect(livePairGate('cu', ['btc', 'ng', 'cu']).ok).toBe(true)
    const heat = {
      ...emptyFinance(),
      bets: [
        liveSettled('btc', 1, 0.3),
        { ...liveSettled('ng', 2, 0.3), status: 'open' as const, pnl: null, settledAt: null },
        { ...liveSettled('btc', 3, 0.3), status: 'open' as const, pnl: null, settledAt: null, ticker: 'KXBTC15M-OPEN', orderId: 'ord-live-btc-open1', betId: 'bet_ord-live-btc-open1' },
      ],
    }
    const third = liveSendGate(heat, {
      tape: 'cu',
      ticker: 'KXCOPPER15M-HEAT',
      ask: 70,
      cash: 400,
      deposits: 760,
      spent: 0.7,
    })
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.reason).toMatch(/NG\/CU|Max 2/)
  })

  it('3W steps +1 and 2L cuts −50% Soft FAIL 1→20', () => {
    const up = runDeskChief({
      settings: hydrateSettings({ tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: false, contracts: 2 } } }),
      book: { ...emptyFinance(), bets: [1, 2, 3].map((i) => paperSettled('btc', i, 0.3)) },
      cash: 400,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(up.paperApplies.some((a) => a.tape === 'btc' && a.contracts === 3)).toBe(true)
    const cut = runDeskChief({
      settings: hydrateSettings({ tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: false, contracts: 8 } } }),
      book: { ...emptyFinance(), bets: [1, 2].map((i) => paperSettled('btc', i, -0.7)) },
      cash: 400,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now: now + 1,
      prev: hydrateChief(null, now + 1),
    })
    expect(cut.paperApplies.some((a) => a.tape === 'btc' && a.contracts === 4)).toBe(true)
    expect(up.liveOnWrites).toEqual({})
    expect(cut.liveOnWrites).toEqual({})
  })

  it('GLD STALE Soft FAIL Live arm', () => {
    expect(tapeLiveArmGate('gld', { tradingActive: false, stale: true }).ok).toBe(false)
    expect(tapeLiveArmGate('gld', { tradingActive: true, stale: false }).ok).toBe(true)
    const settings = hydrateSettings({
      tapes: { gld: { ...GOLD_RECIPES.gld, liveOn: false, contracts: 1 } },
    })
    const result = runDeskChief({
      settings,
      book: emptyFinance(),
      cash: 400,
      deposits: 760,
      quotes: { gld: { tradingActive: false, stale: true, yesAsk: 40 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.liveOnWrites.gld).toBeUndefined()
    expect(result.state.actions.some((a) => /GLD STALE/i.test(a.text))).toBe(true)
  })

  it('clock pick paper-applies 5m→15m on a dead tape Soft FAIL Live flip', () => {
    expect(pickChiefClock('5m', { closed: true, stale: true, halt: false, hitPct: 0, w: 0, l: 0 })).toBe('15m')
    expect(pickChiefClock('15m', { closed: true, stale: true, halt: false, hitPct: 0, w: 0, l: 0 })).toBeNull()
    const settings = hydrateSettings({
      tapes: { gld: { ...GOLD_RECIPES.gld, liveOn: false, botOn: true, contracts: 1 } },
      clocks: { btc: '15m', ng: '15m', cu: '15m', gld: '5m' },
    })
    const result = runDeskChief({
      settings,
      book: emptyFinance(),
      cash: 400,
      deposits: 760,
      quotes: { gld: { tradingActive: false, stale: true, yesAsk: 40 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies.some((a) => a.tape === 'gld' && a.clock === '15m')).toBe(true)
    expect(result.liveOnWrites).toEqual({})
    expect(settings.tapes.gld.liveOn).toBe(false)
    expect(result.state.actions.some((a) => /pre-arm/i.test(a.text))).toBe(true)
  })

  it('Live clock change is a draft — Soft FAIL auto clock + Soft FAIL Live ON', () => {
    const settings = hydrateSettings({
      tapes: { gld: { ...GOLD_RECIPES.gld, liveOn: true, botOn: true, contracts: 1 } },
      clocks: { btc: '15m', ng: '15m', cu: '15m', gld: '5m' },
    })
    const result = runDeskChief({
      settings,
      book: { ...emptyFinance(), paperStartedAt: now - 49 * 3600_000 },
      cash: 400,
      deposits: 760,
      quotes: { gld: { tradingActive: false, stale: true, yesAsk: 40 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies.some((a) => a.tape === 'gld' && a.clock === '15m')).toBe(false)
    expect(result.state.proposals.some((p) => p.kind === 'clock' && p.apply === 'draft' && p.tape === 'gld')).toBe(true)
    expect(result.liveOnWrites).toEqual({})
    expect(settings.tapes.gld.liveOn).toBe(true)
  })

  it('Live 3W auto-applies size under floors/kill Soft FAIL Accept babysit', () => {
    const settings = hydrateSettings({
      tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: true, botOn: true, contracts: 2 } },
    })
    const book = {
      ...emptyFinance(),
      paperStartedAt: now - 49 * 3600_000,
      bets: [1, 2, 3].map((i) => liveSettled('btc', i, 0.3)),
    }
    const result = runDeskChief({
      settings,
      book,
      cash: 294,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies.some((a) => a.tape === 'btc' && a.contracts === 3)).toBe(true)
    expect(result.state.proposals.some((p) => p.kind === 'live-size' && p.apply === 'auto' && p.status === 'applied')).toBe(
      true,
    )
    expect(result.state.proposals.some((p) => p.kind === 'live-size' && p.apply === 'draft')).toBe(false)
    expect(result.liveOnWrites).toEqual({})
    expect(settings.tapes.btc.liveOn).toBe(true)
  })

  it('Soft FAIL jump 1→20 without a streak', () => {
    expect(
      pickChiefClock('15m', { closed: false, stale: false, halt: false, hitPct: 100, w: 1, l: 0 }),
    ).toBeNull()
    const settings = hydrateSettings({
      tapes: { btc: { ...GOLD_RECIPES.btc, liveOn: false, contracts: 1 } },
    })
    const book = { ...emptyFinance(), bets: [paperSettled('btc', 1, 0.3)] }
    const result = runDeskChief({
      settings,
      book,
      cash: 400,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
      prev: hydrateChief(null, now),
    })
    expect(result.paperApplies.some((a) => a.tape === 'btc' && a.contracts >= 20)).toBe(false)
  })

  it('chief state merge keeps the newer blob Soft FAIL wipe', () => {
    const older = hydrateChief({ asOf: 1, actions: [{ id: 'a', at: 1, text: 'old' }] }, 1)
    const newer = hydrateChief({ asOf: 9, actions: [{ id: 'b', at: 9, text: 'new' }] }, 9)
    const merged = mergeChiefState(older, newer)
    expect(merged.asOf).toBe(9)
    expect(merged.actions.some((a) => a.text === 'new')).toBe(true)
  })
})
