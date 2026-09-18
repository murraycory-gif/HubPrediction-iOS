import { afterEach, describe, expect, it } from 'vitest'
import { DeskStore } from '../src/lib/desk-store'
import {
  PAPER_CASH_FLOOR,
  PAPER_START_CASH,
  bookBet,
  cashFloor,
  clearKill,
  confirmLiveMode,
  cumulativeDeposits,
  defaultDeskMode,
  emptyFinanceBook,
  engageKill,
  hydrateFinanceBook,
  loadFinanceBook,
  logDeposit,
  logWithdrawal,
  placeGate,
  pnlVsDeposits,
  setPaperMode,
  settleBet,
  suggestedSize,
  workingCash,
} from '../src/lib/finance-book'
import { SIZE_CASH_RECIPE, contractsFromCash, expectedProfit, ticketCost } from '../src/lib/size-cash'
import { DEFAULT_SETTINGS, disarmAllBots, hydrateSettings } from '../src/lib/tapes'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('Soft KEEP defaults', () => {
  it('mode defaults Paper and Live is not ON', () => {
    expect(defaultDeskMode()).toBe('paper')
    expect(hydrateFinanceBook(null).mode).toBe('paper')
    expect(hydrateFinanceBook({}).mode).toBe('paper')
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(DEFAULT_SETTINGS.liveBets).toBe(false)
    for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
      expect(hydrateSettings(null).tapes[id].botOn).toBe(false)
    }
  })

  it('does not silently flip Paper→Live without keys', () => {
    const result = confirmLiveMode(emptyFinanceBook(), false)
    expect(result.ok).toBe(false)
    expect(result.book.mode).toBe('paper')
  })
})

