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

export const getKalshiCash = createServerFn({ method: 'POST' })
  .validator((d: { keyId: string; pem: string }) => d)
  .handler(async ({ data }) => {
    const { fetchBalance } = await import('./kalshi-trade.server')
    return fetchBalance(data.keyId, data.pem)
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
