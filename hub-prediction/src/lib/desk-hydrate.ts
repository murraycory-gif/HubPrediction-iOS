import { deskStorage } from './desk-storage'
import type { HostDeskState } from './desk-persist'
import { hydrateFinance, saveFinance } from './finance'
import { SETTINGS_KEY, hydrateSettings, loadTickets, saveTickets, type DeskTicket } from './tapes'

/** Host .secrets/desk-state.json wins over an empty or new-origin localStorage. */
export function applyHostDeskState(host: HostDeskState | null | undefined) {
  if (!host) return false
  const ls = deskStorage()
  let any = false
  if (host.settings) {
    const next = hydrateSettings(host.settings)
    if (ls) {
      try {
        ls.setItem(SETTINGS_KEY, JSON.stringify(next))
        any = true
      } catch {
        /* quota */
      }
    }
  }
  if (Array.isArray(host.tickets)) {
    saveTickets(host.tickets as DeskTicket[])
    any = true
  }
  if (host.finance) {
    saveFinance(hydrateFinance(host.finance))
    any = true
  }
  return any || loadTickets().length > 0
}
