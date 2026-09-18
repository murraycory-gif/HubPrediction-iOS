export const TAPE_IDS = ['btc', 'ng', 'cu', 'gld'] as const
export type TapeId = (typeof TAPE_IDS)[number]

export type TapeRecipe = {
  contracts: number
  botOn: boolean
  liveOn: boolean
  armFromMin: number
  armToMin: number
  through: number
  centLo: number
  centHi: number
}

export type DeskSettings = {
  liveBets: boolean
  tapes: Record<TapeId, TapeRecipe>
}

export const TAPE_META: Record<
  TapeId,
  { id: TapeId; label: string; short: string; series: string; decimals: number; pulseName: string }
> = {
  btc: { id: 'btc', label: 'BTC', short: 'BTC', series: 'KXBTC15M', decimals: 2, pulseName: 'BITCOIN 15 MINUTE' },
  ng: { id: 'ng', label: 'NG', short: 'NG', series: 'KXNATGAS15M', decimals: 5, pulseName: 'NATURAL GAS 15 MINUTE' },
  cu: { id: 'cu', label: 'CU', short: 'CU', series: 'KXCOPPER15M', decimals: 5, pulseName: 'COPPER 15 MINUTE' },
  gld: { id: 'gld', label: 'GLD', short: 'GLD', series: 'KXGOLD15M', decimals: 2, pulseName: 'GOLD 15 MINUTE' },
}

/** Grok Build Soft KEEP recipes — do not retune unless missing. */
export const GOLD_RECIPES: Record<TapeId, TapeRecipe> = {
  btc: { contracts: 1, botOn: false, liveOn: false, armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 },
  ng: { contracts: 1, botOn: false, liveOn: false, armFromMin: 10, armToMin: 8, through: 0.002, centLo: 34, centHi: 89 },
  cu: { contracts: 1, botOn: false, liveOn: false, armFromMin: 10, armToMin: 8, through: 0.002, centLo: 34, centHi: 89 },
  gld: { contracts: 1, botOn: false, liveOn: false, armFromMin: 8, armToMin: 4, through: 3, centLo: 34, centHi: 89 },
}

export const DEFAULT_SETTINGS: DeskSettings = {
  liveBets: false,
  tapes: {
    btc: { ...GOLD_RECIPES.btc },
    ng: { ...GOLD_RECIPES.ng },
    cu: { ...GOLD_RECIPES.cu },
    gld: { ...GOLD_RECIPES.gld },
  },
}

export const SETTINGS_KEY = 'hub.desk.settings.v1'
export const TICKETS_KEY = 'hub.desk.tickets.v1'
export const HITS_KEY = 'hub.desk.hits.v1'
export const CASH_KEY = 'hub.desk.cash.v1'
export const KEY_ID = 'hub.kalshi.keyId'
export const KEY_PEM = 'hub.kalshi.pem'

export function isTapeId(v: string): v is TapeId {
  return (TAPE_IDS as readonly string[]).includes(v)
}

export function clampContracts(n: number) {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(99, Math.round(n)))
}

function recipeFrom(partial: Partial<TapeRecipe> | undefined, gold: TapeRecipe): TapeRecipe {
  return {
    contracts: clampContracts(Number(partial?.contracts ?? gold.contracts)),
    botOn: false,
    liveOn: false,
    armFromMin: Number.isFinite(partial?.armFromMin) ? Number(partial?.armFromMin) : gold.armFromMin,
    armToMin: Number.isFinite(partial?.armToMin) ? Number(partial?.armToMin) : gold.armToMin,
    through: Number.isFinite(partial?.through) ? Number(partial?.through) : gold.through,
    centLo: Number.isFinite(partial?.centLo) ? Number(partial?.centLo) : gold.centLo,
    centHi: Number.isFinite(partial?.centHi) ? Number(partial?.centHi) : gold.centHi,
  }
}

