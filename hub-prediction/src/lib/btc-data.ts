import { createServerFn } from '@tanstack/react-start'
import type { ChartRange, TapeClock, TapeId } from './tapes'

export const peekDesk = createServerFn({ method: 'GET' }).handler(async () => {
  const { peekDeskBoard, startWarm } = await import('./kalshi.server')
  startWarm()
  return peekDeskBoard()
})

export const getDeskBoard = createServerFn({ method: 'POST' })
  .validator((d: { clocks?: Partial<Record<TapeId, TapeClock>> } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { loadDeskBoard, startWarm } = await import('./kalshi.server')
    const { hydrateClocks } = await import('./tapes')
    startWarm()
    return loadDeskBoard(hydrateClocks(data?.clocks))
  })

export const getLivePrints = createServerFn({ method: 'POST' })
  .validator(
    (
      d:
        | {
            events?: Partial<Record<TapeId, string>>
            charts?: Partial<Record<TapeId, ChartRange>>
            clocks?: Partial<Record<TapeId, TapeClock>>
          }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ data }) => {
    const { loadLivePrints } = await import('./kalshi.server')
    const { liveRangeFromCharts } = await import('./tapes')
    return loadLivePrints(data?.events ?? {}, liveRangeFromCharts(data?.charts, data?.clocks))
  })

export const getDeskState = createServerFn({ method: 'POST' })
  .validator((d: { t?: number } | undefined) => d ?? {})
  .handler(async () => {
    const { readDeskState } = await import('./desk-state.server')
    return readDeskState()
  })

export const saveDeskState = createServerFn({ method: 'POST' })
  .validator((d: { settings?: unknown; tickets?: unknown; finance?: unknown; hits?: unknown } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { writeDeskState } = await import('./desk-state.server')
    return writeDeskState(data)
  })

export const getSettledTape = createServerFn({ method: 'POST' })
  .validator((d: { id: TapeId }) => d)
  .handler(async ({ data }) => {
    const { loadSettledTape } = await import('./kalshi.server')
    return loadSettledTape(data.id)
  })

export const getDeskBriefs = createServerFn({ method: 'POST' })
  .validator((d: { clocks?: Partial<Record<TapeId, TapeClock>> } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { loadDeskBriefs } = await import('./kalshi.server')
    const { hydrateClocks } = await import('./tapes')
    return loadDeskBriefs(hydrateClocks(data?.clocks))
  })

export const getTapePaths = createServerFn({ method: 'POST' })
  .validator((d: { events?: Partial<Record<TapeId, string>> } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { loadTapePaths } = await import('./kalshi.server')
    return loadTapePaths(data?.events ?? {})
  })

export const getSettledDesk = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadSettledTape } = await import('./kalshi.server')
  const { TAPE_IDS } = await import('./tapes')
  const rows = await Promise.all(TAPE_IDS.map((id) => loadSettledTape(id)))
  return rows.flat()
})

/** Closed-clock settle latch. Soft FAIL wait for reload / 20s series drip. */
export const getClockSettle = createServerFn({ method: 'POST' })
  .validator((d: { tickers?: string[]; minTs?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { loadKalshiHostCreds, fetchClockSettle } = await import('./kalshi-trade.server')
    const creds = loadKalshiHostCreds()
    const tickers = Array.isArray(data.tickers) ? data.tickers.map((t) => String(t || '').trim()).filter(Boolean) : []
    if (!creds) {
      return {
        cash: null,
        deposits: null,
        settlements: null,
        fills: null,
        positions: null,
        orders: null,
        markets: [] as { ticker: string; result: string }[],
        tickers,
        fetchedAt: Date.now(),
        hostCreds: false,
      }
    }
    return fetchClockSettle(creds.keyId, creds.pem, tickers, Number(data.minTs) || 0)
  })

/** First-paint cash + deposits from Windows-host creds. Soft FAIL browser PEM. */
export const getKalshiBalance = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadKalshiHostCreds, fetchBalance, fetchDeposits } = await import('./kalshi-trade.server')
  const creds = loadKalshiHostCreds()
  if (!creds) return { cash: null, deposits: null, hostCreds: false }
  const [bal, deposits] = await Promise.all([
    fetchBalance(creds.keyId, creds.pem),
    fetchDeposits(creds.keyId, creds.pem).catch(() => null),
  ])
  return { ...bal, deposits, hostCreds: true }
})

export const getKalshiBook = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadKalshiHostCreds, fetchKalshiBook } = await import('./kalshi-trade.server')
  const creds = loadKalshiHostCreds()
  if (!creds) {
    return {
      cash: null,
      deposits: null,
      settlements: null,
      fills: null,
      positions: null,
      orders: null,
      hostCreds: false,
      fetchedAt: Date.now(),
    }
  }
  return fetchKalshiBook(creds.keyId, creds.pem)
})

export const getKalshiCash = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadKalshiHostCreds, fetchBalance, fetchDeposits, fetchSettlements, fetchFills, fetchPositions, fetchOrders } =
    await import('./kalshi-trade.server')
  const creds = loadKalshiHostCreds()
  if (!creds) {
    return {
      cash: null,
      deposits: null,
      settlements: null,
      fills: null,
      positions: null,
      orders: null,
      hostCreds: false,
      fetchedAt: Date.now(),
    }
  }
  const [bal, deposits, settlements, fills, positions, orders] = await Promise.all([
    fetchBalance(creds.keyId, creds.pem),
    fetchDeposits(creds.keyId, creds.pem).catch(() => null),
    fetchSettlements(creds.keyId, creds.pem).catch(() => null),
    fetchFills(creds.keyId, creds.pem).catch(() => null),
    fetchPositions(creds.keyId, creds.pem).catch(() => null),
    fetchOrders(creds.keyId, creds.pem).catch(() => null),
  ])
  return { ...bal, deposits, settlements, fills, positions, orders, fetchedAt: Date.now(), hostCreds: true }
})

export const placeKalshi = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      ticker: string
      side: 'up' | 'down'
      count: number
      yesAsk: number
      noAsk: number
      tape?: TapeId
      botOn?: boolean
      liveOn?: boolean
    }) => d,
  )
  .handler(async ({ data }) => {
    const { loadKalshiHostCreds, placeContract } = await import('./kalshi-trade.server')
    const { readDeskState } = await import('./desk-state.server')
    const { hostLivePlaceGate } = await import('./tapes')
    const creds = loadKalshiHostCreds()
    const host = readDeskState()
    const gate = hostLivePlaceGate({
      settings: host?.settings,
      tape: data.tape,
      clientBotOn: data.botOn,
      clientLiveOn: data.liveOn,
      hasKeys: Boolean(creds),
    })
    if (!gate.ok) throw new Error(gate.reason)
    const { askAllowedByGold } = await import('./finance')
    const ask = data.side === 'down' ? data.noAsk : data.yesAsk
    if (data.tape && !askAllowedByGold(data.tape, ask)) {
      throw new Error(`Ask ${ask}¢ skip (≥80 unless locked)`)
    }
    return placeContract({
      ticker: data.ticker,
      side: data.side,
      count: data.count,
      yesAsk: data.yesAsk,
      noAsk: data.noAsk,
      keyId: creds.keyId,
      pem: creds.pem,
    })
  })

/** @deprecated BTC-only snapshot — kept so leftover imports typecheck. */
export const peekLastQuote = peekDesk
export const getKalshiQuote = getDeskBoard
export const getKalshiBoard = getDeskBoard
