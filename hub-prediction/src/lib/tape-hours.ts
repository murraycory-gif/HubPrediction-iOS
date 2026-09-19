import { addChicagoDays, align15, formatClock, formatDayLabel, startOfChicagoDay, weekdayName } from './chicago-time'
import { CLOCK_MS, type TapeClock, type TapeId } from './tapes'
import type { TapeQuote } from './types'

/** CME metals / energy session in Chicago. BTC is 24/7. Gold Friday night Soft KEEP these hours. */
export const TAPE_SESSION_LABEL: Record<TapeId, string> = {
  btc: '24/7',
  ng: 'Sun 5:00 PM – Fri 4:00 PM CT',
  cu: 'Sun 5:00 PM – Fri 4:00 PM CT',
  gld: 'Sun 5:00 PM – Fri 4:00 PM CT',
}

export type TapeSessionHours = {
  label: string
  open: boolean
  nextOpenAt: number | null
  nextOpenLabel: string
}

function minutesSinceMidnightCt(now: number) {
  return Math.max(0, Math.floor((now - startOfChicagoDay(now)) / 60_000))
}

function sundayFivePm(from: number) {
  const wd = weekdayName(from)
  const min = minutesSinceMidnightCt(from)
  const ahead =
    wd === 'Sun'
      ? min < 17 * 60
        ? 0
        : 7
      : { Mon: 6, Tue: 5, Wed: 4, Thu: 3, Fri: 2, Sat: 1 }[wd] ?? 1
  const day = addChicagoDays(startOfChicagoDay(from), ahead)
  return startOfChicagoDay(day) + 17 * 60 * 60_000
}

export function tapeSessionHours(id: TapeId, now = Date.now()): TapeSessionHours {
  const label = TAPE_SESSION_LABEL[id]
  if (id === 'btc') {
    return { label, open: true, nextOpenAt: null, nextOpenLabel: 'open now' }
  }
  const wd = weekdayName(now)
  const min = minutesSinceMidnightCt(now)
  const closed = wd === 'Sat' || (wd === 'Sun' && min < 17 * 60) || (wd === 'Fri' && min >= 16 * 60)
  if (!closed) {
    return { label, open: true, nextOpenAt: null, nextOpenLabel: 'open now' }
  }
  const next = sundayFivePm(now)
  return {
    label,
    open: false,
    nextOpenAt: next,
    nextOpenLabel: `${formatDayLabel(next)} ${formatClock(next)}`,
  }
}

export function nextClockLabel(now: number, clock: TapeClock, quote?: TapeQuote | null) {
  if (quote?.closeAt && quote.closeAt > now) return formatClock(quote.closeAt)
  const slot = align15(now + CLOCK_MS[clock])
  return formatClock(slot > now ? slot : slot + CLOCK_MS[clock])
}

/** One heartbeat line: trading hours + next open / next clock. */
export function tapeHoursLine(
  id: TapeId,
  quote: TapeQuote | null | undefined,
  clock: TapeClock,
  now = Date.now(),
  liveClock = false,
) {
  const session = tapeSessionHours(id, now)
  if (!session.open) {
    return `Hours ${session.label} · next open ${session.nextOpenLabel}`
  }
  if (liveClock) {
    return `Hours ${session.label} · open`
  }
  return `Hours ${session.label} · next clock ${nextClockLabel(now, clock, quote)}`
}
