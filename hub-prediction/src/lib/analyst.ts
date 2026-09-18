import {
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  askInBand,
  hitPct,
  inArmWindow,
  remainingMinutes,
  tapeLean,
  type HitLatch,
  type TapeId,
  type TapeRecipe,
} from './tapes'
import type { DeskBoard } from './types'

export const PAPER_DRAFTS_KEY = 'hub.desk.analyst.paper.v1'

export type HugNote = 'hug' | 'through' | 'no-print'

export type TapeNote = {
  id: TapeId
  w: number
  l: number
  pct: number
  hug: HugNote
  gap: number | null
  through: number
  lean: 'up' | 'down' | 'sit'
  clockMin: number | null
  inWindow: boolean
  yesAsk: number | null
  noAsk: number | null
  askOk: boolean | null
  proposed: string
}

export type AnalystReport = {
  liveTouched: false
  locked: Record<TapeId, TapeRecipe>
  tapes: TapeNote[]
  summary: string
}

export type PaperDrafts = {
  asOf: number
  notes: string
  recipes: Record<TapeId, TapeRecipe>
}

function recipeLine(id: TapeId, recipe: TapeRecipe) {
  const thru = recipe.through >= 1 ? `$${recipe.through}` : `$${recipe.through}`
  return `${TAPE_META[id].label} ${recipe.armFromMin}–${recipe.armToMin} / ${thru} / ${recipe.centLo}–${recipe.centHi}¢`
}

function hugState(id: TapeId, live: number | null, beat: number, recipe: TapeRecipe): { hug: HugNote; gap: number | null } {
  if (live == null || !Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) {
    return { hug: 'no-print', gap: null }
  }
  const gap = live - beat
  return { hug: Math.abs(gap) < Math.abs(recipe.through) ? 'hug' : 'through', gap }
}

export function analyzeDesk(board: DeskBoard | null, hits: HitLatch): AnalystReport {
  const tapes: TapeNote[] = TAPE_IDS.map((id) => {
    const gold = GOLD_RECIPES[id]
    const quote = board?.tapes[id] ?? null
    const cell = hits.tapes[id]
    const { hug, gap } = hugState(id, quote?.live ?? null, quote?.beat ?? 0, gold)
    const lean = tapeLean({ id, live: quote?.live ?? null, beat: quote?.beat ?? 0, recipe: gold })
    const clockMin = quote?.closeAt ? remainingMinutes(quote.closeAt) : null
    const inWindow = quote?.closeAt ? inArmWindow(gold, quote.closeAt) : false
    const sideAsk = lean === 'down' ? quote?.noAsk : quote?.yesAsk
    const askOk = sideAsk != null && Number.isFinite(sideAsk) ? askInBand(sideAsk, gold) : null
    const lock = `KEEP gold ${recipeLine(id, gold)}`
    let proposed = lock
    if (hug === 'hug') {
      proposed = `${lock} · hug sit (do not cut through)`
    } else if (hug === 'through' && lean !== 'sit') {
      if (inWindow && askOk) proposed = `${lock} · through ${lean.toUpperCase()} in band`
      else if (!inWindow) proposed = `${lock} · clock outside arm — sit`
      else if (askOk === false) proposed = `${lock} · ¢ out of band — sit`
      else proposed = `${lock} · through ${lean.toUpperCase()}`
    } else if (hug === 'no-print') {
      proposed = `${lock} · waiting on live $`
    }
    if (cell.w + cell.l >= 4 && hitPct(cell) < 40) {
      proposed = `${lock} · 24h cold — paper sit, do not chase`
    }
    return {
      id,
      w: cell.w,
      l: cell.l,
      pct: hitPct(cell),
      hug,
      gap,
      through: gold.through,
      lean,
      clockMin,
      inWindow,
      yesAsk: quote?.yesAsk ?? null,
      noAsk: quote?.noAsk ?? null,
      askOk,
      proposed,
    }
  })

  const hugs = tapes.filter((t) => t.hug === 'hug').length
  const summary =
    hugs === 4
      ? 'All four hugging gold through — sit. Live recipes stay locked.'
      : 'Proposed lines are paper notes. Live recipes stay the gold lock unless you Soft KEEP apply later.'

  return {
    liveTouched: false,
    locked: {
      btc: { ...GOLD_RECIPES.btc },
      ng: { ...GOLD_RECIPES.ng },
      cu: { ...GOLD_RECIPES.cu },
      gld: { ...GOLD_RECIPES.gld },
    },
    tapes,
    summary,
  }
}

/** Paper snapshot only. Soft FAIL writing this onto live settings. */
export function makePaperDrafts(report: AnalystReport): PaperDrafts {
  return {
    asOf: Date.now(),
    notes: report.tapes.map((t) => t.proposed).join(' · '),
    recipes: {
      btc: { ...report.locked.btc },
      ng: { ...report.locked.ng },
      cu: { ...report.locked.cu },
      gld: { ...report.locked.gld },
    },
  }
}

export function savePaperDrafts(drafts: PaperDrafts): PaperDrafts {
  if (typeof localStorage === 'undefined') return drafts
  try {
    localStorage.setItem(PAPER_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    /* quota */
  }
  return drafts
}

export function loadPaperDrafts(): PaperDrafts | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PAPER_DRAFTS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as PaperDrafts
    if (!o?.recipes) return null
    return o
  } catch {
    return null
  }
}

/** Hard stop — analyst never copies a draft onto live settings. */
export function applyDraftsToLiveSettings(): never {
  throw new Error('Soft FAIL: analyst must not apply paper drafts to LIVE')
}
