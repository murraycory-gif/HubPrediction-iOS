import { kalshiCall } from './kalshi-signal'
import type { Quote } from './types'

/** Multi-analyst nowcast. pWin is the held-side win probability. */
export function deskNowcast(quote: Quote | null | undefined) {
  const call = kalshiCall(quote)
  const live = quote?.live ?? 0
  const strike = quote?.strike ?? live
  const gap = live - strike
  return {
    ...call,
    gap,
    nowcast: live,
    analysts: [
      { name: 'Strike', lean: gap > 2 ? 'up' : gap < -2 ? 'down' : 'sit' },
      { name: 'Tape', lean: (quote?.yesAsk ?? 50) < 48 ? 'up' : (quote?.yesAsk ?? 50) > 52 ? 'down' : 'sit' },
      { name: 'Path', lean: call.side },
    ],
  }
}

export function pWin(quote: Quote | null | undefined) {
  return kalshiCall(quote).pWin
}
