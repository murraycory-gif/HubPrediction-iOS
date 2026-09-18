import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyHostDeskState } from '../src/lib/desk-hydrate'
import { readDeskState, writeDeskState } from '../src/lib/desk-state.server'
import { bookFill, emptyFinance, hydrateFinance, loadFinance } from '../src/lib/finance'
import { GOLD_RECIPES, hydrateSettings, loadSettings, loadTickets, patchTape, saveTickets } from '../src/lib/tapes'

const prevFile = process.env.HUB_DESK_STATE_FILE

afterEach(() => {
  if (prevFile) process.env.HUB_DESK_STATE_FILE = prevFile
  else delete process.env.HUB_DESK_STATE_FILE
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('host desk-state Soft FAIL wipe after update', () => {
  it('keeps Live cash ON after localStorage wipe — master Live stays OFF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-state-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const first = loadSettings()
    expect(first.liveBets).toBe(false)
    expect(first.tapes.btc.liveOn).toBe(false)
    const armed = patchTape(first, 'btc', { liveOn: true, botOn: true })
    expect(armed.tapes.btc.liveOn).toBe(true)
    writeDeskState({ settings: armed })
    localStorage.clear()
    expect(hydrateSettings(null).tapes.btc.liveOn).toBe(false)
    const host = readDeskState()
    expect(host?.settings).toBeTruthy()
    applyHostDeskState(host)
    const again = loadSettings()
    expect(again.tapes.btc.liveOn).toBe(true)
    expect(again.tapes.btc.botOn).toBe(true)
    expect(again.liveBets).toBe(false)
    expect(GOLD_RECIPES.btc.liveOn).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps today paper deskfill in the book after a simulated update restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-paper-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const booked = bookFill(emptyFinance(), {
      tape: 'btc',
      ticker: 'KXBTC15M-TODAY',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'up',
      count: 1,
      ask: 70,
      orderId: 'deskfill-btc-persist1',
    })
    expect(booked.ok).toBe(true)
    if (booked.ok) {
      saveTickets([
        {
          tape: 'btc',
          ticker: 'KXBTC15M-TODAY',
          side: 'up',
          orderId: 'deskfill-btc-persist1',
          contracts: 1,
          beat: 80_000,
          filledAt: Date.now(),
        },
      ])
      writeDeskState({ finance: booked.state, tickets: loadTickets() })
    }
    localStorage.clear()
    expect(loadFinance().bets).toEqual([])
    applyHostDeskState(readDeskState())
    const finance = hydrateFinance(loadFinance())
    expect(finance.bets.some((b) => b.orderId === 'deskfill-btc-persist1' && b.kind === 'paper')).toBe(true)
    expect(loadTickets().some((t) => t.orderId === 'deskfill-btc-persist1')).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})