/** Merge stored settings. Soft FAIL Live ON / bots ON by default — those always boot off. */
export function hydrateSettings(raw: unknown): DeskSettings {
  const o = raw && typeof raw === 'object' ? (raw as Partial<DeskSettings> & { tapes?: Partial<Record<TapeId, Partial<TapeRecipe>>> }) : {}
  const tapes = {} as Record<TapeId, TapeRecipe>
  for (const id of TAPE_IDS) {
    const gold = GOLD_RECIPES[id]
    const stored = o.tapes?.[id]
    const next = recipeFrom(stored, gold)
    if (stored) {
      next.botOn = stored.botOn === true
      next.liveOn = stored.liveOn === true
    }
    tapes[id] = next
  }
  return {
    liveBets: o.liveBets === true,
    tapes,
  }
}

export function loadSettings(): DeskSettings {
  if (typeof localStorage === 'undefined') return hydrateSettings(null)
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return hydrateSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return hydrateSettings(null)
  }
}

export function saveSettings(settings: DeskSettings) {
  if (typeof localStorage === 'undefined') return settings
  const next = hydrateSettings(settings)
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function patchTape(settings: DeskSettings, id: TapeId, patch: Partial<TapeRecipe>): DeskSettings {
  return saveSettings({
    ...settings,
    tapes: { ...settings.tapes, [id]: { ...settings.tapes[id], ...patch } },
  })
}

export function setLiveBets(settings: DeskSettings, liveBets: boolean): DeskSettings {
  return saveSettings({ ...settings, liveBets })
}

export function remainingMinutes(closeAt: number, now = Date.now()) {
  if (!Number.isFinite(closeAt) || closeAt <= 0) return null
  return (closeAt - now) / 60_000
}

export function inArmWindow(recipe: TapeRecipe, closeAt: number, now = Date.now()) {
  const left = remainingMinutes(closeAt, now)
  if (left == null) return false
  const lo = Math.min(recipe.armFromMin, recipe.armToMin)
  const hi = Math.max(recipe.armFromMin, recipe.armToMin)
  return left >= lo && left <= hi
}

export function askInBand(askCents: number, recipe: TapeRecipe) {
  if (!Number.isFinite(askCents)) return false
  const lo = Math.min(recipe.centLo, recipe.centHi)
  const hi = Math.max(recipe.centLo, recipe.centHi)
  return askCents >= lo && askCents <= hi
}

export type Lean = 'up' | 'down' | 'sit'

export function tapeLean(opts: {
  id: TapeId
  live: number | null
  beat: number
  recipe: TapeRecipe
}): Lean {
  const live = opts.live
  const beat = opts.beat
  if (live == null || !Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) return 'sit'
  const gap = live - beat
  const through = Math.abs(opts.recipe.through)
  if (opts.id === 'gld' && Math.abs(gap) < through) return 'sit'
  if (gap >= through) return 'up'
  if (gap <= -through) return 'down'
  return 'sit'
}

export function tabIsOpen() {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

export type DeskTicket = {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  orderId: string
  contracts: number
  beat: number
  filledAt: number
}

export function isRealOrderId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  const s = id.trim()
  if (s.length < 8) return false
  if (/^(arm|armed|paper|local|fake|pending|wait)$/i.test(s)) return false
  return true
}

/** Soft FAIL ARMING as a fill. Soft FAIL ticket without a real Kalshi order id. */
export function makeTicket(input: {
  tape: TapeId
  ticker: string
  side: 'up' | 'down'
  orderId: unknown
  contracts: number
  beat: number
  filledAt?: number
}): DeskTicket | null {
  if (!isRealOrderId(input.orderId)) return null
  if (input.side !== 'up' && input.side !== 'down') return null
  if (!input.ticker) return null
  return {
    tape: input.tape,
    ticker: input.ticker,
    side: input.side,
    orderId: String(input.orderId).trim(),
    contracts: clampContracts(input.contracts),
    beat: input.beat,
    filledAt: input.filledAt ?? Date.now(),
  }
}

export function loadTickets(): DeskTicket[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(TICKETS_KEY)
    const list = raw ? (JSON.parse(raw) as DeskTicket[]) : []
    if (!Array.isArray(list)) return []
    return list.filter((t) => t && isRealOrderId(t.orderId) && (t.side === 'up' || t.side === 'down'))
  } catch {
    return []
  }
}

