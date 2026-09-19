import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyHostDeskState } from '../src/lib/desk-hydrate'
import { mergeHostDeskState, pickNewerSettings } from '../src/lib/desk-persist'
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

  it('PC contract save is the host book — a wiped phone hydrates the same count', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-share-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const pc = patchTape(loadSettings(), 'btc', { contracts: 23 })
    expect(pc.tapes.btc.contracts).toBe(23)
    writeDeskState({ settings: pc })
    localStorage.clear()
    expect(loadSettings().tapes.btc.contracts).toBe(GOLD_RECIPES.btc.contracts)
    applyHostDeskState(readDeskState())
    expect(loadSettings().tapes.btc.contracts).toBe(23)
    expect(loadSettings().clocks.btc).toBe(pc.clocks.btc)
    await rm(dir, { recursive: true, force: true })
  })

  it('factory liveOn false cannot overwrite host user Live cash ON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-factory-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const armed = patchTape(loadSettings(), 'btc', { liveOn: true, botOn: true, contracts: 14 })
    writeDeskState({ settings: armed })
    const factory = hydrateSettings(null)
    const merged = mergeHostDeskState(readDeskState()!, { settings: factory })
    expect((merged.settings as { tapes?: { btc?: { liveOn?: boolean; contracts?: number } } })?.tapes?.btc?.liveOn).toBe(
      true,
    )
    expect((merged.settings as { tapes?: { btc?: { contracts?: number } } })?.tapes?.btc?.contracts).toBe(14)
    expect(pickNewerSettings(armed, factory)).toMatchObject({ tapes: { btc: { liveOn: true, contracts: 14 } } })
    localStorage.clear()
    applyHostDeskState(readDeskState())
    expect(loadSettings().tapes.btc.liveOn).toBe(true)
    expect(loadSettings().tapes.btc.contracts).toBe(14)
    await rm(dir, { recursive: true, force: true })
  })

  it('newer recipe savedAt cannot wipe host Live cash or contracts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-toggles-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const armed = patchTape(loadSettings(), 'cu', { liveOn: true, botOn: true, contracts: 12 })
    writeDeskState({ settings: armed })
    const recipe = { ...armed, savedAt: (armed.savedAt || 0) + 5_000, tapes: { ...armed.tapes, cu: { ...armed.tapes.cu, liveOn: false, contracts: 1 } } }
    const merged = mergeHostDeskState(readDeskState()!, { settings: recipe })
    expect((merged.settings as { tapes?: { cu?: { liveOn?: boolean; contracts?: number } } })?.tapes?.cu?.liveOn).toBe(true)
    expect((merged.settings as { tapes?: { cu?: { contracts?: number } } })?.tapes?.cu?.contracts).toBe(12)
    localStorage.clear()
    applyHostDeskState(merged)
    expect(loadSettings().tapes.cu.liveOn).toBe(true)
    expect(loadSettings().tapes.cu.contracts).toBe(12)
    await rm(dir, { recursive: true, force: true })
  })

  it('Desk Chief state persists on host Soft FAIL wipe on refresh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-desk-chief-'))
    process.env.HUB_DESK_STATE_FILE = join(dir, 'desk-state.json')
    const { saveChief, loadChief, hydrateChief } = await import('../src/lib/desk-chief')
    const kept = saveChief(
      hydrateChief({
        asOf: Date.now(),
        actions: [{ id: 'act-keep', at: Date.now(), text: 'BTC paper +1 after 3W · 80%' }],
      }),
    )
    writeDeskState({ chief: kept })
    localStorage.clear()
    expect(loadChief().actions.some((a) => a.text.includes('BTC paper'))).toBe(false)
    applyHostDeskState(readDeskState())
    expect(loadChief().actions.some((a) => a.text.includes('BTC paper'))).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})
