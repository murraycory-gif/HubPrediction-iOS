/** Desk Chief — paper-first allocator. Soft FAIL Live ON / recipe rewrite / chatter. */

import { deskStorage } from './desk-storage'
import { pushHostDesk } from './desk-persist'
import {
  ASK_CAP,
  DAILY_PROFIT_LOCK,
  HIT_FLOOR,
  MAX_LIVE_CLOCKS,
  livePairGate,
  dailyProfitLockHit,
  deskDailyRealizedPnl,
  feeAwareEv,
  isDeskLiveBet,
  isLiveBet,
  isPaperBet,
  liveCashFloor,
  openLiveClockTapes,
  paper48hPassed,
  readTestLiveArm,
  type BookedBet,
  type FinanceState,
  type Gate,
} from './finance'
import { tapeSessionHours } from './tape-hours'
import type { TapeIntel } from './desk-brief'
import {
  DEFAULT_CLOCK,
  GOLD_RECIPES,
  TAPE_IDS,
  TAPE_META,
  tapeAllowsLive,
  clampContracts,
  hydrateClock,
  type DeskSettings,
  type TapeClock,
  type TapeId,
  type TapeRecipe,
} from './tapes'

export const CHIEF_KEY = 'hub.desk.chief.v1'
export const RESERVE_CASH = 0.6
export const RESERVE_RISK = 0.4
export { MAX_LIVE_CLOCKS, DAILY_PROFIT_LOCK, feeAwareEv, dailyProfitLockHit, livePairGate } from './finance'
export const STEP_UP_WINS = 3
export const STEP_UP_ADD = 1
export const STEP_UP_ADD_MAX = 2
export const CUT_LOSSES = 2
export const CUT_FRAC = 0.5
export const CHIEF_PAPER_KEEP_MS = 48 * 60 * 60 * 1000

export type ChiefKind = 'paper-size' | 'live-size' | 'clock' | 'live-arm' | 'block'

export type ChiefProposal = {
  id: string
  tape: TapeId
  kind: ChiefKind
  fromContracts: number
  toContracts: number
  clock?: TapeClock
  apply: 'auto' | 'draft' | 'block'
  reason: string
  createdAt: number
  status: 'pending' | 'accepted' | 'rejected' | 'applied' | 'blocked'
}

export type ChiefAction = {
  id: string
  at: number
  tape?: TapeId
  text: string
}

export type ChiefTapeProgress = {
  tape: TapeId
  botOn: boolean
  liveOn: boolean
  contracts: number
  sleeveUsd: number
  hitPct: number
  w: number
  l: number
  openRisk: number
  pnl: number
  stale: boolean
  halt: boolean
  closed: boolean
  tradingActive: boolean
  clock: TapeClock
}

export type ChiefState = {
  asOf: number
  lastRunAt: number
  sleeves: Record<TapeId, { contracts: number; sleeveUsd: number }>
  progress: Record<TapeId, ChiefTapeProgress>
  proposals: ChiefProposal[]
  actions: ChiefAction[]
  dailyPnl: number
  lockIn: boolean
  cash: number | null
  cashFloor: number
}

export type ChiefQuote = {
  tradingActive?: boolean
  stale?: boolean
  yesAsk?: number
  noAsk?: number
}

export type ChiefRunInput = {
  settings: DeskSettings
  book: FinanceState
  cash: number | null
  deposits: number | null
  quotes?: Partial<Record<TapeId, ChiefQuote | null>>
  halt?: Partial<Record<TapeId, boolean>>
  typicalAsk?: Partial<Record<TapeId, number>>
  intel?: Partial<Record<TapeId, TapeIntel>>
  now?: number
  prev?: ChiefState | null
}

export type ChiefPaperApply = {
  tape: TapeId
  contracts: number
  clock?: TapeClock
}

export type ChiefResult = {
  state: ChiefState
  paperApplies: ChiefPaperApply[]
  liveOnWrites: Partial<Record<TapeId, boolean>>
}

function money(n: number) {
  return Math.round(n * 100) / 100
}


export function liveHeatTapes(
  settings: DeskSettings,
  book: FinanceState,
  quotes?: Partial<Record<TapeId, ChiefQuote | null>>,
) {
  const heat = new Set<TapeId>(openLiveClockTapes(book))
  for (const id of TAPE_IDS) {
    if (settings.tapes[id].liveOn !== true) continue
    const q = quotes?.[id]
    if (q?.tradingActive === true) heat.add(id)
  }
  return [...heat]
}

