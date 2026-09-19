import {
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  askInBand,
  clampTapeRecipe,
  formatCash,
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
import { deskStorage } from './desk-storage'
import { HIT_FLOOR, isKalshiRecordedBet, isPaperBet, recipeRetuneGate, type FinanceState } from './finance'
import type { DeskBoard } from './types'

export const PAPER_DRAFTS_KEY = 'hub.desk.analyst.paper.v1'
export const ANALYST_DENY_KEY = 'hub.desk.analyst.deny.v1'
export const ANALYST_REHAB_KEY = 'hub.desk.analyst.rehab.v1'
/** More than 2 losses in a row — halt that desk’s live cash. */
export const LOSS_STREAK_HALT = 3
export const REHAB_PAPER_RUNS = 12

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

  if (score.placed >= 4 && score.pct < HIT_FLOOR && score.pnl24 < 0) {
    why.push(`${score.pct}% is under the ${HIT_FLOOR}% goal — sit, do not chase a rewrite`)
    return { next: { ...current }, why }
  }

  if (score.outWindow >= 2 && score.pnl24 > 0 && score.outWindow >= score.inWindow && score.pct >= HIT_FLOOR) {
    armFromMin = Math.min(14, current.armFromMin + 1)
    why.push(`${score.outWindow} fills sat outside the arm and the tape is at ${score.pct}% — widen one minute`)
  } else if (score.outWindow >= 2 && score.pnl24 < 0) {
    armFromMin = Math.max(gold.armFromMin, current.armFromMin - 1)
    why.push(`${score.outWindow} off-window fills lost — pull the arm back toward gold`)
  }

  if (score.outBand >= 2 && score.pct < HIT_FLOOR) {
    if (id === 'btc') {
      why.push(`${score.outBand} ¢-band misses — keep BTC 69–89, do not open 56–68`)
    } else {
      centLo = Math.max(id === 'gld' ? 34 : 28, current.centLo - 4)
      why.push(`${score.outBand} ¢-band misses under ${HIT_FLOOR}% — sit more ¢, do not chase`)
    }
  }

  const d24 = path.hours24.delta
  const d48 = path.hours48.delta
  if (hug === 'through' && score.pct >= HIT_FLOOR && score.placed >= 3) {
    through = stepThrough(gold, current.through, -1)
    why.push(`${score.pct}% is at the ${HIT_FLOOR}% goal — small through trim`)
  } else if (score.placed >= 3 && score.pct < HIT_FLOOR && hug !== 'no-print') {
    through = stepThrough(gold, current.through, 1)
    why.push(`${score.pct}% is under the ${HIT_FLOOR}% goal — raise through and sit hugs`)
  } else if (
    score.pct >= HIT_FLOOR &&
    d24 != null &&
    Math.abs(d24) < current.through &&
    path.hours24.minutes >= 30
  ) {
    through = stepThrough(gold, current.through, -1)
    why.push(`24h move vs now is inside through while at ${score.pct}% — small through trim`)
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
    const cell = hits.tapes[id] ?? { w: 0, l: 0 }
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
    if (cell.w + cell.l >= 4 && hitPct(cell) < HIT_FLOOR) {
      proposed = `${lock} · ${hitPct(cell)}% < ${HIT_FLOOR}% goal — sit`
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
      ? `Goal ${HIT_FLOOR}% win ratio. All desks match the book. Rules stay. 3-loss HALT papers the tape — Live cash stays as the user left it.`
      : `Goal ${HIT_FLOOR}% win ratio. ${retunes} desk${retunes === 1 ? '' : 's'} proposed only — Soft FAIL Accept. Soft FAIL auto-write into Live recipes.`

  return {
    liveTouched: false,
    locked: Object.fromEntries(TAPE_IDS.map((id) => [id, { ...GOLD_RECIPES[id] }])) as Record<TapeId, TapeRecipe>,
    tapes,
    summary,
  }
}

/** Paper snapshot only. Soft FAIL writing this onto live cash. */
export function makePaperDrafts(report: AnalystReport): PaperDrafts {
  return {
    asOf: Date.now(),
    notes: report.tapes.map((t) => t.proposed).join(' · '),
    recipes: Object.fromEntries(
      TAPE_IDS.map((id) => [id, { ...(report.tapes.find((t) => t.id === id)?.nextRecipe ?? GOLD_RECIPES[id]) }]),
    ) as Record<TapeId, TapeRecipe>,
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

/** Accept button write — recipe only. Soft FAIL flipping Live cash. Soft FAIL auto-call. */
export function applyAnalystAccept(settings: DeskSettings, id: TapeId, proposed: TapeRecipe): DeskSettings {
  const gold = GOLD_RECIPES[id]
  const next = clampTapeRecipe(id, proposed, gold)
  return patchTape(settings, id, {
    armFromMin: next.armFromMin,
    armToMin: next.armToMin,
    through: next.through,
    centLo: next.centLo,
    centHi: next.centHi,
  })
}

/** Accept + recipeRetuneGate. Soft FAIL auto-retune. Soft FAIL flipping liveOn. */
export function acceptAnalystRecipe(
  settings: DeskSettings,
  id: TapeId,
  proposed: TapeRecipe,
  book: FinanceState,
  now = Date.now(),
): { ok: true; settings: DeskSettings } | { ok: false; reason: string } {
  const gold = GOLD_RECIPES[id]
  const next = clampTapeRecipe(id, proposed, gold)
  const gate = recipeRetuneGate(
    book,
    {
      armFromMin: next.armFromMin,
      armToMin: next.armToMin,
      through: next.through,
      centLo: next.centLo,
      centHi: next.centHi,
    },
    now,
  )
  if (!gate.ok) return gate
  return { ok: true, settings: applyAnalystAccept(settings, id, proposed) }
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

export function typicalAskCents(recipe: TapeRecipe) {
  return Math.round((recipe.centLo + recipe.centHi) / 2)
}

/** Expected $ per take at a win-ratio. 72¢ / 80% ≈ +$0.08. */
export function expectedTakeDollars(askCents: number, contracts: number, winPct = HIT_FLOOR) {
  const ask = Math.max(1, Math.min(99, askCents)) / 100
  const n = Math.max(1, contracts)
  const win = (1 - ask) * n
  const loss = ask * n
  const p = Math.max(0, Math.min(100, winPct)) / 100
  return Math.round((p * win - (1 - p) * loss) * 100) / 100
}

export function explainRules(id: TapeId, recipe: TapeRecipe) {
  return {
    arm: `Only send from ${recipe.armFromMin} min down to ${recipe.armToMin} min before close.`,
    through: `Need ${formatLive(id, recipe.through)} through the strike. Hugs sit.`,
    cents: `Ask must be ${recipe.centLo}–${recipe.centHi}¢.`,
    size: `${recipe.contracts} contract${recipe.contracts === 1 ? '' : 's'}. Bot ${recipe.botOn ? 'ON' : 'OFF'}. Live cash ${recipe.liveOn ? 'ON' : 'OFF'}.`,
  }
}

export function clockCall(id: TapeId, t: TapeNote) {
  if (t.hug === 'no-print') return 'This clock: no live print yet — sitting.'
  const gap = t.gap == null ? '—' : formatLive(id, Math.abs(t.gap))
  const thru = formatLive(id, t.through)
  const min = t.clockMin != null ? `${t.clockMin.toFixed(1)} min left` : 'clock unknown'
  const asks = t.yesAsk != null ? `UP ${t.yesAsk}¢ / DOWN ${t.noAsk}¢` : 'asks —'
  if (t.hug === 'hug') return `This clock: hug ${gap} inside ${thru} · ${min} · ${asks}. Sit — do not pay a hug.`
  if (!t.inWindow) return `This clock: through ${gap} vs ${thru} · ${min} · ${asks}. Outside the arm — sit.`
  if (t.askOk === false) return `This clock: through ${gap} · ${min} · ${asks}. Ask out of band — sit.`
  return `This clock: through ${gap} vs ${thru} · ${min} · ${asks}. Clean take if the bot is on.`
}

export function proposalCopy(t: TapeNote) {
  if (!t.changed) {
    return {
      title: 'Keep the current rules',
      lines: [
        `Arm stays ${t.currentRecipe.armFromMin}–${t.currentRecipe.armToMin} min.`,
        `Through stays ${formatLive(t.id, t.currentRecipe.through)}.`,
        `Ask band stays ${t.currentRecipe.centLo}–${t.currentRecipe.centHi}¢.`,
      ],
    }
  }
  const lines: string[] = []
  if (t.nextRecipe.armFromMin !== t.currentRecipe.armFromMin || t.nextRecipe.armToMin !== t.currentRecipe.armToMin) {
    lines.push(
      `Arm ${t.currentRecipe.armFromMin}–${t.currentRecipe.armToMin} → ${t.nextRecipe.armFromMin}–${t.nextRecipe.armToMin} min`,
    )
  }
  if (t.nextRecipe.through !== t.currentRecipe.through) {
    lines.push(`Through ${formatLive(t.id, t.currentRecipe.through)} → ${formatLive(t.id, t.nextRecipe.through)}`)
  }
  if (t.nextRecipe.centLo !== t.currentRecipe.centLo || t.nextRecipe.centHi !== t.currentRecipe.centHi) {
    lines.push(`Ask ${t.currentRecipe.centLo}–${t.currentRecipe.centHi}¢ → ${t.nextRecipe.centLo}–${t.nextRecipe.centHi}¢`)
  }
  return { title: 'Change these rules on this run', lines }
}

export function profitImpact(t: TapeNote, askCents?: number | null) {
  const inBand = askCents != null && askCents >= t.currentRecipe.centLo && askCents <= t.currentRecipe.centHi
  const ask = inBand ? Number(askCents) : typicalAskCents(t.currentRecipe)
  const ev = expectedTakeDollars(ask, t.currentRecipe.contracts, HIT_FLOOR)
  const miss = Math.round((ask / 100) * t.currentRecipe.contracts * 100) / 100
  const evLabel = formatPnl(ev)
  const missLabel = formatCash(miss)
  if (t.w + t.l >= 4 && t.pct < HIT_FLOOR) {
    return {
      headline: `Sitting saves about ${missLabel} this clock`,
      detail: `Hit rate is ${t.pct}%, under the ${HIT_FLOOR}% goal. Another ${ask}¢ take that loses costs about ${missLabel}. Dollars go up by not sending until the book is back at ${HIT_FLOOR}%. Live is not flipped here.`,
      tone: 'up' as const,
      ev,
    }
  }
  if (!t.changed) {
    return {
      headline: `${evLabel} expected per ${ask}¢ take at ${HIT_FLOOR}%`,
      detail: `Keep these rules. At ${HIT_FLOOR}% a ${ask}¢ contract is about ${evLabel}. Sitting a hug keeps ${missLabel} in cash instead of a miss. That is how the desk grows dollars. Live is not flipped here.`,
      tone: ev >= 0 ? ('up' as const) : ('down' as const),
      ev,
    }
  }
  if (t.nextRecipe.through > t.currentRecipe.through) {
    return {
      headline: `Skipping hugs saves about ${missLabel} per miss`,
      detail: `Higher through means fewer hug sends. Each avoided miss keeps about ${missLabel}. At ${HIT_FLOOR}% a clean ${ask}¢ take is still about ${evLabel}. The retune writes this tape only — Live cash is not flipped.`,
      tone: 'up' as const,
      ev,
    }
  }
  if (t.nextRecipe.through < t.currentRecipe.through) {
    return {
      headline: `One extra clean take is about ${evLabel}`,
      detail: `Lower through takes clocks that now sit. Only if it is a real through. At ${HIT_FLOOR}% that extra ${ask}¢ contract is about ${evLabel}. A hug still costs about ${missLabel}. Live is not flipped here.`,
      tone: ev >= 0 ? ('up' as const) : ('down' as const),
      ev,
    }
  }
  return {
    headline: `${evLabel} expected per ${ask}¢ take at ${HIT_FLOOR}%`,
    detail: `The retune aims more sends at the ${HIT_FLOOR}% path. At ${ask}¢ that is about ${evLabel} per clean take. The desk writes the recipe on this tape only.`,
    tone: ev >= 0 ? ('up' as const) : ('down' as const),
    ev,
  }
}

export type AutoBet = {
  betId?: string
  tape: TapeId
  status: 'open' | 'settled'
  pnl: number | null
  filledAt?: number
  settledAt?: number | null
  closeAt?: number
  kind?: unknown
  orderId?: unknown
}

export type TapeRehab = {
  id: TapeId
  status: 'paper' | 'restored'
  haltedAt: number
  liveWasOn: boolean
  paperTarget: number
  fromMs: number
  appliedToken: string
  restoredAt?: number
}

export type AnalystAutoStamp = {
  token: string
  betSig: string
}

export type AnalystAutoState = {
  tapes: Partial<Record<TapeId, TapeRehab>>
  lastAuto: Partial<Record<TapeId, AnalystAutoStamp>>
}

export function emptyAutoState(): AnalystAutoState {
  return { tapes: {}, lastAuto: {} }
}

function betTime(b: AutoBet) {
  return Number(b.settledAt) || Number(b.closeAt) || Number(b.filledAt) || 0
}

export function tapeBetSig(bets: AutoBet[], id: TapeId) {
  const mine = bets.filter((b) => b.tape === id)
  const last = mine.slice().sort((a, b) => betTime(b) - betTime(a))[0]
  return `${mine.length}:${last?.betId ?? ''}:${last?.status ?? ''}:${last?.pnl ?? ''}`
}

export function consecutiveLosses(bets: AutoBet[], id: TapeId, fromMs = 0) {
  const mine = bets
    .filter((b) => b.tape === id && b.status === 'settled' && b.pnl != null && betTime(b) >= fromMs)
    .sort((a, b) => betTime(b) - betTime(a))
  let n = 0
  for (const b of mine) {
    if ((b.pnl ?? 0) < 0) n += 1
    else break
  }
  return n
}

export function paperRehabStats(bets: AutoBet[], id: TapeId, fromMs: number) {
  const mine = bets.filter(
    (b) => b.tape === id && isPaperBet(b) && b.status === 'settled' && b.pnl != null && betTime(b) >= fromMs,
  )
  const w = mine.filter((b) => (b.pnl ?? 0) > 0).length
  const l = mine.filter((b) => (b.pnl ?? 0) < 0).length
  const n = w + l
  return { w, l, n, pct: n ? Math.round((w / n) * 100) : 0 }
}

export function hydrateAutoState(raw: unknown): AnalystAutoState {
  const base = emptyAutoState()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<AnalystAutoState>
  const tapes: AnalystAutoState['tapes'] = {}
  for (const id of TAPE_IDS) {
    const cell = o.tapes?.[id]
    if (!cell || (cell.status !== 'paper' && cell.status !== 'restored')) continue
    tapes[id] = {
      id,
      status: cell.status,
      haltedAt: Number(cell.haltedAt) || 0,
      liveWasOn: cell.liveWasOn === true,
      paperTarget: Number(cell.paperTarget) || REHAB_PAPER_RUNS,
      fromMs: Number(cell.fromMs) || 0,
      appliedToken: typeof cell.appliedToken === 'string' ? cell.appliedToken : '',
      restoredAt: Number(cell.restoredAt) || undefined,
    }
  }
  const lastAuto: AnalystAutoState['lastAuto'] = {}
  for (const id of TAPE_IDS) {
    const stamp = o.lastAuto?.[id]
    if (stamp && typeof stamp.token === 'string' && typeof stamp.betSig === 'string') lastAuto[id] = stamp
  }
  return { tapes, lastAuto }
}

export function loadAutoState(): AnalystAutoState {
  const ls = deskStorage()
  if (!ls) return emptyAutoState()
  try {
    const raw = ls.getItem(ANALYST_REHAB_KEY)
    return hydrateAutoState(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyAutoState()
  }
}

export function saveAutoState(state: AnalystAutoState): AnalystAutoState {
  const next = hydrateAutoState(state)
  const ls = deskStorage()
  if (!ls) return next
  try {
    ls.setItem(ANALYST_REHAB_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function isRehabPaper(state: AnalystAutoState, id: TapeId) {
  return state.tapes[id]?.status === 'paper'
}

function sameAuto(a: AnalystAutoState, b: AnalystAutoState) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function startRehab(id: TapeId, liveWasOn: boolean, token: string, now: number): TapeRehab {
  return {
    id,
    status: 'paper',
    haltedAt: now,
    liveWasOn,
    paperTarget: REHAB_PAPER_RUNS,
    fromMs: now,
    appliedToken: token,
  }
}

export function runAutoAnalyst(opts: {
  settings: DeskSettings
  report: AnalystReport
  bets: AutoBet[]
  rehab: AnalystAutoState
  killed?: boolean
  now?: number
}): { settings: DeskSettings; rehab: AnalystAutoState; msg: string; didChange: boolean } {
  const now = opts.now ?? Date.now()
  let settings = opts.settings
  let rehab = hydrateAutoState(opts.rehab)
  const notes: string[] = []
  if (opts.killed) return { settings, rehab, msg: '', didChange: false }

  for (const note of opts.report.tapes) {
    const id = note.id
    const streak = consecutiveLosses(opts.bets.filter((b) => isKalshiRecordedBet(b)), id)
    const active = rehab.tapes[id]?.status === 'paper' ? rehab.tapes[id]! : null
    const sig = tapeBetSig(opts.bets, id)

    if (!active && streak >= LOSS_STREAK_HALT) {
      const liveWasOn = settings.tapes[id].liveOn === true
      if (note.changed) {
        rehab = {
          ...rehab,
          lastAuto: { ...rehab.lastAuto, [id]: { token: note.token, betSig: sig } },
        }
      }
      rehab = {
        ...rehab,
        tapes: { ...rehab.tapes, [id]: startRehab(id, liveWasOn, note.token, now) },
      }
      notes.push(
        `${TAPE_META[id].label} live cash HALT — ${streak} losses. Paper ${REHAB_PAPER_RUNS} then ${HIT_FLOOR}%. Live cash stays as you left it.`,
      )
      continue
    }

    if (active) {
      const paperStreak = consecutiveLosses(
        opts.bets.filter((b) => isPaperBet(b)),
        id,
        active.fromMs,
      )
      if (paperStreak >= LOSS_STREAK_HALT) {
        if (note.changed) {
          rehab = {
            ...rehab,
            lastAuto: { ...rehab.lastAuto, [id]: { token: note.token, betSig: sig } },
          }
        }
        rehab = {
          ...rehab,
          tapes: { ...rehab.tapes, [id]: startRehab(id, active.liveWasOn, note.token, now) },
        }
        notes.push(`${TAPE_META[id].label} paper streak ${paperStreak} — restart ${REHAB_PAPER_RUNS}`)
        continue
      }
      const paper = paperRehabStats(opts.bets, id, active.fromMs)
      if (paper.n >= active.paperTarget && paper.pct >= HIT_FLOOR) {
        rehab = {
          ...rehab,
          tapes: {
            ...rehab.tapes,
            [id]: { ...active, status: 'restored', restoredAt: now },
          },
        }
        notes.push(
          `${TAPE_META[id].label} paper ${paper.pct}% on ${paper.n} — rehab clear. Live cash stays as you left it.`,
        )
        continue
      }
    }

    if (note.changed && rehab.lastAuto[id]?.betSig !== sig) {
      rehab = {
        ...rehab,
        lastAuto: { ...rehab.lastAuto, [id]: { token: note.token, betSig: sig } },
      }
      notes.push(`${TAPE_META[id].label} proposed rules only — Soft FAIL Accept. Live recipe unchanged.`)
    }
  }

  rehab = saveAutoState(rehab)
  const didChange = settings !== opts.settings || !sameAuto(rehab, hydrateAutoState(opts.rehab))
  return { settings, rehab, msg: notes.join(' · '), didChange }
}

export function rehabCopy(state: AnalystAutoState, id: TapeId, bets: AutoBet[] = []) {
  const cell = state.tapes[id]
  if (!cell) return ''
  if (cell.status === 'restored') {
    return `Rehab clear. Live cash stays as you left it after ${cell.paperTarget} paper runs at ${HIT_FLOOR}%.`
  }
  const paper = paperRehabStats(bets, id, cell.fromMs)
  return `Live cash halted. Paper ${paper.n}/${cell.paperTarget} · ${paper.w}W–${paper.l}L · ${paper.n ? `${paper.pct}%` : '—'}. Back on at ${HIT_FLOOR}% after ${cell.paperTarget} consistent runs.`
}
