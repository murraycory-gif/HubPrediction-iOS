import {
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  askInBand,
  clampTapeRecipe,
  formatLive,
  formatPnl,
  hitPct,
  inArmWindow,
  patchTape,
  remainingMinutes,
  tapeLean,
  type DeskSettings,
  type HitLatch,
  type TapeId,
  type TapeRecipe,
} from './tapes'
import type { DeskBoard } from './types'

export const PAPER_DRAFTS_KEY = 'hub.desk.analyst.paper.v1'
export const ANALYST_DENY_KEY = 'hub.desk.analyst.deny.v1'

export type HugNote = 'hug' | 'through' | 'no-print'

export type AnalystBet = {
  tape: TapeId
  side: 'up' | 'down'
  ask: number
  pnl: number | null
  status: 'open' | 'settled'
  filledAt: number
  settledAt?: number | null
  closeAt: number
}

export type PathWindow = {
  delta: number | null
  pct: number | null
  minutes: number
  upMin: number
  downMin: number
}

export type TapePathStats = {
  id: TapeId
  current: number | null
  hours24: PathWindow
  hours48: PathWindow
}

export type StrategyScore = {
  placed: number
  inWindow: number
  outWindow: number
  inBand: number
  outBand: number
  wins: number
  losses: number
  pct: number
  pnl: number
  pnl24: number
  pnl48: number
}

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
  currentRecipe: TapeRecipe
  nextRecipe: TapeRecipe
  changed: boolean
  why: string[]
  score: StrategyScore
  path: TapePathStats
  token: string
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

export type DeskPaths = {
  tapes: Record<TapeId, TapePathStats>
  fetchedAt: number
}

function recipeLine(id: TapeId, recipe: TapeRecipe) {
  return `${TAPE_META[id].label} ${recipe.armFromMin}–${recipe.armToMin} / $${recipe.through} / ${recipe.centLo}–${recipe.centHi}¢`
}

function hugState(id: TapeId, live: number | null, beat: number, recipe: TapeRecipe): { hug: HugNote; gap: number | null } {
  if (live == null || !Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) {
    return { hug: 'no-print', gap: null }
  }
  const gap = live - beat
  return { hug: Math.abs(gap) < Math.abs(recipe.through) ? 'hug' : 'through', gap }
}

export function emptyPathWindow(): PathWindow {
  return { delta: null, pct: null, minutes: 0, upMin: 0, downMin: 0 }
}

export function pathWindowFromPoints(
  points: { t: number; px: number }[] | undefined,
  now: number,
  hours: number,
  current: number | null,
): PathWindow {
  const from = now - hours * 3_600_000
  const slice = (points ?? []).filter((p) => p.t >= from && p.t <= now + 1000 && Number.isFinite(p.px) && p.px > 0)
  if (slice.length < 2 || current == null || !Number.isFinite(current)) return emptyPathWindow()
  const start = slice[0].px
  const delta = Math.round((current - start) * 10000) / 10000
  const byMin = new Map<number, number>()
  for (const p of slice) byMin.set(Math.floor(p.t / 60_000), p.px)
  const keys = [...byMin.keys()].sort((a, b) => a - b)
  let upMin = 0
  let downMin = 0
  for (let i = 1; i < keys.length; i++) {
    const d = (byMin.get(keys[i]) ?? 0) - (byMin.get(keys[i - 1]) ?? 0)
    if (d > 0) upMin += 1
    else if (d < 0) downMin += 1
  }
  return {
    delta,
    pct: start ? Math.round((delta / start) * 100000) / 1000 : null,
    minutes: keys.length,
    upMin,
    downMin,
  }
}

export function summarizeTapePath(
  id: TapeId,
  points: { t: number; px: number }[] | undefined,
  current: number | null,
  now = Date.now(),
): TapePathStats {
  const live = current ?? points?.[points.length - 1]?.px ?? null
  return {
    id,
    current: live,
    hours24: pathWindowFromPoints(points, now, 24, live),
    hours48: pathWindowFromPoints(points, now, 48, live),
  }
}

export function emptyDeskPaths(): DeskPaths {
  const tapes = {} as DeskPaths['tapes']
  for (const id of TAPE_IDS) tapes[id] = summarizeTapePath(id, [], null)
  return { tapes, fetchedAt: 0 }
}

export function scoreBetsVsRecipe(id: TapeId, recipe: TapeRecipe, bets: AnalystBet[], now = Date.now()): StrategyScore {
  const mine = bets.filter((b) => b.tape === id)
  let inWindow = 0
  let outWindow = 0
  let inBand = 0
  let outBand = 0
  let wins = 0
  let losses = 0
  let pnl = 0
  let pnl24 = 0
  let pnl48 = 0
  const from24 = now - 24 * 3_600_000
  const from48 = now - 48 * 3_600_000
  for (const b of mine) {
    const at = b.filledAt || b.settledAt || now
    if (inArmWindow(recipe, b.closeAt, at)) inWindow += 1
    else outWindow += 1
    if (askInBand(b.ask, recipe)) inBand += 1
    else outBand += 1
    const stamp = b.settledAt || b.closeAt || at
    if (b.status === 'settled' && b.pnl != null) {
      pnl += b.pnl
      if (stamp >= from24) pnl24 += b.pnl
      if (stamp >= from48) pnl48 += b.pnl
      if (b.pnl > 0) wins += 1
      else if (b.pnl < 0) losses += 1
    }
  }
  const n = wins + losses
  return {
    placed: mine.length,
    inWindow,
    outWindow,
    inBand,
    outBand,
    wins,
    losses,
    pct: n ? Math.round((wins / n) * 100) : 0,
    pnl: Math.round(pnl * 100) / 100,
    pnl24: Math.round(pnl24 * 100) / 100,
    pnl48: Math.round(pnl48 * 100) / 100,
  }
}

