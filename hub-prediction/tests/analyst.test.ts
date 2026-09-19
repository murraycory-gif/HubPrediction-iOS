import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeDesk,
  acceptAnalystRecipe,
  applyAnalystAccept,
  applyDraftsToLiveSettings,
  consecutiveLosses,
  denyAnalystRec,
  emptyAutoState,
  expectedTakeDollars,
  explainRules,
  isDeniedRec,
  isRehabPaper,
  loadPaperDrafts,
  LOSS_STREAK_HALT,
  makePaperDrafts,
  paperRehabStats,
  pathWindowFromPoints,
  profitImpact,
  rehabCopy,
  REHAB_PAPER_RUNS,
  runAutoAnalyst,
  savePaperDrafts,
  scoreBetsVsRecipe,
  summarizeTapePath,
} from '../src/lib/analyst'
import { HIT_FLOOR } from '../src/lib/finance'
import { GOLD_RECIPES, SETTINGS_KEY, TAPE_IDS, emptyHits, hydrateSettings, loadSettings, patchTape } from '../src/lib/tapes'
import type { DeskBoard, TapeQuote } from '../src/lib/types'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

function quote(id: TapeQuote['id'], live: number, beat: number, extra: Partial<TapeQuote> = {}): TapeQuote {
  return {
    id,
    series: 'X',
    ticker: `${id}-1`,
    eventTicker: `${id}-e`,
    yesAsk: 72,
    noAsk: 29,
    beat,
    live,
    liveSource: 'kalshi-timeseries',
    points: [],
    openAt: 1,
    closeAt: Date.now() + 6 * 60_000,
    fetchedAt: Date.now(),
    clock: '9:15 PM',
    tradingActive: true,
    ...extra,
  }
}

function board(partial: Partial<DeskBoard['tapes']> = {}): DeskBoard {
  return {
    fetchedAt: Date.now(),
    tapes: {
      btc: quote('btc', 76540, 76500),
      ng: quote('ng', 2.993, 2.992, { yesAsk: 40, noAsk: 61 }),
      cu: quote('cu', 6.623, 6.622),
      gld: quote('gld', 4359, 4358),
      ...partial,
    },
  }
}

describe('analyst Soft KEEP gold factory + auto recipe', () => {
  it('starts from gold and never marks live touched', () => {
    const report = analyzeDesk(board(), emptyHits())
    expect(report.liveTouched).toBe(false)
    expect(report.locked).toEqual(GOLD_RECIPES)
    expect(hydrateSettings(null)).not.toHaveProperty('liveBets')
  })

  it('notes hug vs through and keeps a gold KEEP line when the book is quiet', () => {
    const hits = emptyHits()
    hits.tapes.btc = { w: 20, l: 9 }
    hits.tapes.gld = { w: 12, l: 8 }
    const report = analyzeDesk(
      board({
        btc: quote('btc', 76508, 76500),
        gld: quote('gld', 4359, 4358),
      }),
      hits,
    )
    expect(report.tapes.find((t) => t.id === 'btc')?.hug).toBe('hug')
    expect(report.tapes.find((t) => t.id === 'gld')?.hug).toBe('hug')
    expect(report.tapes.find((t) => t.id === 'btc')?.proposed).toMatch(/BTC 8–3 \/ \$40/)
    expect(report.tapes.find((t) => t.id === 'btc')?.proposed).toMatch(/80%/)
    expect(report.tapes.find((t) => t.id === 'gld')?.proposed).toMatch(/GLD 10–3 \/ \$2/)
    expect(report.tapes.find((t) => t.id === 'btc')?.w).toBe(20)
    expect(report.tapes.find((t) => t.id === 'btc')?.l).toBe(9)
  })

  it('saves paper drafts without writing live settings or flipping Live', () => {
    const report = analyzeDesk(board(), emptyHits())
    savePaperDrafts(makePaperDrafts(report))
    expect(loadPaperDrafts()?.recipes.btc.through).toBe(40)
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
    expect(loadSettings()).not.toHaveProperty('liveBets')
    expect(hydrateSettings(null)).not.toHaveProperty('liveBets')
  })

  it('refuses to apply drafts onto live cash', () => {
    expect(() => applyDraftsToLiveSettings()).toThrow(/must not apply paper drafts to LIVE/)
  })

  it('Accept recipe write leaves Live OFF and does not arm live cash', () => {
    const start = loadSettings()
    expect(start.tapes.btc.through).toBe(40)
    const next = applyAnalystAccept(start, 'btc', { ...GOLD_RECIPES.btc, through: 46, botOn: true, liveOn: false })
    expect(next.tapes.btc.through).toBe(46)
    expect(next.tapes.btc.botOn).toBe(true)
    expect(next.tapes.btc.liveOn).toBe(true)
    expect(next).not.toHaveProperty('liveBets')
    expect(loadSettings().tapes.btc.through).toBe(46)
    expect(loadSettings()).not.toHaveProperty('liveBets')
    expect(GOLD_RECIPES.btc.through).toBe(40)
  })

  it('Accept recipe write keeps user Live cash ON and contracts', () => {
    const armed = patchTape(loadSettings(), 'btc', { liveOn: true, botOn: true, contracts: 17 })
    expect(armed.tapes.btc.liveOn).toBe(true)
    const next = applyAnalystAccept(armed, 'btc', { ...GOLD_RECIPES.btc, through: 46, liveOn: false, contracts: 1 })
    expect(next.tapes.btc.through).toBe(46)
    expect(next.tapes.btc.liveOn).toBe(true)
    expect(next.tapes.btc.contracts).toBe(17)
    expect(loadSettings().tapes.btc.liveOn).toBe(true)
    expect(loadSettings().tapes.btc.contracts).toBe(17)
  })

  it('Deny stores the rec token and does not write settings', () => {
    const report = analyzeDesk(board(), emptyHits())
    const token = report.tapes[0].token
    denyAnalystRec(token)
    expect(isDeniedRec(token)).toBe(true)
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
  })
})