export function tapeLiveArmGate(id: TapeId, quote?: ChiefQuote | null, now = Date.now()): Gate {
  const test = readTestLiveArm()
  if (test) return test
  if (!tapeAllowsLive(id)) {
    return { ok: false, reason: `${TAPE_META[id].label} paper desk — Live cash stays off` }
  }
  const session = tapeSessionHours(id, now)
  const closed = quote?.tradingActive === false
  const stale = quote?.stale === true || closed
  if (id === 'gld' && (stale || closed || quote?.tradingActive !== true)) {
    return { ok: false, reason: 'GLD STALE — Live cash stays off' }
  }
  if (stale || closed) {
    return { ok: false, reason: `${TAPE_META[id].label} STALE/CLOSED — Live cash stays off` }
  }
  if (!session.open && quote?.tradingActive !== true) {
    return { ok: false, reason: `${TAPE_META[id].label} hours closed — Live cash stays off` }
  }
  return { ok: true }
}

/** Next-open / regime clock. Soft FAIL Live flip. Soft FAIL 5m on a dead tape. */
export function pickChiefClock(
  current: TapeClock,
  snap: Pick<ChiefTapeProgress, 'closed' | 'stale' | 'halt' | 'hitPct' | 'w' | 'l'>,
): TapeClock | null {
  const cur = hydrateClock(current)
  if (snap.closed || snap.stale) return cur === DEFAULT_CLOCK ? null : DEFAULT_CLOCK
  if (snap.halt || (snap.l >= CUT_LOSSES && snap.hitPct < HIT_FLOOR)) {
    return cur === '5m' ? DEFAULT_CLOCK : null
  }
  if (snap.w >= STEP_UP_WINS && snap.hitPct >= HIT_FLOOR && cur === '1h') return DEFAULT_CLOCK
  return null
}

export function readTestTapeQuote(id: TapeId): ChiefQuote | null {
  if (typeof window === 'undefined') return null
  const bag = (window as Window & { __HUB_TEST_TAPE_QUOTE?: Partial<Record<TapeId, ChiefQuote>> }).__HUB_TEST_TAPE_QUOTE
  const q = bag?.[id]
  return q && typeof q === 'object' ? q : null
}

function emptyProgress(id: TapeId, recipe: TapeRecipe, ask: number): ChiefTapeProgress {
  return {
    tape: id,
    botOn: recipe.botOn === true,
    liveOn: recipe.liveOn === true,
    contracts: recipe.contracts,
    sleeveUsd: money(recipe.contracts * (ask / 100)),
    hitPct: 0,
    w: 0,
    l: 0,
    openRisk: 0,
    pnl: 0,
    stale: false,
    halt: false,
    closed: false,
    tradingActive: false,
    clock: DEFAULT_CLOCK,
  }
}

function emptyChief(now = Date.now()): ChiefState {
  const sleeves = {} as ChiefState['sleeves']
  const progress = {} as ChiefState['progress']
  for (const id of TAPE_IDS) {
    const recipe = GOLD_RECIPES[id]
    progress[id] = emptyProgress(id, recipe, 70)
    sleeves[id] = { contracts: recipe.contracts, sleeveUsd: money(recipe.contracts * 0.7) }
  }
  return {
    asOf: now,
    lastRunAt: 0,
    sleeves,
    progress,
    proposals: [],
    actions: [],
    dailyPnl: 0,
    lockIn: false,
    cash: null,
    cashFloor: liveCashFloor(null),
  }
}

function asProposal(raw: unknown): ChiefProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<ChiefProposal>
  if (!o.tape || !TAPE_IDS.includes(o.tape)) return null
  const kind = o.kind
  if (kind !== 'paper-size' && kind !== 'live-size' && kind !== 'clock' && kind !== 'live-arm' && kind !== 'block') {
    return null
  }
  const status = o.status
  if (status !== 'pending' && status !== 'accepted' && status !== 'rejected' && status !== 'applied' && status !== 'blocked') {
    return null
  }
  return {
    id: String(o.id || '').trim() || `chief-${o.tape}-${kind}`,
    tape: o.tape,
    kind,
    fromContracts: clampContracts(Number(o.fromContracts) || 1),
    toContracts: clampContracts(Number(o.toContracts) || 1),
    clock: o.clock,
    apply: o.apply === 'auto' || o.apply === 'block' ? o.apply : 'draft',
    reason: String(o.reason || ''),
    createdAt: Number(o.createdAt) || Date.now(),
    status,
  }
}