function stepThrough(gold: TapeRecipe, current: number, dir: 1 | -1) {
  const step = gold.through * 0.15
  return current + dir * step
}

function recommendRecipe(
  id: TapeId,
  current: TapeRecipe,
  score: StrategyScore,
  path: TapePathStats,
  hug: HugNote,
): { next: TapeRecipe; why: string[] } {
  const gold = GOLD_RECIPES[id]
  const why: string[] = []
  let armFromMin = current.armFromMin
  let armToMin = current.armToMin
  let through = current.through
  let centLo = current.centLo
  let centHi = current.centHi

  if (score.placed >= 4 && score.pct < 40 && score.pnl24 < 0) {
    why.push('24h cold vs this recipe — sit, do not chase a rewrite')
    return { next: { ...current }, why }
  }

  if (score.outWindow >= 2 && score.pnl24 > 0 && score.outWindow >= score.inWindow) {
    armFromMin = Math.min(14, current.armFromMin + 1)
    why.push(`${score.outWindow} fills sat outside the arm and the tape is still green — widen the window`)
  } else if (score.outWindow >= 2 && score.pnl24 < 0) {
    armFromMin = Math.max(gold.armFromMin, current.armFromMin - 1)
    why.push(`${score.outWindow} off-window fills lost — pull the arm back toward gold`)
  }

  if (score.outBand >= 2 && score.pct < 50) {
    if (id === 'btc') {
      why.push(`${score.outBand} ¢-band misses — keep BTC 69–89, do not open 56–68`)
    } else {
      centLo = Math.max(id === 'gld' ? 34 : 28, current.centLo - 4)
      why.push(`${score.outBand} ¢-band misses — widen the ask band 4¢`)
    }
  }

  const d24 = path.hours24.delta
  const d48 = path.hours48.delta
  if (hug === 'through' && score.pct >= 60 && score.placed >= 3) {
    through = stepThrough(gold, current.through, -1)
    why.push(`through-sends are hitting ${score.pct}% — trim through so the bot can arm earlier`)
  } else if (score.placed >= 3 && score.pct < 50 && hug !== 'no-print') {
    through = stepThrough(gold, current.through, 1)
    why.push(`sends under this through are ${score.pct}% — raise through and sit more hugs`)
  } else if (d24 != null && Math.abs(d24) < current.through && path.hours24.minutes >= 30) {
    through = stepThrough(gold, current.through, -1)
    why.push(`24h move vs now is inside through — the bot is hugging too much`)
  }

  if (d48 != null && d24 != null && Math.sign(d48) === Math.sign(d24) && Math.abs(d48) > current.through) {
    why.push(
      `48h and 24h are both ${d24 > 0 ? 'up' : 'down'} from current — lean with the tape, do not fade`,
    )
  }

  if (!why.length) {
    why.push('Recipe is matching the book. Keep it on this run.')
  }

  const next = clampTapeRecipe(
    id,
    { ...current, armFromMin, armToMin, through, centLo, centHi, botOn: current.botOn, liveOn: current.liveOn },
    gold,
  )
  next.botOn = current.botOn
  next.liveOn = current.liveOn
  next.contracts = current.contracts
  return { next, why }
}

export function recToken(id: TapeId, recipe: TapeRecipe) {
  return `${id}:${recipe.armFromMin}:${recipe.armToMin}:${recipe.through}:${recipe.centLo}:${recipe.centHi}`
}

