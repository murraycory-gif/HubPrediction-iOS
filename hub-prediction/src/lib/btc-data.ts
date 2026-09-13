import { createServerFn } from '@tanstack/react-start'

export const peekLastQuote = createServerFn({ method: 'GET' }).handler(async () => {
  const { peekLastDashMemory, peekLastQuoteMemory, startWarm } = await import('./kalshi.server')
  startWarm()
  return { quote: peekLastQuoteMemory(), dash: peekLastDashMemory() }
})

export const getKalshiQuote = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadKalshiQuote, startWarm } = await import('./kalshi.server')
  startWarm()
  return loadKalshiQuote()
})

export const getKalshiBoard = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadKalshi } = await import('./kalshi.server')
  return loadKalshi()
})

export const getBtcDashboard = createServerFn({ method: 'POST' })
  .validator((d: { day?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { loadDashboard } = await import('./kalshi.server')
    try {
      return await loadDashboard(data?.day)
    } catch (err) {
      console.error('loadDashboard', err)
      return {
        day: data?.day ?? '',
        weekday: '',
        upcoming: [],
        elapsed: [],
      }
    }
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