describe('analyst 24h / 48h path and bets vs recipe', () => {
  it('scores in-arm / in-¢ fills and 24h vs 48h desk pnl', () => {
    const now = Date.now()
    const score = scoreBetsVsRecipe(
      'btc',
      GOLD_RECIPES.btc,
      [
        {
          tape: 'btc',
          side: 'up',
          ask: 72,
          pnl: 0.28,
          status: 'settled',
          filledAt: now - 5 * 60_000,
          settledAt: now - 60_000,
          closeAt: now + 4 * 60_000,
        },
        {
          tape: 'btc',
          side: 'down',
          ask: 40,
          pnl: -1,
          status: 'settled',
          filledAt: now - 30 * 3_600_000,
          settledAt: now - 29 * 3_600_000,
          closeAt: now - 29 * 3_600_000,
        },
      ],
      now,
    )
    expect(score.placed).toBe(2)
    expect(score.inBand).toBe(1)
    expect(score.outBand).toBe(1)
    expect(score.pnl24).toBeCloseTo(0.28)
    expect(score.pnl48).toBeCloseTo(-0.72)
  })

  it('builds minute up/down vs current over 24h and 48h', () => {
    const now = 1_800_000_000_000
    const points = [
      { t: now - 40 * 3_600_000, px: 80_000 },
      { t: now - 20 * 3_600_000, px: 80_400 },
      { t: now - 10 * 60_000, px: 80_200 },
      { t: now, px: 80_100 },
    ]
    const path = summarizeTapePath('btc', points, 80_100, now)
    expect(path.hours24.delta).toBeCloseTo(-300)
    expect(path.hours48.delta).toBeCloseTo(100)
    expect(path.hours24.upMin + path.hours24.downMin).toBeGreaterThan(0)
    const minute = Math.floor(now / 60_000) * 60_000
    const short = pathWindowFromPoints(
      [
        { t: minute + 1000, px: 1 },
        { t: minute + 2000, px: 2 },
      ],
      minute + 3000,
      24,
      2,
    )
    expect(short.minutes).toBe(1)
  })

  it('retunes through when through-sends are hitting and does not chase a cold 24h', () => {
    const now = Date.now()
    const hot = analyzeDesk(
      board({ btc: quote('btc', 76600, 76500) }),
      emptyHits(),
      [
        { tape: 'btc', side: 'up', ask: 72, pnl: 0.28, status: 'settled', filledAt: now - 1000, settledAt: now - 500, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 74, pnl: 0.26, status: 'settled', filledAt: now - 2000, settledAt: now - 400, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 71, pnl: 0.29, status: 'settled', filledAt: now - 3000, settledAt: now - 300, closeAt: now + 4 * 60_000 },
      ],
    )
    const btc = hot.tapes.find((t) => t.id === 'btc')
    expect(btc?.changed).toBe(true)
    expect(btc?.nextRecipe.through).toBeLessThan(40)

    const hits = emptyHits()
    hits.tapes.btc = { w: 1, l: 6 }
    const cold = analyzeDesk(
      board(),
      hits,
      [
        { tape: 'btc', side: 'up', ask: 72, pnl: -1, status: 'settled', filledAt: now - 1000, settledAt: now - 500, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 73, pnl: -1, status: 'settled', filledAt: now - 2000, settledAt: now - 400, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 70, pnl: -1, status: 'settled', filledAt: now - 3000, settledAt: now - 300, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'down', ask: 71, pnl: -1, status: 'settled', filledAt: now - 4000, settledAt: now - 200, closeAt: now + 4 * 60_000 },
      ],
    )
    const sit = cold.tapes.find((t) => t.id === 'btc')
    expect(sit?.changed).toBe(false)
    expect(sit?.proposed).toMatch(/80%/)
  })
})

