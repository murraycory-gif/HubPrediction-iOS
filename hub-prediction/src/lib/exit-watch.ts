/** EXIT WATCH — paper cash-out after a real fill. Soft FAIL Live auto-sell until PASS. */

import { deskStorage } from './desk-storage'
import { kalshiTakerFeeDollars } from './finance'
import { ticketCost } from './size-cash'
import { isRealOrderId, TAPE_META, type TapeId } from './tapes'

/** Soft FAIL Kalshi sell until Cory/CoS Soft KEEP PASS. */
export const EXIT_WATCH_LIVE = false
export const EXIT_KEY = 'hub.desk.exit.v1'
export const EXIT_MIN_POINTS = 3
export const EXIT_MIN_SPAN_MS = 8_000
export const EXIT_VEL_WINDOW_MS = 90_000

export type ExitWatchAction = 'exit' | 'hold'

export type ExitWatchInput = {
  tape: TapeId
  ticker: string
  orderId: string
  side: 'up' | 'down'
  contracts: number
  entryAsk: number
  beat: number
  live: number
  closeAt: number
  points?: { t: number; px: number }[]
  yesAsk: number
  noAsk: number
  fillCount: number
  now?: number
}

export type ExitWatchDecision = {
  tape: TapeId
  ticker: string
  orderId: string
  action: ExitWatchAction
  why: string
  locked: number
  bidCents: number
  dist: number
  vel: number
  etaMs: number | null
  crosses: boolean
  alreadyThrough: boolean
  firstTick: boolean
  paper: true
  liveSell: false
}

export type ExitWatchLog = {
  tape: TapeId
  ticker: string
  orderId: string
  action: ExitWatchAction
  why: string
  locked: number
  at: number
  paper: true
  liveSell: false
}

export function exitNoiseFloor(id: TapeId) {
  if (id === 'btc') return 2
  if (id === 'gld' || id === 'slv') return 0.15
  if (id === 'wti') return 0.04
  return 0.0008
}

/** Distance from NOW to TO BEAT. Positive = still on the winning side of the fill. */
export function distanceToBeat(side: 'up' | 'down', live: number, beat: number) {
  if (!Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) return 0
  return side === 'down' ? beat - live : live - beat
}

/** Recent velocity toward the beat, px / minute. Soft FAIL one-tick dips. */
export function velocityTowardBeat(
  id: TapeId,
  side: 'up' | 'down',
  points: { t: number; px: number }[] | undefined,
  now = Date.now(),
) {
  const from = now - EXIT_VEL_WINDOW_MS
  const rows = (points ?? [])
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.px) && p.px > 0 && p.t >= from && p.t <= now + 1500)
    .sort((a, b) => a.t - b.t)
  if (rows.length < EXIT_MIN_POINTS) {
    return { vel: 0, spanMs: 0, delta: 0, firstTick: true, points: rows.length }
  }
  const a = rows[0]
  const b = rows[rows.length - 1]
  const spanMs = b.t - a.t
  const delta = b.px - a.px
  if (spanMs < EXIT_MIN_SPAN_MS) {
    return { vel: 0, spanMs, delta, firstTick: true, points: rows.length }
  }
  if (Math.abs(delta) < exitNoiseFloor(id)) {
    return { vel: 0, spanMs, delta, firstTick: true, points: rows.length }
  }
  const toward = side === 'up' ? -delta : delta
  const vel = toward / (spanMs / 60_000)
  return { vel, spanMs, delta, firstTick: false, points: rows.length }
}

/** Best bid ¢ for the contract we hold. Soft FAIL selling the ask. */
export function contractBidCents(side: 'up' | 'down', yesAsk: number, noAsk: number) {
  if (side === 'up') {
    const fromNo = 100 - Number(noAsk)
    const bid = Number.isFinite(fromNo) && fromNo > 0 ? fromNo : Number(yesAsk) - 1
    if (!Number.isFinite(bid) || bid <= 0) return 0
    return Math.max(1, Math.min(99, Math.round(bid)))
  }
  const fromYes = 100 - Number(yesAsk)
  const bid = Number.isFinite(fromYes) && fromYes > 0 ? fromYes : Number(noAsk) - 1
  if (!Number.isFinite(bid) || bid <= 0) return 0
  return Math.max(1, Math.min(99, Math.round(bid)))
}

/** After-fee $ if we sell now at bid. */
export function exitLockedDollars(opts: { count: number; entryAsk: number; bidCents: number }) {
  const n = Math.max(1, Math.round(opts.count))
  const spent = ticketCost(n, opts.entryAsk)
  const entryFee = kalshiTakerFeeDollars(opts.entryAsk, n)
  const proceeds = ticketCost(n, opts.bidCents)
  const exitFee = kalshiTakerFeeDollars(opts.bidCents, n)
  return Math.round((proceeds - exitFee - spent - entryFee) * 100) / 100
}

export function projectedCrossesBeat(opts: {
  dist: number
  vel: number
  closeAt: number
  now?: number
}) {
  const now = opts.now ?? Date.now()
  const left = Number(opts.closeAt) - now
  if (!(opts.dist > 0) || !(opts.vel > 0) || !(left > 0)) {
    return { crosses: false, etaMs: null as number | null }
  }
  const etaMs = (opts.dist / opts.vel) * 60_000
  return { crosses: etaMs > 0 && etaMs < left, etaMs }
}