export function saveTickets(tickets: DeskTicket[]) {
  if (typeof localStorage === 'undefined') return tickets
  const next = tickets.filter((t) => isRealOrderId(t.orderId))
  try {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function upsertTicket(tickets: DeskTicket[], ticket: DeskTicket) {
  const next = tickets.filter((t) => !(t.tape === ticket.tape && t.ticker === ticket.ticker))
  next.push(ticket)
  return saveTickets(next)
}

/** Soft FAIL flipping a confirmed ticket back to WAIT — confirmed tickets stay UP/DOWN. */
export function ticketStatus(ticket: DeskTicket | undefined): 'WAIT' | 'UP' | 'DOWN' {
  if (!ticket || !isRealOrderId(ticket.orderId)) return 'WAIT'
  return ticket.side === 'down' ? 'DOWN' : 'UP'
}

export type HitCell = { w: number; l: number }
export type HitLatch = {
  asOf: number
  tapes: Record<TapeId, HitCell>
}

export function emptyHits(): HitLatch {
  return {
    asOf: Date.now(),
    tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } },
  }
}

export function loadHits(): HitLatch {
  if (typeof localStorage === 'undefined') return emptyHits()
  try {
    const raw = localStorage.getItem(HITS_KEY)
    if (!raw) return emptyHits()
    const parsed = JSON.parse(raw) as HitLatch
    const base = emptyHits()
    for (const id of TAPE_IDS) {
      const cell = parsed?.tapes?.[id]
      base.tapes[id] = {
        w: Math.max(0, Math.round(Number(cell?.w) || 0)),
        l: Math.max(0, Math.round(Number(cell?.l) || 0)),
      }
    }
    base.asOf = Number(parsed?.asOf) || Date.now()
    return base
  } catch {
    return emptyHits()
  }
}

export function saveHits(hits: HitLatch) {
  if (typeof localStorage === 'undefined') return hits
  try {
    localStorage.setItem(HITS_KEY, JSON.stringify(hits))
  } catch {
    /* quota */
  }
  return hits
}

export function ttlFromHits(hits: HitLatch) {
  let w = 0
  let l = 0
  for (const id of TAPE_IDS) {
    w += hits.tapes[id].w
    l += hits.tapes[id].l
  }
  const n = w + l
  return { w, l, pct: n ? Math.round((w / n) * 100) : 0 }
}

export function hitPct(cell: HitCell) {
  const n = cell.w + cell.l
  return n ? Math.round((cell.w / n) * 100) : 0
}

export type CashLatch = { cash: number | null; pnl: number | null; deposits: number | null; asOf: number }

export function loadCash(): CashLatch {
  if (typeof localStorage === 'undefined') return { cash: null, pnl: null, deposits: null, asOf: 0 }
  try {
    const raw = localStorage.getItem(CASH_KEY)
    if (!raw) return { cash: null, pnl: null, deposits: null, asOf: 0 }
    const o = JSON.parse(raw) as CashLatch
    return {
      cash: Number.isFinite(o.cash) ? Number(o.cash) : null,
      pnl: Number.isFinite(o.pnl) ? Number(o.pnl) : null,
      deposits: Number.isFinite(o.deposits) ? Number(o.deposits) : null,
      asOf: Number(o.asOf) || 0,
    }
  } catch {
    return { cash: null, pnl: null, deposits: null, asOf: 0 }
  }
}

export function saveCash(cash: CashLatch) {
  if (typeof localStorage === 'undefined') return cash
  try {
    localStorage.setItem(CASH_KEY, JSON.stringify(cash))
  } catch {
    /* quota */
  }
  return cash
}