describe('analyst current rules + profit dollars', () => {
  it('explains gold BTC rules in plain English and never flips Live', () => {
    const rules = explainRules('btc', GOLD_RECIPES.btc)
    expect(rules.arm).toMatch(/8 min down to 3 min/)
    expect(rules.through).toMatch(/\$40/)
    expect(rules.cents).toMatch(/69–89/)
    expect(rules.size).toMatch(/Live cash ON/)
    expect(expectedTakeDollars(72, 1, 80)).toBeCloseTo(0.08)
    expect(expectedTakeDollars(72, 1, 50)).toBeCloseTo(-0.22)
  })

  it('names the dollar add on a keep vs a through trim', () => {
    const quiet = analyzeDesk(board(), emptyHits())
    const btc = quiet.tapes.find((t) => t.id === 'btc')!
    const keep = profitImpact(btc, 72)
    expect(keep.headline).toMatch(/\$2\.40/)
    expect(keep.detail).toMatch(/grows dollars/)
    expect(keep.detail).toMatch(/Live/)

    const now = Date.now()
    const hot = analyzeDesk(
      board({ btc: quote('btc', 76600, 76500) }),
      emptyHits(),
      [
        { tape: 'btc', side: 'up', ask: 72, pnl: 0.28, status: 'settled', filledAt: now - 1000, settledAt: now - 500, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 74, pnl: 0.26, status: 'settled', filledAt: now - 2000, settledAt: now - 400, closeAt: now + 4 * 60_000 },
        { tape: 'btc', side: 'up', ask: 71, pnl: 0.29, status: 'settled', filledAt: now - 3000, settledAt: now - 300, closeAt: now + 4 * 60_000 },
      ],
    )
    const trim = hot.tapes.find((t) => t.id === 'btc')!
    expect(trim.changed).toBe(true)
    expect(profitImpact(trim, 72).headline).toMatch(/extra clean take|\$0\.08/)
  })
})

