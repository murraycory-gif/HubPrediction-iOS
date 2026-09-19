import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyHostDeskState } from '../src/lib/desk-hydrate'
import { mergeHostDeskState } from '../src/lib/desk-persist'
import { readDeskState, writeDeskState } from '../src/lib/desk-state.server'
import { bookFill, emptyFinance, hydrateFinance, loadFinance, saveFinance } from '../src/lib/finance'
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
    expect(first).not.toHaveProperty('liveBets')
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
    expect(again.tapes.btc.through).toBe(GOLD_RECIPES.btc.through)
    expect(again).not.toHaveProperty('liveBets')
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

  it('finance write cannot restore stale Live cash OFF over a newer pick', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-merge-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const off = loadSettings()
    expect(off.tapes.btc.liveOn).toBe(false)
    writeDeskState({ settings: { ...off, savedAt: 1_000 } })
    const on = patchTape(loadSettings(), 'btc', { liveOn: true })
    expect(on.tapes.btc.liveOn).toBe(true)
    writeDeskState({ settings: { ...on, savedAt: 2_000 } })
    writeDeskState({ finance: emptyFinance(), settings: { ...off, savedAt: 1_000 } })
    const host = readDeskState()
    expect((host?.settings as { tapes?: { btc?: { liveOn?: boolean } } })?.tapes?.btc?.liveOn).toBe(true)
    expect((host?.settings as { savedAt?: number })?.savedAt).toBe(2_000)
    const stale = mergeHostDeskState(
      { asOf: 1, settings: { ...on, savedAt: 2_000 }, finance: emptyFinance() },
      { settings: { ...off, savedAt: 1_000 }, finance: { killed: false, paperStartedAt: 1, bets: [] } },
    )
    expect((stale.settings as { tapes?: { btc?: { liveOn?: boolean } } })?.tapes?.btc?.liveOn).toBe(true)
    localStorage.clear()
    applyHostDeskState(readDeskState())
    expect(loadSettings().tapes.btc.liveOn).toBe(true)
    expect(loadSettings()).not.toHaveProperty('liveBets')
    await rm(dir, { recursive: true, force: true })
  })

  it('update-desk restart (LS wipe) keeps Live cash ON and today paper', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-update-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const armed = patchTape(loadSettings(), 'ng', { liveOn: true, botOn: true })
    const booked = bookFill(emptyFinance(), {
      tape: 'cu',
      ticker: 'KXCOPPER15M-TODAY',
      clock: '15m',
      closeAt: Date.now() + 60_000,
      side: 'down',
      count: 1,
      ask: 40,
      orderId: 'deskfill-cu-update1',
    })
    expect(booked.ok).toBe(true)
    if (booked.ok) saveFinance(booked.state)
    writeDeskState({ settings: armed, finance: loadFinance() })
    localStorage.clear()
    applyHostDeskState(readDeskState())
    expect(loadSettings().tapes.ng.liveOn).toBe(true)
    expect(loadSettings()).not.toHaveProperty('liveBets')
    expect(hydrateFinance(loadFinance()).bets.some((b) => b.orderId === 'deskfill-cu-update1' && b.kind === 'paper')).toBe(
      true,
    )
    await rm(dir, { recursive: true, force: true })
  })
})
