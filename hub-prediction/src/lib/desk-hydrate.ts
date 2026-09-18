import { deskStorage } from './desk-storage'
import type { HostDeskState } from './desk-persist'
import { FINANCE_KEY, hydrateFinance, type BookedBet } from './finance'
import { SETTINGS_KEY, TICKETS_KEY, hydrateSettings, loadSettings, loadTickets, type DeskTicket } from './tapes'

/** Host fills an empty / new-origin store. Soft FAIL overwriting a newer local pick. */
export function applyHostDeskState(host: HostDeskState | null | undefined) {
  if (!host) return false
  const ls = deskStorage()
  if (!ls) return false
  let any = false
  const local = loadSettings()
  const localAt = Number(local.savedAt) || 0
  const hostSettings = host.settings && typeof host.settings === 'object' ? (host.settings as { savedAt?: number }) : null
  const hostSettingsAt = Number(hostSettings?.savedAt) || 0
  if (host.settings && hostSettingsAt >= localAt) {
    try {
      ls.setItem(SETTINGS_KEY, JSON.stringify(hydrateSettings({ ...(host.settings as object), savedAt: hostSettingsAt })))
      any = true
    } catch {
      /* quota */
    }
  }
  if (Array.isArray(host.tickets)) {
    const byId = new Map<string, DeskTicket>()
    for (const t of host.tickets as DeskTicket[]) {
      if (t?.orderId) byId.set(t.orderId, t)
    }
    for (const t of loadTickets()) byId.set(t.orderId, t)
    try {
      ls.setItem(TICKETS_KEY, JSON.stringify([...byId.values()]))
      any = true
    } catch {
      /* quota */
    }
  }
  if (host.finance) {
    const hostFin = hydrateFinance(host.finance)
    const localFin = hydrateFinance(JSON.parse(ls.getItem(FINANCE_KEY) || 'null'))
    const byId = new Map<string, BookedBet>()
    for (const b of hostFin.bets) byId.set(b.betId, b)
    for (const b of localFin.bets) byId.set(b.betId, b)
    try {
      ls.setItem(FINANCE_KEY, JSON.stringify({ ...localFin, bets: [...byId.values()] }))
      any = true
    } catch {
      /* quota */
    }
  }
  return any
}
