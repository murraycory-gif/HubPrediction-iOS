import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeDesk,
  applyAnalystAccept,
  applyDraftsToLiveSettings,
  denyAnalystRec,
  isDeniedRec,
  loadPaperDrafts,
  makePaperDrafts,
  pathWindowFromPoints,
  savePaperDrafts,
  scoreBetsVsRecipe,
  summarizeTapePath,
} from '../src/lib/analyst'
import { GOLD_RECIPES, SETTINGS_KEY, emptyHits, hydrateSettings, loadSettings } from '../src/lib/tapes'
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

describe('analyst Soft KEEP gold factory + user Accept', () => {
  it('starts from gold and never marks live touched', () => {
    const report = analyzeDesk(board(), emptyHits())
    expect(report.liveTouched).toBe(false)
    expect(report.locked).toEqual({
      btc: GOLD_RECIPES.btc,
      ng: GOLD_RECIPES.ng,
      cu: GOLD_RECIPES.cu,
      gld: GOLD_RECIPES.gld,
    })
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('notes hug vs through and keeps a gold KEEP line when the book is quiet', () => {
    const hits = emptyHits()
    hits.tapes.btc = { w: 20, l: 9 }
    hits.tapes.gld = { w: 12, l: 8 }
    const report = analyzeDesk(
      board({
        btc: quote('btc', 76520, 76500),
        gld: quote('gld', 4359, 4358),
      }),
      hits,
    )
    expect(report.tapes.find((t) => t.id === 'btc')?.hug).toBe('hug')
    expect(report.tapes.find((t) => t.id === 'gld')?.hug).toBe('hug')
    expect(report.tapes.find((t) => t.id === 'btc')?.proposed).toMatch(/BTC 8–3 \/ \$40/)
    expect(report.tapes.find((t) => t.id === 'btc')?.proposed).toMatch(/83%/)
    expect(report.tapes.find((t) => t.id === 'gld')?.proposed).toMatch(/GLD 10–3 \/ \$2/)
    expect(report.tapes.find((t) => t.id === 'btc')?.w).toBe(20)
    expect(report.tapes.find((t) => t.id === 'btc')?.l).toBe(9)
  })

  it('saves paper drafts without writing live settings or flipping Live', () => {
    const report = analyzeDesk(board(), emptyHits())
    savePaperDrafts(makePaperDrafts(report))
    expect(loadPaperDrafts()?.recipes.btc.through).toBe(40)
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
    expect(loadSettings().liveBets).toBe(false)
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('refuses to apply drafts onto live cash', () => {
    expect(() => applyDraftsToLiveSettings()).toThrow(/must not apply paper drafts to LIVE/)
  })

  it('Accept writes the tape recipe onto this run and leaves Live OFF', () => {
    const start = loadSettings()
    expect(start.tapes.btc.through).toBe(40)
    const next = applyAnalystAccept(start, 'btc', { ...GOLD_RECIPES.btc, through: 46, botOn: true, liveOn: true })
    expect(next.tapes.btc.through).toBe(46)
    expect(next.tapes.btc.botOn).toBe(false)
    expect(next.tapes.btc.liveOn).toBe(false)
    expect(next.liveBets).toBe(false)
    expect(loadSettings().tapes.btc.through).toBe(46)
    expect(loadSettings().liveBets).toBe(false)
    expect(GOLD_RECIPES.btc.through).toBe(40)
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
    expect(sit?.proposed).toMatch(/83%/)
  })
})