export function seriesToTape(seriesOrTicker: string): TapeId | null {
  const s = seriesOrTicker.toUpperCase()
  if (s.startsWith('KXBTC')) return 'btc'
  if (s.startsWith('KXNATGAS') || s.startsWith('KXNG')) return 'ng'
  if (s.startsWith('KXCOPPER') || s.startsWith('KXCU')) return 'cu'
  if (s.startsWith('KXGOLD') || s.startsWith('KXGLD')) return 'gld'
  return null
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Last print from Kalshi live_data / timeseries. Soft FAIL strike-as-live. */
export function lastPrintFromLiveData(payload: unknown): { px: number; source: 'kalshi-live' | 'kalshi-timeseries' } | null {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const live = (root?.live_data && typeof root.live_data === 'object' ? root.live_data : root) as Record<string, unknown> | null
  const details = (live?.details && typeof live.details === 'object' ? live.details : live) as Record<string, unknown> | null
  if (!details) return null

  const ts = details.timeseries
  if (Array.isArray(ts) && ts.length) {
    for (let i = ts.length - 1; i >= 0; i--) {
      const row = ts[i]
      if (!row || typeof row !== 'object') continue
      const v = num((row as { v?: unknown; px?: unknown; price?: unknown; close?: unknown }).v
        ?? (row as { px?: unknown }).px
        ?? (row as { price?: unknown }).price
        ?? (row as { close?: unknown }).close)
      if (v != null && v > 0) return { px: v, source: 'kalshi-timeseries' }
    }
  }

  const sticks = details.candlesticks
  const groups = sticks && typeof sticks === 'object' ? sticks as Record<string, unknown> : null
  const series = Array.isArray(sticks)
    ? sticks
    : Array.isArray(groups?.['1M'])
      ? groups!['1M']
      : Array.isArray(groups?.['1m'])
        ? groups!['1m']
        : []
  if (Array.isArray(series) && series.length) {
    for (let i = series.length - 1; i >= 0; i--) {
      const row = series[i]
      if (!row || typeof row !== 'object') continue
      const v = num((row as { close?: unknown }).close ?? (row as { c?: unknown }).c ?? (row as { v?: unknown }).v)
      if (v != null && v > 0) return { px: v, source: 'kalshi-live' }
    }
  }

  for (const k of ['last', 'price', 'value', 'px', 'close']) {
    const v = num(details[k])
    if (v != null && v > 0) return { px: v, source: 'kalshi-live' }
  }
  return null
}

export function askCentsFromMarket(m: Record<string, unknown>, yes: boolean) {
  const dollars = num(yes ? m.yes_ask_dollars : m.no_ask_dollars)
  if (dollars != null) return Math.round(dollars * 100)
  const cents = num(yes ? m.yes_ask : m.no_ask)
  return cents ?? 0
}

export function formatLive(id: TapeId, n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  const d = TAPE_META[id].decimals
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n as number)
}

export function formatCash(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n as number)
}

export function formatPnl(n: number | null | undefined) {
  if (!Number.isFinite(n ?? NaN)) return '—'
  const v = n as number
  const core = formatCash(Math.abs(v))
  if (v > 0) return `+${core}`
  if (v < 0) return `−${core}`
  return core
}

export function weThink(live: number | null, beat: number, points: { t: number; px: number }[], now = Date.now()) {
  if (live == null || !Number.isFinite(live)) return null
  const from = now - 6 * 60_000
  const slice = points.filter((p) => p.t >= from && p.t <= now + 1000)
  if (slice.length < 2) return live
  const a = slice[0]
  const b = slice[slice.length - 1]
  const mins = (b.t - a.t) / 60_000
  if (mins < 0.2) return live
  const slope = (b.px - a.px) / mins
  const ahead = live + slope * 4
  if (!Number.isFinite(ahead) || Math.abs(ahead - beat) > Math.abs(beat) * 0.2 + 500) return live
  return ahead
}

export function extractOrderId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const direct = o.order_id ?? o.orderId ?? o.id
  if (isRealOrderId(direct)) return direct
  const order = o.order
  if (order && typeof order === 'object') {
    const inner = (order as Record<string, unknown>).order_id ?? (order as Record<string, unknown>).id
    if (isRealOrderId(inner)) return inner
  }
  return null
}

export function pulseTone(ticket: DeskTicket | undefined, live: number | null): 'quiet' | 'green' | 'red' {
  if (!ticket || !isRealOrderId(ticket.orderId) || live == null || !Number.isFinite(live) || !Number.isFinite(ticket.beat)) {
    return 'quiet'
  }
  const onSide = ticket.side === 'up' ? live >= ticket.beat : live <= ticket.beat
  return onSide ? 'green' : 'red'
}