export function analyzeDesk(
  board: DeskBoard | null,
  hits: HitLatch,
  bets: AnalystBet[] = [],
  recipes?: Partial<Record<TapeId, TapeRecipe>>,
  paths?: DeskPaths | null,
  now = Date.now(),
): AnalystReport {
  const tapes: TapeNote[] = TAPE_IDS.map((id) => {
    const gold = GOLD_RECIPES[id]
    const current = recipes?.[id] ? clampTapeRecipe(id, recipes[id], gold) : { ...gold }
    if (recipes?.[id]) {
      current.botOn = recipes[id]!.botOn === true
      current.liveOn = recipes[id]!.liveOn === true
      current.contracts = recipes[id]!.contracts
    }
    const quote = board?.tapes[id] ?? null
    const cell = hits.tapes[id]
    const { hug, gap } = hugState(id, quote?.live ?? null, quote?.beat ?? 0, current)
    const lean = tapeLean({ id, live: quote?.live ?? null, beat: quote?.beat ?? 0, recipe: current })
    const clockMin = quote?.closeAt ? remainingMinutes(quote.closeAt, now) : null
    const inWindow = quote?.closeAt ? inArmWindow(current, quote.closeAt, now) : false
    const sideAsk = lean === 'down' ? quote?.noAsk : quote?.yesAsk
    const askOk = sideAsk != null && Number.isFinite(sideAsk) ? askInBand(sideAsk, current) : null
    const path =
      paths?.tapes[id] ??
      summarizeTapePath(id, quote?.points, quote?.live ?? null, now)
    const score = scoreBetsVsRecipe(id, current, bets, now)
    const { next, why } = recommendRecipe(id, current, score, path, hug)
    const changed =
      next.armFromMin !== current.armFromMin ||
      next.armToMin !== current.armToMin ||
      next.through !== current.through ||
      next.centLo !== current.centLo ||
      next.centHi !== current.centHi
    const lock = changed ? `RETUNE ${recipeLine(id, next)}` : `KEEP ${recipeLine(id, current)}`
    let proposed = `${lock} · ${why[0]}`
    if (hug === 'hug') proposed += ' · hug sit this clock'
    else if (hug === 'through' && lean !== 'sit') {
      if (inWindow && askOk) proposed += ` · through ${lean.toUpperCase()} in band`
      else if (!inWindow) proposed += ' · clock outside arm — sit'
      else if (askOk === false) proposed += ' · ¢ out of band — sit'
    } else if (hug === 'no-print') proposed += ' · waiting on live $'
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
      through: current.through,
      lean,
      clockMin,
      inWindow,
      yesAsk: quote?.yesAsk ?? null,
      noAsk: quote?.noAsk ?? null,
      askOk,
      proposed,
      currentRecipe: current,
      nextRecipe: next,
      changed,
      why,
      score,
      path,
      token: recToken(id, next),
    }
  })

  const retunes = tapes.filter((t) => t.changed).length
  const summary =
    retunes === 0
      ? 'All four desks match the book. Accept is idle. Live stays OFF unless you arm it.'
      : `${retunes} desk${retunes === 1 ? '' : 's'} have a retune. Accept applies it to this run’s bot. Deny keeps the current recipe. Live is not flipped.`

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

/** Paper snapshot only. Soft FAIL writing this onto live cash. */
export function makePaperDrafts(report: AnalystReport): PaperDrafts {
  return {
    asOf: Date.now(),
    notes: report.tapes.map((t) => t.proposed).join(' · '),
    recipes: {
      btc: { ...report.tapes.find((t) => t.id === 'btc')?.nextRecipe ?? GOLD_RECIPES.btc },
      ng: { ...report.tapes.find((t) => t.id === 'ng')?.nextRecipe ?? GOLD_RECIPES.ng },
      cu: { ...report.tapes.find((t) => t.id === 'cu')?.nextRecipe ?? GOLD_RECIPES.cu },
      gld: { ...report.tapes.find((t) => t.id === 'gld')?.nextRecipe ?? GOLD_RECIPES.gld },
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

function loadDenied(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(ANALYST_DENY_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function denyAnalystRec(token: string) {
  const next = [...new Set([...loadDenied(), token])]
  if (typeof localStorage === 'undefined') return next
  try {
    localStorage.setItem(ANALYST_DENY_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function isDeniedRec(token: string) {
  return loadDenied().includes(token)
}

export function listDeniedRecs() {
  return loadDenied()
}

/** User Accept — recipe only. Soft FAIL flipping Live / live-cash. */
export function applyAnalystAccept(settings: DeskSettings, id: TapeId, proposed: TapeRecipe): DeskSettings {
  const gold = GOLD_RECIPES[id]
  const cur = settings.tapes[id]
  const next = clampTapeRecipe(id, proposed, gold)
  return patchTape(settings, id, {
    armFromMin: next.armFromMin,
    armToMin: next.armToMin,
    through: next.through,
    centLo: next.centLo,
    centHi: next.centHi,
    contracts: cur.contracts,
    botOn: cur.botOn,
    liveOn: cur.liveOn,
  })
}

/** Hard stop — analyst never copies a draft onto live cash / Live ON. */
export function applyDraftsToLiveSettings(): never {
  throw new Error('Soft FAIL: analyst must not apply paper drafts to LIVE')
}

export function formatPathWindow(id: TapeId, w: PathWindow, label: string) {
  if (w.delta == null || w.minutes < 2) return `${label} —`
  const px = formatLive(id, Math.abs(w.delta))
  const sign = w.delta > 0 ? '+' : w.delta < 0 ? '−' : ''
  const pct = w.pct != null ? ` (${sign}${Math.abs(w.pct).toFixed(3)}%)` : ''
  return `${label} ${sign}${px}${pct} · ${w.upMin}↑ ${w.downMin}↓ / ${w.minutes}m`
}

export function formatDeskPnl(score: StrategyScore) {
  return `desk 24h ${formatPnl(score.pnl24)} · 48h ${formatPnl(score.pnl48)} · ${score.inWindow} in-arm / ${score.outWindow} out · ${score.inBand} in-¢ / ${score.outBand} out`
}
