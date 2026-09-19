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

/** Newer savedAt wins. Soft FAIL a finance write restoring stale Live cash OFF. */
export function pickNewerSettings(prev: unknown, incoming: unknown) {
  if (incoming == null) return prev
  if (prev == null) return incoming
  return settingsSavedAt(incoming) >= settingsSavedAt(prev) ? incoming : prev
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
