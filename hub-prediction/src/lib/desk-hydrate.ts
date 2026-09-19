import { deskStorage } from './desk-storage'
import { settingsSavedAt, unionFinance, unionTickets, type HostDeskState } from './desk-persist'
import { FINANCE_KEY, hydrateFinance } from './finance'
import { GOLD_RECIPES, SETTINGS_KEY, TAPE_IDS, TICKETS_KEY, hydrateSettings, loadSettings, loadTickets } from './tapes'

/** Phone + PC latch the host book this often. Soft FAIL local-only localStorage. */
export const SETTINGS_LATCH_MS = 3000
/** Contract keystrokes flush to `.secrets/desk-state.json` after this pause. */
export const SETTINGS_DEBOUNCE_MS = 280

/** Host restore keeps user picks. Soft FAIL a recipe rewrite surviving update-desk. */
function hostSettingsPicks(raw: object, savedAt: number) {
  const incoming = hydrateSettings({ ...raw, savedAt })
  for (const id of TAPE_IDS) {
    const gold = GOLD_RECIPES[id]
    const cur = incoming.tapes[id]
    incoming.tapes[id] = {
      ...gold,
      contracts: cur.contracts,
      botOn: cur.botOn === true,
      liveOn: cur.liveOn === true,
    }
  }
  return incoming
}

export function hostSettingsNewer(host: HostDeskState | null | undefined) {
  if (!host?.settings) return false
  const hostAt = settingsSavedAt(host.settings)
  if (!hostAt) return false
  const localAt = Number(loadSettings().savedAt) || 0
  return hostAt > localAt
}

/** Host fills an empty / new-origin store. Soft FAIL overwriting a newer local pick. */
export function applyHostDeskState(host: HostDeskState | null | undefined) {
  if (!host) return false
  const ls = deskStorage()
  if (!ls) return false
  let any = false
  const raw = ls.getItem(SETTINGS_KEY)
  const local = loadSettings()
  const localAt = Number(local.savedAt) || 0
  const hostSettingsAt = settingsSavedAt(host.settings)
  if (host.settings && (!raw || hostSettingsAt > localAt)) {
    try {
      ls.setItem(
        SETTINGS_KEY,
        JSON.stringify(hostSettingsPicks(host.settings as object, hostSettingsAt || Date.now())),
      )
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
