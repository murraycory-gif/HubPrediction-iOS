/** Host + browser persist. Soft FAIL update-desk wipe. Soft FAIL Live cash ON default. */

export type HostDeskState = {
  asOf: number
  settings?: unknown
  tickets?: unknown
  finance?: unknown
  hits?: unknown
}

type Writer = (patch: HostDeskState) => void

let writer: Writer | null = null
const pending: Omit<HostDeskState, 'asOf'>[] = []

export function settingsSavedAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { savedAt?: unknown }).savedAt) || 0
}

const TOGGLE_IDS = ['btc', 'ng', 'cu', 'gld'] as const

function settingsTapes(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {}
  const tapes = (raw as { tapes?: Record<string, { liveOn?: unknown; botOn?: unknown; contracts?: unknown }> }).tapes
  return tapes && typeof tapes === 'object' ? tapes : {}
}

export function settingsHasUserLive(settings: unknown) {
  return Object.values(settingsTapes(settings)).some((t) => t?.liveOn === true)
}

export function settingsTogglesAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { togglesAt?: unknown }).togglesAt) || 0
}

export function settingsClocksAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { clocksAt?: unknown }).clocksAt) || 0
}

function incomingIsUnsavedFactory(settings: unknown) {
  if (!settings || typeof settings !== 'object') return true
  if (settingsHasUserLive(settings)) return false
  const o = settings as { savedAt?: unknown; togglesPicked?: unknown; togglesAt?: unknown }
  return (Number(o.savedAt) || 0) === 0 && o.togglesPicked !== true && (Number(o.togglesAt) || 0) === 0
}

function copyUserToggles(from: unknown, onto: unknown) {
  if (!from || !onto || typeof from !== 'object' || typeof onto !== 'object') return onto
  const ft = settingsTapes(from)
  const ot = settingsTapes(onto)
  const tapes: Record<string, unknown> = { ...ot }
  for (const id of TOGGLE_IDS) {
    const src = ft[id]
    const cur = ot[id]
    if (!src || !cur) continue
    tapes[id] = {
      ...cur,
      liveOn: src.liveOn === true,
      botOn: src.botOn === true,
      contracts: src.contracts,
    }
  }
  const src = from as { togglesAt?: unknown; togglesPicked?: unknown }
  return {
    ...(onto as object),
    tapes,
    togglesAt: Number(src.togglesAt) || settingsTogglesAt(onto),
    togglesPicked: src.togglesPicked === true || (onto as { togglesPicked?: unknown }).togglesPicked === true,
  }
}

/** Newer savedAt wins the blob. User Live cash / Bot / contracts follow togglesAt. */
export function pickNewerSettings(prev: unknown, incoming: unknown) {
  if (incoming == null) return prev
  if (prev == null) return incoming
  const prevAt = settingsSavedAt(prev)
  const nextAt = settingsSavedAt(incoming)
  if (incomingIsUnsavedFactory(incoming) && (settingsHasUserLive(prev) || prevAt > 0 || settingsTogglesAt(prev) > 0)) {
    return prev
  }
  if (nextAt === 0 && prevAt > 0) return prev
  let winner = nextAt >= prevAt ? incoming : prev
  const other = winner === incoming ? prev : incoming
  const winT = settingsTogglesAt(winner)
  const otherT = settingsTogglesAt(other)
  if (otherT > winT) winner = copyUserToggles(other, winner)
  else if (otherT === winT && otherT > 0) winner = copyUserToggles(prev, winner)
  const winC = settingsClocksAt(winner)
  const otherC = settingsClocksAt(other)
  if (otherC > winC && other && typeof other === 'object') {
    winner = {
      ...(winner as object),
      clocks: (other as { clocks?: unknown }).clocks,
      charts: (other as { charts?: unknown }).charts,
      clocksAt: otherC,
    }
  }
  return winner
}

export function unionTickets(prev: unknown, incoming: unknown) {
  const list = (raw: unknown) => (Array.isArray(raw) ? raw : [])
  const byId = new Map<string, unknown>()
  for (const row of [...list(prev), ...list(incoming)]) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { orderId?: unknown }).orderId ?? '').trim()
    if (id) byId.set(id, row)
  }
  return [...byId.values()]
}

function financeBets(raw: unknown) {
  if (!raw || typeof raw !== 'object') return []
  const bets = (raw as { bets?: unknown }).bets
  return Array.isArray(bets) ? bets : []
}

function betKey(row: unknown) {
  if (!row || typeof row !== 'object') return ''
  const o = row as { betId?: unknown; orderId?: unknown }
  return String(o.betId || o.orderId || '').trim()
}

/** Union paper deskfill + LIVE Kalshi. Soft FAIL a host rewrite that hides today's paper. */
export function unionFinance(prev: unknown, incoming: unknown) {
  if (incoming == null) return prev
  if (prev == null) return incoming
  const byId = new Map<string, Record<string, unknown>>()
  for (const row of [...financeBets(prev), ...financeBets(incoming)]) {
    if (!row || typeof row !== 'object') continue
    const key = betKey(row)
    if (!key) continue
    const cur = byId.get(key)
    const next = row as Record<string, unknown>
    if (!cur) {
      byId.set(key, next)
      continue
    }
    const preferIncoming = next.status === 'settled' || cur.status !== 'settled'
    byId.set(key, preferIncoming ? { ...cur, ...next } : { ...next, ...cur })
  }
  return {
    ...(typeof prev === 'object' && prev ? prev : {}),
    ...(typeof incoming === 'object' && incoming ? incoming : {}),
    bets: [...byId.values()],
  }
}

export function mergeHostDeskState(prev: HostDeskState, patch: Partial<HostDeskState>): HostDeskState {
  const next: HostDeskState = {
    ...prev,
    asOf: Date.now(),
  }
  if (patch.settings != null) next.settings = pickNewerSettings(prev.settings, patch.settings)
  if (patch.tickets != null) next.tickets = unionTickets(prev.tickets, patch.tickets)
  if (patch.finance != null) next.finance = unionFinance(prev.finance, patch.finance)
  if (patch.hits != null) next.hits = patch.hits
  return next
}

export function setHostDeskWriter(fn: Writer | null) {
  writer = fn
  if (!fn) return
  const queued = pending.splice(0)
  for (const p of queued) fn({ ...p, asOf: Date.now() })
}

export function pushHostDesk(patch: Omit<HostDeskState, 'asOf'>) {
  if (!writer) {
    pending.push(patch)
    return
  }
  writer({ ...patch, asOf: Date.now() })
}