export function hydrateChief(raw: unknown, now = Date.now()): ChiefState {
  const base = emptyChief(now)
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<ChiefState>
  const proposals = Array.isArray(o.proposals) ? o.proposals.map(asProposal).filter((p): p is ChiefProposal => !!p) : []
  const actions = Array.isArray(o.actions)
    ? o.actions
        .filter((a): a is ChiefAction => !!a && typeof a === 'object' && typeof a.text === 'string')
        .map((a) => ({
          id: String(a.id || `act-${a.at}`),
          at: Number(a.at) || now,
          tape: a.tape,
          text: a.text,
        }))
    : []
  const sleeves = { ...base.sleeves }
  const progress = { ...base.progress }
  for (const id of TAPE_IDS) {
    const s = o.sleeves?.[id]
    if (s) sleeves[id] = { contracts: clampContracts(Number(s.contracts) || 1), sleeveUsd: money(Number(s.sleeveUsd) || 0) }
    const p = o.progress?.[id]
    if (p) progress[id] = { ...progress[id], ...p, tape: id }
  }
  return {
    asOf: Number(o.asOf) || now,
    lastRunAt: Number(o.lastRunAt) || 0,
    sleeves,
    progress,
    proposals: proposals.slice(-24),
    actions: actions.slice(-24),
    dailyPnl: money(Number(o.dailyPnl) || 0),
    lockIn: o.lockIn === true,
    cash: Number.isFinite(o.cash ?? NaN) ? Number(o.cash) : null,
    cashFloor: money(Number(o.cashFloor) || liveCashFloor(null)),
  }
}

export function mergeChiefState(prev: unknown, incoming: unknown): ChiefState {
  if (incoming == null) return hydrateChief(prev)
  if (prev == null) return hydrateChief(incoming)
  const a = hydrateChief(prev)
  const b = hydrateChief(incoming)
  const winner = (Number(b.asOf) || 0) >= (Number(a.asOf) || 0) ? b : a
  const other = winner === b ? a : b
  const byId = new Map<string, ChiefProposal>()
  for (const p of [...other.proposals, ...winner.proposals]) byId.set(p.id, p)
  const actions = [...other.actions, ...winner.actions]
    .sort((x, y) => x.at - y.at)
    .slice(-24)
  return {
    ...winner,
    proposals: [...byId.values()].sort((x, y) => x.createdAt - y.createdAt).slice(-24),
    actions,
  }
}

