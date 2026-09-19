/** Host + browser persist. Soft FAIL update-desk wipe. Soft FAIL Live cash ON default. */

export type HostDeskState = {
  asOf: number
  settings?: unknown
  tickets?: unknown
  finance?: unknown
  hits?: unknown
  chief?: unknown
}

type Writer = (patch: HostDeskState) => void

let writer: Writer | null = null
const pending: Omit<HostDeskState, 'asOf'>[] = []

export function settingsSavedAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { savedAt?: unknown }).savedAt) || 0
}

const TOGGLE_IDS = ['btc', 'ng', 'cu', 'gld', 'wti', 'slv'] as const

function settingsTapes(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {}
  const tapes = (raw as { tapes?: Record<string, { liveOn?: unknown; botOn?: unknown; contracts?: unknown }> }).tapes
  return tapes && typeof tapes === 'object' ? tapes : {}
}

const GOLD_LIVE_ON: Record<string, boolean> = {
  btc: true,
  ng: false,
  cu: false,
  gld: false,
  wti: false,
  slv: false,
}

/** Paper-tape Live cash ON after a user toggle. Factory BTC Live ON is not a user pick. */
export function settingsHasUserLive(settings: unknown) {
  if (settingsTogglesAt(settings) <= 0) {
    const o = settings && typeof settings === 'object' ? (settings as { togglesPicked?: unknown }) : null
    if (o?.togglesPicked !== true) return false
  }
  return TOGGLE_IDS.some((id) => settingsTapes(settings)[id]?.liveOn === true && GOLD_LIVE_ON[id] !== true)
}

export function settingsTogglesAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { togglesAt?: unknown }).togglesAt) || 0
}

export function settingsClocksAt(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0
  return Number((settings as { clocksAt?: unknown }).clocksAt) || 0
}

function tapeContracts(t: { contracts?: unknown } | undefined) {
  const n = Number(t?.contracts)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function tapeIsGoldDefault(t: { liveOn?: unknown; contracts?: unknown } | undefined, id: string) {
  if (!t) return true
  const factory: Record<string, { liveOn: boolean; contracts: number }> = {
    btc: { liveOn: true, contracts: 30 },
    ng: { liveOn: false, contracts: 30 },
    cu: { liveOn: false, contracts: 30 },
    gld: { liveOn: false, contracts: 30 },
    wti: { liveOn: false, contracts: 1 },
    slv: { liveOn: false, contracts: 1 },
  }
  const gold = factory[id] ?? { liveOn: false, contracts: 1 }
  return t.liveOn === gold.liveOn && tapeContracts(t) === gold.contracts
}

export function settingsHasUserPicks(settings: unknown) {
  if (!settings || typeof settings !== 'object') return false
  const o = settings as { togglesPicked?: unknown; togglesAt?: unknown }
  if (o.togglesPicked === true || (Number(o.togglesAt) || 0) > 0) return true
  return TOGGLE_IDS.some((id) => settingsTapes(settings)[id]?.botOn === false)
}

function incomingIsUnsavedFactory(settings: unknown) {
  if (!settings || typeof settings !== 'object') return true
  const o = settings as { savedAt?: unknown; togglesPicked?: unknown; togglesAt?: unknown }
  if (o.togglesPicked === true || (Number(o.togglesAt) || 0) > 0) return false
  return true
}

/** Soft FAIL GOLD contracts 1 / liveOn false overwriting a user/phone pick. */
function protectUserSizes(winner: unknown, other: unknown) {
  if (!winner || !other || typeof winner !== 'object' || typeof other !== 'object') return winner
  const wt = settingsTapes(winner)
  const ot = settingsTapes(other)
  const winT = settingsTogglesAt(winner)
  const otherT = settingsTogglesAt(other)
  const winnerNewer = winT > otherT
  const tapes: Record<string, unknown> = { ...wt }
  let changed = false
  for (const id of TOGGLE_IDS) {
    const w = wt[id]
    const o = ot[id]
    if (!w || !o) continue
    const wC = tapeContracts(w)
    const oC = tapeContracts(o)
    let liveOn = w.liveOn === true
    let botOn = w.botOn === true
    let contracts = wC
    if (winT === 0 && otherT === 0) {
      const goldLive = GOLD_LIVE_ON[id] === true
      if (liveOn !== goldLive) {
        liveOn = goldLive
        changed = true
      }
    } else if (otherT > 0 && !winnerNewer) {
      if (o.liveOn === true && w.liveOn !== true) {
        liveOn = true
        changed = true
      }
      if (o.liveOn !== true && w.liveOn === true) {
        liveOn = false
        changed = true
      }
    }
    if (oC > 1 && wC !== oC && !winnerNewer) {
      contracts = oC
      changed = true
    }
    if (o.botOn === false && w.botOn !== false && !winnerNewer) {
      botOn = false
      changed = true
    }
    tapes[id] = { ...w, liveOn, botOn, contracts }
  }
  if (!changed) return winner
  return {
    ...(winner as object),
    tapes,
    togglesPicked: true,
    togglesAt: Math.max(winT, otherT) || (winner as { togglesAt?: number }).togglesAt,
  }
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
  if (incomingIsUnsavedFactory(incoming) && (settingsHasUserPicks(prev) || settingsHasUserLive(prev) || prevAt > 0 || settingsTogglesAt(prev) > 0)) {
    return prev
  }
  if (nextAt === 0 && prevAt > 0) return prev
  let winner = nextAt >= prevAt ? incoming : prev
  const other = winner === incoming ? prev : incoming
  const winT = settingsTogglesAt(winner)
  const otherT = settingsTogglesAt(other)
  if (otherT > winT) winner = copyUserToggles(other, winner)
  else if (otherT === winT && otherT > 0) winner = copyUserToggles(prev, winner)
  winner = protectUserSizes(winner, other)
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
  if (patch.chief != null) next.chief = mergeChiefBlob(prev.chief, patch.chief)
  return next
}

function chiefAsOf(raw: unknown) {
  if (!raw || typeof raw !== 'object') return 0
  return Number((raw as { asOf?: unknown }).asOf) || 0
}

function mergeChiefBlob(prev: unknown, incoming: unknown) {
  if (incoming == null) return prev
  if (prev == null) return incoming
  return chiefAsOf(incoming) >= chiefAsOf(prev) ? incoming : prev
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
