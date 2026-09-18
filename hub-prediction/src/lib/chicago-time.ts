const TZ = 'America/Chicago'

function parts(ms: number) {
  const map: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const hour = map.hour === '24' ? 0 : Number(map.hour)
  return {
    weekday: map.weekday ?? '',
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function chicagoOffsetMs(ms: number) {
  const p = parts(ms)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - ms
}

export function dayKey(ms: number) {
  const p = parts(ms)
  const m = String(p.month).padStart(2, '0')
  const d = String(p.day).padStart(2, '0')
  return `${p.year}-${m}-${d}`
}

export function weekdayName(ms: number) {
  return parts(ms).weekday
}

export function formatClock(ms: number) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms))
}

export function formatDayLabel(ms: number) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms))
}

/** Kalshi-style window: September 18, 11:30 – 11:45 AM CDT */
export function formatWindowRange(openAt?: number, closeAt?: number) {
  if (!openAt || !closeAt || !Number.isFinite(openAt) || !Number.isFinite(closeAt)) return '—'
  const open = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(openAt))
  const close = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(closeAt))
  return `${open} – ${close} CDT`
}

export function formatChartTick(ms: number, windowMs = 15 * 60_000) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    second: windowMs <= 5 * 60_000 ? '2-digit' : undefined,
    hour12: true,
  }).format(new Date(ms))
}

export function startOfChicagoDay(ms: number) {
  const p = parts(ms)
  const guess = Date.UTC(p.year, p.month - 1, p.day, 6, 0, 0)
  const off = chicagoOffsetMs(guess)
  return Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0) - off
}

export function align15(ms: number) {
  const p = parts(ms)
  const minute = Math.floor(p.minute / 15) * 15
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, minute, 0)
  const off = chicagoOffsetMs(guess)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, minute, 0) - off
}

export function addChicagoDays(ms: number, days: number) {
  return startOfChicagoDay(ms + days * 86_400_000 + 12 * 3_600_000)
}

export function slotsForDay(dayMs: number) {
  const start = startOfChicagoDay(dayMs)
  const out: number[] = []
  for (let i = 0; i < 96; i++) out.push(start + i * 15 * 60_000)
  return out
}

export function upcomingDays(now = Date.now(), count = 7) {
  const today = startOfChicagoDay(now)
  return Array.from({ length: count }, (_, i) => {
    const t = addChicagoDays(today, i)
    return { t, key: dayKey(t), label: formatDayLabel(t), weekday: weekdayName(t) }
  })
}