export function loadChief(): ChiefState {
  const ls = deskStorage()
  if (!ls) return emptyChief()
  try {
    const raw = ls.getItem(CHIEF_KEY)
    return hydrateChief(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyChief()
  }
}

export function saveChief(state: ChiefState, opts?: { host?: boolean }): ChiefState {
  const next = hydrateChief({ ...state, asOf: Date.now() })
  const ls = deskStorage()
  if (ls) {
    try {
      ls.setItem(CHIEF_KEY, JSON.stringify(next))
    } catch {
      /* quota */
    }
  }
  if (opts?.host !== false) pushHostDesk({ chief: next })
  return next
}

function tapeBets(book: FinanceState, id: TapeId, paper: boolean) {
  return book.bets.filter((b) => b.tape === id && (paper ? isPaperBet(b) : isDeskLiveBet(b) || isLiveBet(b)))
}

function settledWl(bets: BookedBet[]) {
  const settled = bets.filter((b) => b.status === 'settled' && b.pnl != null)
  const w = settled.filter((b) => (b.pnl ?? 0) > 0).length
  const l = settled.filter((b) => (b.pnl ?? 0) < 0).length
  const pnl = money(settled.reduce((s, b) => s + (b.pnl ?? 0), 0))
  const n = w + l
  return { w, l, pnl, pct: n ? Math.round((w / n) * 100) : 0 }
}

function streak(bets: BookedBet[]) {
  const settled = bets
    .filter((b) => b.status === 'settled' && b.pnl != null)
    .sort((a, b) => (Number(b.settledAt) || Number(b.filledAt) || 0) - (Number(a.settledAt) || Number(a.filledAt) || 0))
  let wins = 0
  let losses = 0
  for (const b of settled) {
    const win = (b.pnl ?? 0) > 0
    if (wins === 0 && losses === 0) {
      if (win) wins = 1
      else losses = 1
      continue
    }
    if (wins > 0) {
      if (win) wins += 1
      else break
    } else if (losses > 0) {
      if (!win) losses += 1
      else break
    }
  }
  return { wins, losses }
}

function typicalAskFor(id: TapeId, input: ChiefRunInput) {
  const override = input.typicalAsk?.[id]
  if (Number.isFinite(override ?? NaN)) return Number(override)
  const q = input.quotes?.[id]
  const ask = Number(q?.yesAsk)
  if (Number.isFinite(ask) && ask > 0) return ask
  return Math.min(GOLD_RECIPES[id].centLo + 3, ASK_CAP - 1)
}

function targetContracts(cur: number, snap: ChiefTapeProgress, winStreak: number, lossStreak: number) {
  let next = cur
  if (lossStreak >= CUT_LOSSES) {
    next = Math.max(1, Math.floor(cur * CUT_FRAC))
  } else if (snap.halt || snap.pnl < 0) {
    next = Math.max(1, cur - 1)
  } else if (snap.stale || snap.closed) {
    next = cur
  } else if (winStreak >= STEP_UP_WINS && (snap.hitPct >= HIT_FLOOR || snap.w + snap.l < 4)) {
    const add = winStreak >= STEP_UP_WINS + 2 ? STEP_UP_ADD_MAX : STEP_UP_ADD
    next = cur + add
  }
  if (next > cur + STEP_UP_ADD_MAX) next = cur + STEP_UP_ADD_MAX
  if (cur <= 1 && next >= 20) next = cur + STEP_UP_ADD
  return clampContracts(next)
}

function remember(actions: ChiefAction[], text: string, tape?: TapeId, now = Date.now()): ChiefAction[] {
  const next = [...actions, { id: `act-${now}-${tape || 'desk'}`, at: now, tape, text }]
  return next.slice(-24)
}

function alreadyDid(actions: ChiefAction[], text: string, now: number) {
  return actions.some((a) => a.text === text && now - a.at < 60 * 60_000)
}

export function runDeskChief(input: ChiefRunInput): ChiefResult {
  const now = input.now ?? Date.now()
  const prev = hydrateChief(input.prev ?? loadChief(), now)
  const daily = deskDailyRealizedPnl(input.book, now)
  const lockIn = dailyProfitLockHit(input.book, now)
  const floor = liveCashFloor(input.deposits)
  const heat = liveHeatTapes(input.settings, input.book, input.quotes)
  const paperReady = paper48hPassed(input.book, now)
  const progress = {} as Record<TapeId, ChiefTapeProgress>
  const sleeves = {} as ChiefState['sleeves']
  const paperApplies: ChiefPaperApply[] = []
  let proposals = prev.proposals.filter((p) => p.status === 'pending' || now - p.createdAt < CHIEF_PAPER_KEEP_MS)
  let actions = prev.actions.slice(-24)
  const liveOnWrites: Partial<Record<TapeId, boolean>> = {}

  const riskBudget = money(Math.max(0, daily) * RESERVE_RISK)
  let spentRisk = 0

  for (const id of TAPE_IDS) {
    const recipe = input.settings.tapes[id]
    const ask = typicalAskFor(id, input)
    const q = input.quotes?.[id]
    const session = tapeSessionHours(id, now)
    const closed = q?.tradingActive === false || !session.open
    const stale = q?.stale === true || closed
    const halt = input.halt?.[id] === true
    const liveOn = recipe.liveOn === true
    const currentClock = hydrateClock(input.settings.clocks[id])
    const bets = tapeBets(input.book, id, !liveOn)
    const wl = settledWl(bets)
    const { wins, losses } = streak(bets)
    const openRisk = money(bets.filter((b) => b.status === 'open').reduce((s, b) => s + (Number(b.spent) || 0), 0))
    const snap: ChiefTapeProgress = {
      tape: id,
      botOn: recipe.botOn === true,
      liveOn,
      contracts: recipe.contracts,
      sleeveUsd: money(recipe.contracts * (ask / 100)),
      hitPct: wl.pct,
      w: wl.w,
      l: wl.l,
      openRisk,
      pnl: wl.pnl,
      stale,
      halt,
      closed,
      tradingActive: q?.tradingActive === true,
      clock: currentClock,
    }
    progress[id] = snap
    let want = targetContracts(recipe.contracts, snap, wins, losses)
    if (liveOn) {
      const stepUp = wins >= STEP_UP_WINS && (snap.hitPct >= HIT_FLOOR || snap.w + snap.l < 4)
      const cut = losses >= CUT_LOSSES
      if (!stepUp && !cut) want = recipe.contracts
    } else if (id === 'btc' && input.intel?.btc?.bias === 'fade' && want > recipe.contracts) {
      want = recipe.contracts
    }
    sleeves[id] = { contracts: want, sleeveUsd: money(want * (ask / 100)) }
    const wantClock = pickChiefClock(currentClock, snap)

    if ((snap.closed || snap.stale) && !liveOn) {
      const sit = `${TAPE_META[id].label} sit dead tape — paper pre-arm ${wantClock || currentClock} next open`
      if (!alreadyDid(actions, sit, now)) actions = remember(actions, sit, id, now)
    }
    if (id === 'btc' && input.intel?.btc) {
      const intel = input.intel.btc
      const line = `BTC intel ${intel.bias} — ${intel.hourLine} ${intel.clockLine}`
      if (!alreadyDid(actions, line, now)) actions = remember(actions, line, id, now)
    }

    if (wantClock && wantClock !== currentClock) {
      const clockKey = `clock-${id}-${currentClock}-${wantClock}`
      if (!proposals.some((p) => p.id === clockKey && (p.status === 'applied' || p.status === 'rejected' || p.status === 'pending'))) {
        const clockReason = `${TAPE_META[id].label} clock ${currentClock}→${wantClock}${liveOn ? ' — draft' : ' — paper next open'}`
        if (liveOn) {
          proposals = proposals.concat({
            id: clockKey,
            tape: id,
            kind: 'clock',
            fromContracts: recipe.contracts,
            toContracts: recipe.contracts,
            clock: wantClock,
            apply: 'draft',
            reason: clockReason,
            createdAt: now,
            status: 'pending',
          })
          actions = remember(actions, `draft ${clockReason}`, id, now)
        } else if (!alreadyDid(actions, `applied ${clockReason}`, now)) {
          proposals = proposals.concat({
            id: clockKey,
            tape: id,
            kind: 'clock',
            fromContracts: recipe.contracts,
            toContracts: recipe.contracts,
            clock: wantClock,
            apply: 'auto',
            reason: clockReason,
            createdAt: now,
            status: 'applied',
          })
          paperApplies.push({ tape: id, contracts: recipe.contracts, clock: wantClock })
          actions = remember(actions, `applied ${clockReason}`, id, now)
        }
      }
    }

    if (want === recipe.contracts) continue

    const sizeUp = want > recipe.contracts
    const stepCost = money((want - recipe.contracts) * (ask / 100))

    if (!liveOn) {
      const idKey = `paper-${id}-${recipe.contracts}-${want}`
      if (proposals.some((p) => p.id === idKey && (p.status === 'applied' || p.status === 'rejected'))) continue
      const reason = sizeUp
        ? `${TAPE_META[id].label} paper +${want - recipe.contracts} after ${wins}W · ${HIT_FLOOR}%`
        : `${TAPE_META[id].label} paper cut ${recipe.contracts}→${want}`
      if (alreadyDid(actions, `applied ${reason}`, now)) continue
      const proposal: ChiefProposal = {
        id: idKey,
        tape: id,
        kind: 'paper-size',
        fromContracts: recipe.contracts,
        toContracts: want,
        apply: 'auto',
        reason,
        createdAt: now,
        status: 'applied',
      }
      proposals = proposals.filter((p) => p.id !== idKey).concat(proposal)
      paperApplies.push({ tape: id, contracts: want, clock: wantClock || undefined })
      actions = remember(actions, `applied ${reason}`, id, now)
      continue
    }

    const arm = tapeLiveArmGate(id, q)
    const pair = livePairGate(id, heat)
    const killed = input.book.killed === true
    const blockLiveUp = !sizeUp
      ? ''
      : killed
        ? 'KILL on — Live size-up stays off'
        : Number.isFinite(input.cash ?? NaN) && (input.cash as number) < floor
          ? `Cash ${input.cash} under live floor ${floor} — Live size-up stays off`
          : !arm.ok
            ? arm.reason
            : !pair.ok
              ? pair.reason
              : ''

    if (blockLiveUp) {
      const idKey = `block-live-${id}-${recipe.contracts}-${want}`
      if (!alreadyDid(actions, blockLiveUp, now)) {
        proposals = proposals
          .filter((p) => p.id !== idKey)
          .concat({
            id: idKey,
            tape: id,
            kind: 'block',
            fromContracts: recipe.contracts,
            toContracts: recipe.contracts,
            apply: 'block',
            reason: blockLiveUp,
            createdAt: now,
            status: 'blocked',
          })
        actions = remember(actions, blockLiveUp, id, now)
      }
      sleeves[id] = { contracts: recipe.contracts, sleeveUsd: snap.sleeveUsd }
      continue
    }

    const idKey = `live-${id}-${recipe.contracts}-${want}`
    if (proposals.some((p) => p.id === idKey && (p.status === 'applied' || p.status === 'rejected'))) continue
    const reason = `${TAPE_META[id].label} Live size ${recipe.contracts}→${want}`
    if (alreadyDid(actions, `applied ${reason}`, now)) continue
    proposals = proposals.filter((p) => p.id !== idKey).concat({
      id: idKey,
      tape: id,
      kind: 'live-size',
      fromContracts: recipe.contracts,
      toContracts: want,
      apply: 'auto',
      reason,
      createdAt: now,
      status: 'applied',
    })
    paperApplies.push({ tape: id, contracts: want })
    actions = remember(actions, `applied ${reason}`, id, now)
    if (sizeUp && daily > 0) spentRisk = money(spentRisk + stepCost)
  }

  const gldQ = input.quotes?.gld
  if (input.settings.tapes.gld.liveOn !== true) {
    const gldArm = tapeLiveArmGate('gld', gldQ)
    if (!gldArm.ok) {
      const text = gldArm.reason
      if (!alreadyDid(actions, text, now)) actions = remember(actions, text, 'gld', now)
    }
  }

  const state: ChiefState = {
    asOf: now,
    lastRunAt: now,
    sleeves,
    progress,
    proposals: proposals.slice(-24),
    actions: actions.slice(-24),
    dailyPnl: daily,
    lockIn,
    cash: Number.isFinite(input.cash ?? NaN) ? Number(input.cash) : null,
    cashFloor: floor,
  }

  return { state, paperApplies, liveOnWrites }
}

export function decideChiefProposal(state: ChiefState, id: string, accept: boolean): {
  state: ChiefState
  apply: ChiefPaperApply | null
  liveOn: boolean
} {
  const now = Date.now()
  const next = hydrateChief(state, now)
  const i = next.proposals.findIndex((p) => p.id === id)
  if (i < 0) return { state: next, apply: null, liveOn: false }
  const p = next.proposals[i]
  if (p.kind === 'live-arm') {
    next.proposals[i] = { ...p, status: accept ? 'rejected' : 'rejected' }
    next.actions = remember(next.actions, `${TAPE_META[p.tape].label} Live arm stays a toggle — Chief does not flip Live ON`, p.tape, now)
    return { state: { ...next, asOf: now }, apply: null, liveOn: false }
  }
  if (p.kind === 'block') {
    next.proposals[i] = { ...p, status: 'blocked' }
    return { state: { ...next, asOf: now }, apply: null, liveOn: false }
  }
  if (!accept) {
    next.proposals[i] = { ...p, status: 'rejected' }
    next.actions = remember(next.actions, `rejected ${p.reason}`, p.tape, now)
    return { state: { ...next, asOf: now }, apply: null, liveOn: false }
  }
  if (p.kind === 'live-size') {
    next.proposals[i] = { ...p, status: 'accepted' }
    next.actions = remember(next.actions, `accepted ${p.reason}`, p.tape, now)
    return { state: { ...next, asOf: now }, apply: { tape: p.tape, contracts: p.toContracts, clock: p.clock }, liveOn: false }
  }
  if (p.kind === 'paper-size' || p.kind === 'clock') {
    next.proposals[i] = { ...p, status: 'accepted' }
    next.actions = remember(next.actions, `accepted ${p.reason}`, p.tape, now)
    return { state: { ...next, asOf: now }, apply: { tape: p.tape, contracts: p.toContracts, clock: p.clock }, liveOn: false }
  }
  return { state: { ...next, asOf: now }, apply: null, liveOn: false }
}

export function chiefNeverWritesLiveOn(result: ChiefResult) {
  return Object.keys(result.liveOnWrites).length === 0
}