export function decideExitWatch(input: ExitWatchInput): ExitWatchDecision {
  const now = input.now ?? Date.now()
  const label = TAPE_META[input.tape]?.label ?? input.tape.toUpperCase()
  const base = {
    tape: input.tape,
    ticker: input.ticker,
    orderId: input.orderId,
    paper: true as const,
    liveSell: false as const,
  }
  const hold = (why: string, extra: Partial<ExitWatchDecision> = {}): ExitWatchDecision => ({
    ...base,
    action: 'hold',
    why,
    locked: extra.locked ?? 0,
    bidCents: extra.bidCents ?? 0,
    dist: extra.dist ?? 0,
    vel: extra.vel ?? 0,
    etaMs: extra.etaMs ?? null,
    crosses: extra.crosses ?? false,
    alreadyThrough: extra.alreadyThrough ?? false,
    firstTick: extra.firstTick ?? false,
  })

  if (!(input.fillCount > 0) || !isRealOrderId(input.orderId)) {
    return hold('Soft FAIL EXIT — need fill_count > 0 and a real order id')
  }
  const dist = distanceToBeat(input.side, input.live, input.beat)
  const motion = velocityTowardBeat(input.tape, input.side, input.points, now)
  const bidCents = contractBidCents(input.side, input.yesAsk, input.noAsk)
  const locked = bidCents > 0 ? exitLockedDollars({ count: input.contracts, entryAsk: input.entryAsk, bidCents }) : 0
  const through = dist <= 0
  const path = projectedCrossesBeat({ dist, vel: motion.vel, closeAt: input.closeAt, now })

  if (through) {
    return hold(`${label} already through beat — Soft FAIL late sell. Hold to settle.`, {
      locked,
      bidCents,
      dist,
      vel: motion.vel,
      etaMs: path.etaMs,
      alreadyThrough: true,
      firstTick: motion.firstTick,
    })
  }
  if (motion.firstTick) {
    return hold(`${label} Soft FAIL first down tick — need a path, not one print.`, {
      locked,
      bidCents,
      dist,
      vel: motion.vel,
      firstTick: true,
    })
  }
  if (!path.crosses) {
    return hold(`${label} hold to settle — path Soft FAIL beat before close.`, {
      locked,
      bidCents,
      dist,
      vel: motion.vel,
      etaMs: path.etaMs,
      crosses: false,
    })
  }
  const why =
    locked > 0
      ? `${label} EXIT paper — fade crosses beat. Profit lock ${locked >= 0 ? '+' : ''}$${Math.abs(locked).toFixed(2)}. Live Soft FAIL.`
      : `${label} EXIT paper — fade crosses beat. Max salvage ${locked >= 0 ? '+' : ''}$${Math.abs(locked).toFixed(2)}. Live Soft FAIL.`
  return {
    ...base,
    action: 'exit',
    why,
    locked,
    bidCents,
    dist,
    vel: motion.vel,
    etaMs: path.etaMs,
    crosses: true,
    alreadyThrough: false,
    firstTick: false,
  }
}

export function emptyExitLogs(): ExitWatchLog[] {
  return []
}

export function hydrateExitLogs(raw: unknown): ExitWatchLog[] {
  if (!Array.isArray(raw)) return []
  const out: ExitWatchLog[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as ExitWatchLog
    if (!isRealOrderId(r.orderId)) continue
    if (r.action !== 'exit' && r.action !== 'hold') continue
    out.push({
      tape: r.tape,
      ticker: String(r.ticker ?? ''),
      orderId: r.orderId,
      action: r.action,
      why: String(r.why ?? ''),
      locked: Number(r.locked) || 0,
      at: Number(r.at) || Date.now(),
      paper: true,
      liveSell: false,
    })
  }
  return out.slice(-24)
}

export function loadExitLogs(): ExitWatchLog[] {
  const ls = deskStorage()
  if (!ls) return []
  try {
    return hydrateExitLogs(JSON.parse(ls.getItem(EXIT_KEY) || 'null'))
  } catch {
    return []
  }
}

export function saveExitLogs(logs: ExitWatchLog[]) {
  const next = hydrateExitLogs(logs)
  const ls = deskStorage()
  if (ls) {
    try {
      ls.setItem(EXIT_KEY, JSON.stringify(next))
    } catch {
      /* quota */
    }
  }
  return next
}

/** Latch one EXIT per real order id. Soft FAIL ghost sell rows. Soft FAIL Live POST. */
export function applyExitDecision(logs: ExitWatchLog[], decision: ExitWatchDecision, now = Date.now()) {
  if (decision.liveSell) return logs
  if (decision.action === 'exit' && !isRealOrderId(decision.orderId)) return logs
  const prevExit = logs.find((l) => l.orderId === decision.orderId && l.action === 'exit')
  if (prevExit) return logs
  if (decision.action === 'hold') {
    const prev = logs.filter((l) => l.orderId === decision.orderId).sort((a, b) => b.at - a.at)[0]
    if (prev && prev.action === 'hold' && prev.why === decision.why) return logs
  }
  const row: ExitWatchLog = {
    tape: decision.tape,
    ticker: decision.ticker,
    orderId: decision.orderId,
    action: decision.action,
    why: decision.why,
    locked: decision.locked,
    at: now,
    paper: true,
    liveSell: false,
  }
  const rest = logs.filter((l) => !(l.orderId === decision.orderId && l.action === decision.action))
  return saveExitLogs([...rest, row].slice(-24))
}

export function latestExitFor(logs: ExitWatchLog[], tape: TapeId) {
  return logs.filter((l) => l.tape === tape).sort((a, b) => b.at - a.at)[0] ?? null
}

export function formatExitLocked(locked: number) {
  const n = Number(locked)
  if (!Number.isFinite(n)) return '$0.00'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}$${Math.abs(n).toFixed(2)}`
}
