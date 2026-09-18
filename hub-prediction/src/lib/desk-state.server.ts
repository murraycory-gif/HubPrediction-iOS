import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HostDeskState } from './desk-persist'

export const DESK_STATE_FILE = 'desk-state.json'

function secretDirs() {
  const libDir = dirname(fileURLToPath(import.meta.url))
  const hubDir = resolve(libDir, '../..')
  const repoDir = resolve(hubDir, '..')
  const cwd = process.cwd()
  return [
    process.env.KALSHI_SECRETS_DIR,
    process.env.HUB_DESK_STATE_DIR,
    resolve(cwd, '.secrets'),
    resolve(cwd, '../.secrets'),
    resolve(hubDir, '.secrets'),
    resolve(repoDir, '.secrets'),
    resolve(repoDir, '../.secrets'),
  ].filter((d): d is string => Boolean(d))
}

export function deskStatePath() {
  const forced = String(process.env.HUB_DESK_STATE_FILE ?? '').trim()
  if (forced) return forced
  for (const dir of secretDirs()) {
    if (existsSync(dir)) return resolve(dir, DESK_STATE_FILE)
  }
  return resolve(secretDirs()[0] ?? resolve(process.cwd(), '.secrets'), DESK_STATE_FILE)
}

export function readDeskState(): HostDeskState | null {
  try {
    const path = deskStatePath()
    if (!existsSync(path)) return null
    const raw = JSON.parse(readFileSync(path, 'utf8')) as HostDeskState
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch {
    return null
  }
}

export function writeDeskState(patch: Partial<HostDeskState>): HostDeskState {
  const prev = readDeskState() ?? { asOf: 0 }
  const next: HostDeskState = {
    ...prev,
    ...patch,
    asOf: Date.now(),
  }
  const path = deskStatePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(next))
  return next
}

export function resetDeskStateForTests() {
  const path = String(process.env.HUB_DESK_STATE_FILE ?? '').trim()
  if (!path) return
  try {
    writeFileSync(path, '')
  } catch {
    /* ignore */
  }
}
