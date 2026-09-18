import { createServerFn } from '@tanstack/react-start'
import type { TapeId } from './tapes'

export const peekDesk = createServerFn({ method: 'GET' }).handler(async () => {
  const { peekDeskBoard, startWarm } = await import('./kalshi.server')
  startWarm()
  return peekDeskBoard()
})

export const getDeskBoard = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadDeskBoard, startWarm } = await import('./kalshi.server')
  startWarm()
  return loadDeskBoard()
})

export const getSettledTape = createServerFn({ method: 'POST' })
  .validator((d: { id: TapeId }) => d)
  .handler(async ({ data }) => {
    const { loadSettledTape } = await import('./kalshi.server')
    return loadSettledTape(data.id)
  })

export const getSettledDesk = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadSettledTape } = await import('./kalshi.server')
  const { TAPE_IDS } = await import('./tapes')
  const rows = await Promise.all(TAPE_IDS.map((id) => loadSettledTape(id)))
  return rows.flat()
})

/** First-paint cash + deposits. Soft FAIL waiting on settlements / Settings tap. */
export const getKalshiBalance = createServerFn({ method: 'POST' })
  .validator((d: { keyId: string; pem: string }) => d)
  .handler(async ({ data }) => {
    const { fetchBalance, fetchDeposits } = await import('./kalshi-trade.server')
    const [bal, deposits] = await Promise.all([
      fetchBalance(data.keyId, data.pem),
      fetchDeposits(data.keyId, data.pem).catch(() => null),
    ])
    return { ...bal, deposits }
  })

export const getKalshiCash = createServerFn({ method: 'POST' })
  .validator((d: { keyId: string; pem: string }) => d)
  .handler(async ({ data }) => {
    const { fetchBalance, fetchDeposits, fetchSettlements } = await import('./kalshi-trade.server')
    const [bal, deposits, settlements] = await Promise.all([
      fetchBalance(data.keyId, data.pem),
      fetchDeposits(data.keyId, data.pem).catch(() => null),
      fetchSettlements(data.keyId, data.pem).catch(() => null),
    ])
    return { ...bal, deposits, settlements }
  })

export const placeKalshi = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      keyId: string
      pem: string
      ticker: string
      side: 'up' | 'down'
      count: number
      yesAsk: number
      noAsk: number
    }) => d,
  )
  .handler(async ({ data }) => {
    const { placeContract } = await import('./kalshi-trade.server')
    return placeContract(data)
  })

/** @deprecated BTC-only snapshot — kept so leftover imports typecheck. */
export const peekLastQuote = peekDesk
export const getKalshiQuote = getDeskBoard
export const getKalshiBoard = getDeskBoard