describe('FinanceBook ledger', () => {
  it('appends a paper fill and persists it after relaunch', () => {
    const first = bookBet(emptyFinanceBook(), {
      ticker: 'KXBTC15M-PAPER1',
      side: 'up',
      count: 2,
      ask: 40,
      mode: 'paper',
      source: 'manual',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.bet.ticker).toBe('KXBTC15M-PAPER1')
    expect(first.bet.mode).toBe('paper')
    expect(first.bet.source).toBe('manual')
    expect(first.bet.status).toBe('open')
    expect(first.book.bets).toHaveLength(1)
    expect(first.book.paperCash).toBe(PAPER_START_CASH - ticketCost(2, 40))

    const again = loadFinanceBook()
    expect(again.bets).toHaveLength(1)
    expect(again.bets[0].ticker).toBe('KXBTC15M-PAPER1')
    expect(again.bets[0].count).toBe(2)
    expect(again.paperCash).toBe(first.book.paperCash)
    expect(DeskStore.loadFinance().bets[0].bet_id).toBe(first.bet.bet_id)
  })

  it('does not overwrite an earlier bet when booking the next', () => {
    const a = bookBet(emptyFinanceBook(), {
      ticker: 'KXBTC15M-A',
      side: 'up',
      count: 1,
      ask: 40,
      mode: 'paper',
      source: 'manual',
    })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const b = bookBet(a.book, {
      ticker: 'KXNATGAS15M-B',
      side: 'down',
      count: 1,
      ask: 35,
      mode: 'paper',
      source: 'bot',
    })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(b.book.bets).toHaveLength(2)
    expect(b.book.bets[0]).toMatchObject({ bet_id: a.bet.bet_id, ticker: 'KXBTC15M-A', ask: 40 })
  })

  it('settles once and does not rewrite the original tape fields', () => {
    const placed = bookBet(emptyFinanceBook(), {
      ticker: 'KXGOLD15M-S',
      side: 'up',
      count: 2,
      ask: 50,
      mode: 'paper',
      source: 'manual',
    })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    const settled = settleBet(placed.book, placed.bet.bet_id, 'up')
    const row = settled.bets[0]
    expect(row.status).toBe('settled')
    expect(row.ticker).toBe('KXGOLD15M-S')
    expect(row.side).toBe('up')
    expect(row.count).toBe(2)
    expect(row.ask).toBe(50)
    expect(row.cost).toBe(1)
    expect(row.realized_pnl).toBe(1)
    expect(settled.paperCash).toBe(PAPER_START_CASH - 1 + 2)
    const again = settleBet(settled, placed.bet.bet_id, 'down')
    expect(again.bets[0].realized_pnl).toBe(1)
    expect(again.bets[0].side).toBe('up')
  })
})

describe('P&L vs deposits', () => {
  it('uses ending equity − deposits + withdrawals, not cash − $10k start', () => {
    let book = logDeposit(emptyFinanceBook(), 760, 'kalshi wire')
    expect(cumulativeDeposits(book)).toBe(760)
    expect(workingCash(book, null)).toBe(PAPER_START_CASH + 760)
    expect(pnlVsDeposits(book, null)).toBe(PAPER_START_CASH)
    expect(pnlVsDeposits(book, null)).not.toBe(book.paperCash - PAPER_START_CASH)

    const placed = bookBet(book, {
      ticker: 'KXBTC15M-PNL',
      side: 'up',
      count: 2,
      ask: 50,
      mode: 'paper',
      source: 'manual',
    })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    book = placed.book
    expect(pnlVsDeposits(book, null)).toBe(PAPER_START_CASH - 1)
    expect(pnlVsDeposits(book, null)).not.toBe(book.paperCash - PAPER_START_CASH)

    book = logWithdrawal(book, 100, 'draw')
    expect(pnlVsDeposits(book, null)).toBe(PAPER_START_CASH - 1)
  })
})

describe('cash floor + KILL', () => {
  it('uses paper $50 and live max($150, 20% deposits) — not $25 / 10%', () => {
    expect(cashFloor(emptyFinanceBook())).toBe(PAPER_CASH_FLOOR)
    let live = logDeposit(emptyFinanceBook(), 760)
    const armed = confirmLiveMode(live, true)
    expect(armed.ok).toBe(true)
    if (!armed.ok) return
    expect(cashFloor(armed.book)).toBe(152)
    expect(cashFloor(armed.book)).not.toBe(76)
    expect(cashFloor(armed.book)).toBeGreaterThan(25)
  })

  it('blocks Place when cash would go below the floor', () => {
    const thin = hydrateFinanceBook({ paperCash: 55, mode: 'paper' })
    const blocked = bookBet(thin, {
      ticker: 'KXBTC15M-FLOOR',
      side: 'up',
      count: 20,
      ask: 40,
      mode: 'paper',
      source: 'manual',
    })
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.code).toBe('floor')
    expect(thin.bets).toHaveLength(0)

    const ok = bookBet(thin, {
      ticker: 'KXBTC15M-FLOOR-OK',
      side: 'up',
      count: 1,
      ask: 40,
      mode: 'paper',
      source: 'manual',
    })
    expect(ok.ok).toBe(true)
  })

  it('KILL persists, disarms bots, and blocks Place until cleared', () => {
    const armed = {
      ...DEFAULT_SETTINGS,
      liveBets: true,
      tapes: {
        ...DEFAULT_SETTINGS.tapes,
        btc: { ...DEFAULT_SETTINGS.tapes.btc, botOn: true },
      },
    }
    const killed = engageKill(emptyFinanceBook())
    expect(killed.killed).toBe(true)
    expect(loadFinanceBook().killed).toBe(true)
    expect(placeGate(killed, 1).ok).toBe(false)
    expect(placeGate(killed, 1).ok === false && placeGate(killed, 1).code).toBe('kill')
    const placed = bookBet(killed, {
      ticker: 'KXBTC15M-KILL',
      side: 'up',
      count: 1,
      ask: 40,
      mode: 'paper',
      source: 'manual',
    })
    expect(placed.ok).toBe(false)

    const disarmed = disarmAllBots(armed)
    expect(disarmed.liveBets).toBe(false)
    expect(disarmed.tapes.btc.botOn).toBe(false)
    expect(disarmed.tapes.ng.botOn).toBe(false)

    const cleared = clearKill(killed)
    expect(cleared.killed).toBe(false)
    expect(placeGate(cleared, 1).ok).toBe(true)
  })
})

describe('SizeCash recipe lock', () => {
  it('keeps risk 8% / lock 40% / quarter-Kelly / max 25', () => {
    expect(Object.isFrozen(SIZE_CASH_RECIPE)).toBe(true)
    expect(SIZE_CASH_RECIPE).toMatchObject({
      riskCap: 0.08,
      lockCap: 0.4,
      kellyFraction: 0.25,
      maxContracts: 25,
    })
    expect(contractsFromCash(1_000_000, 10, 0.95)).toBe(25)
    expect(suggestedSize(emptyFinanceBook(), 40, 0.8)).toBeLessThanOrEqual(25)
    expect(expectedProfit(2, 40, 0.7)).toBeCloseTo(0.6)
  })

  it('will not size a ticket that would trade through the floor', () => {
    const n = contractsFromCash(70, 50, 0.9, 50)
    expect(ticketCost(n, 50)).toBeLessThanOrEqual(20 + 1e-9)
    expect(n).toBeLessThanOrEqual(25)
  })
})

describe('paper vs live cash', () => {
  it('paper cash is the book; live cash is the exchange latch', () => {
    const paper = setPaperMode(emptyFinanceBook())
    expect(workingCash(paper, 294)).toBe(PAPER_START_CASH)
    const live = confirmLiveMode(logDeposit(paper, 760), true)
    expect(live.ok).toBe(true)
    if (!live.ok) return
    expect(workingCash(live.book, 294)).toBe(294)
    expect(pnlVsDeposits(live.book, 294)).toBe(294 - 760)
  })
})