describe('analyst auto 80% + 3-loss paper rehab', () => {
  function settled(
    tape: 'btc' | 'ng' | 'cu' | 'gld',
    pnl: number,
    at: number,
    extra: { kind?: 'live' | 'paper'; betId?: string } = {},
  ) {
    return {
      betId: extra.betId ?? `bet_${tape}_${at}`,
      tape,
      status: 'settled' as const,
      pnl,
      filledAt: at,
      settledAt: at,
      closeAt: at,
      kind: extra.kind ?? 'live',
      orderId: extra.kind === 'paper' ? `deskfill-${tape}-${at}` : `ord-${tape}-${at}`,
    }
  }

  it('counts more than two losses in a row', () => {
    const now = 2_000_000
    const bets = [
      settled('btc', -1, now),
      settled('btc', -1, now - 1),
      settled('btc', -1, now - 2),
      settled('btc', 1, now - 3),
    ]
    expect(LOSS_STREAK_HALT).toBe(3)
    expect(consecutiveLosses(bets, 'btc')).toBe(3)
    expect(consecutiveLosses([settled('btc', -1, now), settled('btc', 1, now - 1)], 'btc')).toBe(1)
  })

  it('proposes an 80% retune and does not auto-apply into Live recipes', () => {
    const now = Date.now()
    const bets = [
      { tape: 'btc' as const, side: 'up' as const, ask: 72, pnl: 0.28, status: 'settled' as const, filledAt: now - 1000, settledAt: now - 500, closeAt: now + 4 * 60_000, betId: 'a' },
      { tape: 'btc' as const, side: 'up' as const, ask: 74, pnl: 0.26, status: 'settled' as const, filledAt: now - 2000, settledAt: now - 400, closeAt: now + 4 * 60_000, betId: 'b' },
      { tape: 'btc' as const, side: 'up' as const, ask: 71, pnl: 0.29, status: 'settled' as const, filledAt: now - 3000, settledAt: now - 300, closeAt: now + 4 * 60_000, betId: 'c' },
    ]
    const start = hydrateSettings({
      togglesPicked: true,
      togglesAt: 1,
      tapes: { btc: { ...GOLD_RECIPES.btc, botOn: true, liveOn: false } },
    })
    const report = analyzeDesk(board({ btc: quote('btc', 76600, 76500) }), emptyHits(), bets, start.tapes)
    const note = report.tapes.find((t) => t.id === 'btc')
    expect(note?.changed).toBe(true)
    const first = runAutoAnalyst({ settings: start, report, bets, rehab: emptyAutoState() })
    expect(first.didChange).toBe(true)
    expect(first.settings.tapes.btc.through).toBe(start.tapes.btc.through)
    expect(first.settings.tapes.btc.through).toBe(40)
    expect(first.settings.tapes.btc.armFromMin).toBe(start.tapes.btc.armFromMin)
    expect(first.settings.tapes.btc.centLo).toBe(start.tapes.btc.centLo)
    expect(first.msg).toMatch(/proposed rules only — drafts stay paper/)
    expect(first.settings).not.toHaveProperty('liveBets')
    expect(first.settings.tapes.btc.liveOn).toBe(false)
    const again = runAutoAnalyst({ settings: first.settings, report, bets, rehab: first.rehab })
    expect(again.didChange).toBe(false)
    expect(again.settings.tapes.btc.through).toBe(40)
    const accepted = acceptAnalystRecipe(start, 'btc', note!.nextRecipe, {
      killed: false,
      paperStartedAt: 1,
      bets: [],
    })
    expect(accepted.ok).toBe(true)
    if (accepted.ok) {
      expect(accepted.settings.tapes.btc.through).not.toBe(40)
      expect(accepted.settings.tapes.btc.liveOn).toBe(false)
    }
    const liveOn = patchTape(start, 'btc', { liveOn: true, botOn: true })
    const liveReport = analyzeDesk(board({ btc: quote('btc', 76600, 76500) }), emptyHits(), bets, liveOn.tapes)
    const autoLive = runAutoAnalyst({ settings: liveOn, report: liveReport, bets, rehab: emptyAutoState() })
    expect(autoLive.settings.tapes.btc.through).toBe(liveOn.tapes.btc.through)
    expect(autoLive.settings.tapes.btc.liveOn).toBe(true)
    const chasing = acceptAnalystRecipe(start, 'btc', note!.nextRecipe, {
      killed: false,
      paperStartedAt: 1,
      bets: [
        {
          betId: 'bet_loss',
          tape: 'btc',
          ticker: 'KXBTC15M-1',
          clock: '15m',
          closeAt: now,
          side: 'up',
          count: 1,
          ask: 72,
          spent: 0.72,
          orderId: 'ord-loss-accept',
          status: 'settled',
          pnl: -0.72,
          filledAt: now - 1000,
          settledAt: now,
          kind: 'live',
        },
      ],
    }, now)
    expect(chasing.ok).toBe(false)
  })

  it('halts live cash after 3 losses, papers 12, then restores at 80%', () => {
    const now = 5_000_000
    const losses = [0, 1, 2].map((i) => settled('btc', -1, now - i * 1000, { kind: 'live' }))
    const armed = hydrateSettings({
      tapes: { btc: { ...GOLD_RECIPES.btc, botOn: true, liveOn: true } },
    })
    const report = analyzeDesk(board(), emptyHits(), losses, armed.tapes)
    const halted = runAutoAnalyst({ settings: armed, report, bets: losses, rehab: emptyAutoState(), now })
    expect(isRehabPaper(halted.rehab, 'btc')).toBe(true)
    expect(halted.settings.tapes.btc.liveOn).toBe(true)
    expect(halted.settings.tapes.btc.through).toBe(armed.tapes.btc.through)
    expect(halted.settings.tapes.btc.armFromMin).toBe(armed.tapes.btc.armFromMin)
    expect(halted.settings).not.toHaveProperty('liveBets')
    expect(halted.rehab.tapes.btc?.liveWasOn).toBe(true)
    expect(REHAB_PAPER_RUNS).toBe(12)

    const paper = Array.from({ length: 12 }, (_, i) =>
      settled('btc', i < 10 ? 0.2 : -0.7, now + 10_000 + i * 1000, { kind: 'paper', betId: `paper_${i}` }),
    )
    expect(paperRehabStats(paper, 'btc', now).n).toBe(12)
    expect(paperRehabStats(paper, 'btc', now).pct).toBeGreaterThanOrEqual(80)
    const done = runAutoAnalyst({
      settings: halted.settings,
      report: analyzeDesk(board(), emptyHits(), [...losses, ...paper], halted.settings.tapes),
      bets: [...losses, ...paper],
      rehab: halted.rehab,
      now: now + 30_000,
    })
    expect(isRehabPaper(done.rehab, 'btc')).toBe(false)
    expect(done.rehab.tapes.btc?.status).toBe('restored')
    expect(done.settings.tapes.btc.liveOn).toBe(true)
    expect(done.settings).not.toHaveProperty('liveBets')
  })

  it('does not restore live cash when the 12 paper runs miss 80%', () => {
    const now = 6_000_000
    const losses = [0, 1, 2].map((i) => settled('ng', -1, now - i * 1000))
    const armed = hydrateSettings({
      togglesPicked: true,
      togglesAt: 1,
      tapes: { ng: { ...GOLD_RECIPES.ng, botOn: true, liveOn: true } },
    })
    const halted = runAutoAnalyst({
      settings: armed,
      report: analyzeDesk(board(), emptyHits(), losses, armed.tapes),
      bets: losses,
      rehab: emptyAutoState(),
      now,
    })
    const paper = Array.from({ length: 12 }, (_, i) =>
      settled('ng', i < 8 ? 0.2 : -0.4, now + 10_000 + i * 1000, { kind: 'paper', betId: `ngp_${i}` }),
    )
    expect(paperRehabStats(paper, 'ng', now).pct).toBeLessThan(80)
    const stay = runAutoAnalyst({
      settings: halted.settings,
      report: analyzeDesk(board(), emptyHits(), [...losses, ...paper], halted.settings.tapes),
      bets: [...losses, ...paper],
      rehab: halted.rehab,
      now: now + 40_000,
    })
    expect(isRehabPaper(stay.rehab, 'ng')).toBe(true)
    expect(stay.settings.tapes.ng.liveOn).toBe(true)
    expect(stay.settings).not.toHaveProperty('liveBets')
  })

  it('halts live cash from real Kalshi losses — Soft FAIL unlock during HALT', () => {
    const now = 7_000_000
    const losses = [0, 1, 2].map((i) => ({
      betId: `kalshi:KXGOLD15M-L${i}`,
      tape: 'gld' as const,
      status: 'settled' as const,
      pnl: -8,
      filledAt: now - i * 1000,
      settledAt: now - i * 1000,
      closeAt: now - i * 1000,
      kind: 'live' as const,
      orderId: `settled-KXGOLD15M-L${i}`,
    }))
    const armed = hydrateSettings({
      togglesPicked: true,
      togglesAt: 1,
      tapes: { gld: { ...GOLD_RECIPES.gld, botOn: true, liveOn: true } },
    })
    const halted = runAutoAnalyst({
      settings: armed,
      report: analyzeDesk(board(), emptyHits(), losses, armed.tapes),
      bets: losses,
      rehab: emptyAutoState(),
      now,
    })
    expect(isRehabPaper(halted.rehab, 'gld')).toBe(true)
    expect(halted.settings.tapes.gld.liveOn).toBe(true)
    const stay = runAutoAnalyst({
      settings: { ...halted.settings, tapes: { ...halted.settings.tapes, gld: { ...halted.settings.tapes.gld, liveOn: true } } },
      report: analyzeDesk(board(), emptyHits(), losses, halted.settings.tapes),
      bets: losses,
      rehab: halted.rehab,
      now: now + 1000,
    })
    expect(isRehabPaper(stay.rehab, 'gld')).toBe(true)
    expect(stay.settings.tapes.gld.liveOn).toBe(true)
  })

  it('never writes liveOn false into desk-state during HALT', () => {
    const now = 8_000_000
    const losses = [0, 1, 2].map((i) => settled('cu', -1, now - i * 1000, { kind: 'live' }))
    const armed = hydrateSettings({
      togglesPicked: true,
      togglesAt: 1,
      tapes: { cu: { ...GOLD_RECIPES.cu, botOn: true, liveOn: true } },
    })
    const halted = runAutoAnalyst({
      settings: armed,
      report: analyzeDesk(board(), emptyHits(), losses, armed.tapes),
      bets: losses,
      rehab: emptyAutoState(),
      now,
    })
    expect(isRehabPaper(halted.rehab, 'cu')).toBe(true)
    expect(halted.settings.tapes.cu.liveOn).toBe(true)
    const again = runAutoAnalyst({
      settings: halted.settings,
      report: analyzeDesk(board(), emptyHits(), losses, halted.settings.tapes),
      bets: losses,
      rehab: halted.rehab,
      now: now + 1000,
    })
    expect(isRehabPaper(again.rehab, 'cu')).toBe(true)
    expect(again.settings.tapes.cu.liveOn).toBe(true)
  })

  it('HIT_FLOOR 80 is the same sit/rehab goal on BTC NG CU GLD', () => {
    expect(HIT_FLOOR).toBe(80)
    expect(TAPE_IDS).toEqual(['btc', 'ng', 'cu', 'gld', 'wti', 'slv'])
    const now = Date.now()
    const hits = emptyHits()
    const coldBets = TAPE_IDS.flatMap((id) =>
      [0, 1, 2, 3].map((i) => ({
        tape: id,
        side: 'up' as const,
        ask: 72,
        pnl: -1,
        status: 'settled' as const,
        filledAt: now - (i + 1) * 1000,
        settledAt: now - (i + 1) * 400,
        closeAt: now + 4 * 60_000,
      })),
    )
    for (const id of TAPE_IDS) hits.tapes[id] = { w: 1, l: 6 }
    const cold = analyzeDesk(board(), hits, coldBets)
    for (const id of TAPE_IDS) {
      const sit = cold.tapes.find((t) => t.id === id)
      expect(sit?.changed).toBe(false)
      expect(sit?.proposed).toMatch(/80%/)
      expect(sit?.proposed).not.toMatch(/83%/)
    }
    for (const id of TAPE_IDS) {
      const restored = rehabCopy(
        {
          ...emptyAutoState(),
          tapes: {
            [id]: {
              id,
              status: 'restored',
              haltedAt: 1,
              liveWasOn: true,
              paperTarget: REHAB_PAPER_RUNS,
              fromMs: 1,
              appliedToken: '',
              restoredAt: 2,
            },
          },
        },
        id,
      )
      expect(restored).toMatch(/80%/)
      expect(restored).not.toMatch(/83%/)
      const halted = rehabCopy(
        {
          ...emptyAutoState(),
          tapes: {
            [id]: {
              id,
              status: 'paper',
              haltedAt: 1,
              liveWasOn: true,
              paperTarget: REHAB_PAPER_RUNS,
              fromMs: 1,
              appliedToken: '',
            },
          },
        },
        id,
      )
      expect(halted).toMatch(/Back on at 80%/)
      expect(halted).not.toMatch(/83%/)
    }
  })
})
