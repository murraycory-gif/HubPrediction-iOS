import { deskStorage } from './desk-storage'
import { settingsSavedAt, unionFinance, unionTickets, type HostDeskState } from './desk-persist'
import { FINANCE_KEY, hydrateFinance } from './finance'
import { SETTINGS_KEY, TICKETS_KEY, hydrateSettings, loadSettings, loadTickets } from './tapes'

/** Host fills an empty / new-origin store. Soft FAIL overwriting a newer local pick. */
export function applyHostDeskState(host: HostDeskState | null | undefined) {
  if (!host) return false
  const ls = deskStorage()
  if (!ls) return false
  let any = false
  const local = loadSettings()
  const localAt = Number(local.savedAt) || 0
  const hostSettingsAt = settingsSavedAt(host.settings)
  if (host.settings && (localAt === 0 || hostSettingsAt > localAt)) {
    try {
      ls.setItem(SETTINGS_KEY, JSON.stringify(hydrateSettings({ ...(host.settings as object), savedAt: hostSettingsAt })))
      any = true
    } catch {
      /* quota */
    }
  }
  if (Array.isArray(host.tickets)) {
    try {
      ls.setItem(TICKETS_KEY, JSON.stringify(unionTickets(host.tickets, loadTickets())))
      any = true
    } catch {
      /* quota */
    }
  }
  if (host.finance) {
    try {
      const merged = unionFinance(hydrateFinance(host.finance), hydrateFinance(JSON.parse(ls.getItem(FINANCE_KEY) || 'null')))
      ls.setItem(FINANCE_KEY, JSON.stringify(hydrateFinance(merged)))
      any = true
    } catch {
      /* quota */
    }
  }
  return any
}
