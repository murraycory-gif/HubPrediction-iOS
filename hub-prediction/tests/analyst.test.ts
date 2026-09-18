import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeDesk,
  applyDraftsToLiveSettings,
  loadPaperDrafts,
  makePaperDrafts,
  savePaperDrafts,
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

describe('analyst Soft KEEP gold lock', () => {
  it('starts from exact gold recipes and never marks live touched', () => {
    const report = analyzeDesk(board(), emptyHits())
    expect(report.liveTouched).toBe(false)
    expect(report.locked).toEqual({
      btc: GOLD_RECIPES.btc,
      ng: GOLD_RECIPES.ng,
      cu: GOLD_RECIPES.cu,
      gld: GOLD_RECIPES.gld,
    })
  })

  it('notes hug vs through and keeps the gold next-recipe line', () => {
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
    expect(report.tapes.find((t) => t.id === 'btc')?.proposed).toMatch(/KEEP gold BTC 8–3 \/ \$40/)
    expect(report.tapes.find((t) => t.id === 'gld')?.proposed).toMatch(/KEEP gold GLD 10–3 \/ \$2/)
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

  it('refuses to apply drafts onto live settings', () => {
    expect(() => applyDraftsToLiveSettings()).toThrow(/must not apply paper drafts to LIVE/)
  })
})
