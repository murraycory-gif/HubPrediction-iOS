import {
  chicagoHour,
  chicagoMinute,
  dayKey,
  formatWindowRange,
  isChicagoSaturday,
  weekdayName,
} from './chicago-time'
import { HIT_FLOOR } from './finance'
import { slopeFromPoints } from './forecast'
import { GOLD_RECIPES, formatLive, remainingMinutes, TAPE_META, type TapeId, type TapeRecipe } from './tapes'
import type { PathWindow, TapePathStats } from './analyst'
import type { TapeQuote } from './types'

export const DESK_EXPERT: Record<TapeId, { title: string; focus: string; newsQ: string }> = {
  btc: {
    title: 'BTC desk chief · 15m bitcoin',
    focus: 'Spot vs Kalshi strike, 69–89¢ band, $40 hug. Fade noise, take only a clean through.',
    newsQ: 'Bitcoin OR BTC price',
  },
  ng: {
    title: 'NG desk chief · Henry Hub',
    focus: 'Nat-gas ticks vs $0.002 through, 34–89¢. Weather and storage headlines move this tape.',
    newsQ: 'natural gas Henry Hub price',
  },
  cu: {
    title: 'CU desk chief · COMEX copper',
    focus: 'Copper vs $0.002 through, 34–89¢. China demand and dollar swings are the tell.',
    newsQ: 'copper COMEX price',
  },
  gld: {
    title: 'GLD desk chief · bullion',
    focus: 'Gold vs $2 through, 34–89¢ including 56–68. Real yields and USD set the swing.',
    newsQ: 'gold bullion price',
  },
  wti: {
    title: 'WTI desk chief · crude',
    focus: 'WTI vs $0.05 through, 34–89¢. Paper only until HARD QA PASS.',
    newsQ: 'WTI crude oil price',
  },
  slv: {
    title: 'SLV desk chief · silver',
    focus: 'Silver vs $0.05 through, 34–89¢. Paper only until HARD QA PASS.',
    newsQ: 'silver COMEX price',
  },
}

export type ListedClock = {
  ticker: string
  openAt: number
  closeAt: number
  beat: number
}

export type UpcomingRun = ListedClock & {
  kind: 'live' | 'next'
  label: string
}

export type NewsItem = {
  title: string
  source: string
  at: number
  href: string
}

export type SwingCall = {
  side: 'up' | 'down' | 'sit'
  risk: 'quiet' | 'watch' | 'swing'
  atClose: number | null
  vsBeat: number | null
  good: string
  bad: string
}

export type DeskBrief = {
  id: TapeId
  expert: string
  focus: string
  upcoming: UpcomingRun[]
  trend: string
  hourTrend: string
  sameClock: string
  news: NewsItem[]
  newsFocus: string
  swing: SwingCall
  report: string[]
}

export type TapeIntel = {
  hourDir: 'up' | 'down' | 'flat'
  clockDir: 'up' | 'down' | 'flat'
  hourLine: string
  clockLine: string
  newsLine: string
  bias: 'print' | 'fade' | 'hold'
}

function decodeXml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function parseNewsRss(xml: string, now = Date.now()): NewsItem[] {
  const items: NewsItem[] = []
  const chunks = String(xml ?? '').split(/<item[\s>]/i).slice(1)
  for (const chunk of chunks) {
    const title = decodeXml((chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim())
    if (!title) continue
    const href = decodeXml((chunk.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim())
    const pub = Date.parse(chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '')
    const parts = title.split(/\s+[-–—]\s+/)
    const source = parts.length > 1 ? parts[parts.length - 1] : 'wire'
    items.push({
      title: parts.length > 1 ? parts.slice(0, -1).join(' — ') : title,
      source,
      at: Number.isFinite(pub) ? pub : now,
      href,
    })
    if (items.length >= 4) break
  }
  return items
}

export function upcomingFromMarkets(markets: ListedClock[], now = Date.now(), limit = 4): UpcomingRun[] {
  const live = markets
    .filter((m) => m.openAt <= now && now < m.closeAt)
    .sort((a, b) => a.closeAt - b.closeAt)
  const next = markets
    .filter((m) => m.openAt > now && m.closeAt > m.openAt)
    .sort((a, b) => a.openAt - b.openAt)
  const rows = [
    ...live.map((m) => ({ ...m, kind: 'live' as const, label: formatWindowRange(m.openAt, m.closeAt) })),
    ...next.map((m) => ({ ...m, kind: 'next' as const, label: formatWindowRange(m.openAt, m.closeAt) })),
  ]
  const seen = new Set<string>()
  const out: UpcomingRun[] = []
  for (const r of rows) {
    if (seen.has(r.ticker)) continue
    seen.add(r.ticker)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

function trendLine(id: TapeId, path: TapePathStats | undefined) {
  const w24 = path?.hours24
  const w48 = path?.hours48
  if (!w24 || w24.delta == null) return 'Trend: waiting on a print path.'
  const dir = w24.delta > 0 ? 'up' : w24.delta < 0 ? 'down' : 'flat'
  const d24 = formatLive(id, Math.abs(w24.delta))
  const d48 = w48?.delta != null ? formatLive(id, Math.abs(w48.delta)) : '—'
  const sign24 = w24.delta > 0 ? '+' : w24.delta < 0 ? '−' : ''
  const sign48 = (w48?.delta ?? 0) > 0 ? '+' : (w48?.delta ?? 0) < 0 ? '−' : ''
  return `Trend vs now: 24h ${sign24}${d24} (${w24.upMin}↑ ${w24.downMin}↓) · 48h ${sign48}${d48}. Tape is ${dir} into this clock.`
}

function dirFromDelta(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

function signedPx(id: TapeId, delta: number) {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${formatLive(id, Math.abs(delta))}`
}

/** This Chicago hour’s path. Saturday uses Sat-only prints when they exist. */
export function hourTrendFromPoints(
  id: TapeId,
  points: { t: number; px: number }[] | undefined,
  now = Date.now(),
) {
  const hour = chicagoHour(now)
  const sat = isChicagoSaturday(now)
  const rows = (points ?? []).filter((p) => Number.isFinite(p.px) && p.px > 0 && chicagoHour(p.t) === hour)
  const satRows = sat ? rows.filter((p) => isChicagoSaturday(p.t)) : rows
  const use = satRows.length >= 2 ? satRows : rows
  const label = sat ? `Sat hour ${hour}` : `Hour ${hour}`
  if (use.length < 2) {
    return { dir: 'flat' as const, line: `${label}: waiting on a print path.`, delta: null as number | null }
  }
  const first = use[0].px
  const last = use[use.length - 1].px
  const delta = Math.round((last - first) * 10000) / 10000
  const dir = dirFromDelta(delta)
  return {
    dir,
    delta,
    line: `${label}: ${dir} ${signedPx(id, delta)} on this Chicago hour${sat ? ' (Saturday)' : ''}.`,
  }
}

/** Prior same 15m (or clock) slot — previous day same close HH:MM, else last finished clock. */
export function sameClockPriorFromPoints(
  id: TapeId,
  points: { t: number; px: number }[] | undefined,
  closeAt?: number,
  clockMs = 15 * 60_000,
  now = Date.now(),
) {
  const end = Number(closeAt) > 0 ? Number(closeAt) : now
  const slot = clockMs > 0 ? clockMs : 15 * 60_000
  const wantH = chicagoHour(end)
  const wantM = Math.floor(chicagoMinute(end) / 15) * 15
  const rows = (points ?? []).filter((p) => Number.isFinite(p.px) && p.px > 0)
  const byDay = new Map<string, { t: number; px: number }[]>()
  for (const p of rows) {
    if (chicagoHour(p.t) !== wantH || Math.floor(chicagoMinute(p.t) / 15) * 15 !== wantM) continue
    const key = dayKey(p.t)
    const list = byDay.get(key) ?? []
    list.push(p)
    byDay.set(key, list)
  }
  const today = dayKey(end)
  const priorDays = [...byDay.keys()].filter((k) => k !== today).sort()
  const pick = priorDays.length ? byDay.get(priorDays[priorDays.length - 1]) : null
  if (pick && pick.length >= 2) {
    const delta = Math.round((pick[pick.length - 1].px - pick[0].px) * 10000) / 10000
    const dir = dirFromDelta(delta)
    return {
      dir,
      delta,
      line: `Same-clock prior ${weekdayName(pick[0].t)} ${wantH}:${String(wantM).padStart(2, '0')}: ${dir} ${signedPx(id, delta)}.`,
    }
  }
  const prevEnd = end - slot
  const prev = rows.filter((p) => p.t >= prevEnd - slot && p.t < prevEnd)
  if (prev.length >= 2) {
    const delta = Math.round((prev[prev.length - 1].px - prev[0].px) * 10000) / 10000
    const dir = dirFromDelta(delta)
    return {
      dir,
      delta,
      line: `Same-clock prior: last ${Math.round(slot / 60_000)}m ${dir} ${signedPx(id, delta)}.`,
    }
  }
  return { dir: 'flat' as const, delta: null as number | null, line: 'Same-clock prior: no prior 15m print yet.' }
}

export function buildTapeIntel(opts: {
  id: TapeId
  points?: { t: number; px: number }[]
  closeAt?: number
  clockMs?: number
  news?: NewsItem[]
  now?: number
}): TapeIntel {
  const now = opts.now ?? Date.now()
  const hour = hourTrendFromPoints(opts.id, opts.points, now)
  const clock = sameClockPriorFromPoints(opts.id, opts.points, opts.closeAt, opts.clockMs, now)
  const newsLine = opts.news?.[0]
    ? `${TAPE_META[opts.id].label} news: ${opts.news[0].title}`
    : `${TAPE_META[opts.id].label} news: no fresh headline — tape path only.`
  let bias: TapeIntel['bias'] = 'hold'
  if (hour.dir === 'up' && clock.dir === 'up') bias = 'print'
  else if (hour.dir === 'down' && clock.dir === 'down') bias = 'fade'
  return {
    hourDir: hour.dir,
    clockDir: clock.dir,
    hourLine: hour.line,
    clockLine: clock.line,
    newsLine,
    bias,
  }
}

export function forecastSwing(opts: {
  id: TapeId
  live: number | null
  beat: number
  closeAt: number
  points: { t: number; px: number }[] | undefined
  recipe: TapeRecipe
  now?: number
}): SwingCall {
  const now = opts.now ?? Date.now()
  const live = opts.live
  const beat = opts.beat
  if (live == null || !Number.isFinite(live) || !Number.isFinite(beat) || beat <= 0) {
    return {
      side: 'sit',
      risk: 'quiet',
      atClose: null,
      vsBeat: null,
      good: 'No live print — this desk sits until the tape prints.',
      bad: 'A first print can gap. Do not arm blind.',
    }
  }
  const slope = slopeFromPoints(opts.points, now)
  const left = remainingMinutes(opts.closeAt, now) ?? 15
  const atClose = live + slope * Math.max(0, left)
  const vsBeat = atClose - beat
  const thru = Math.abs(opts.recipe.through)
  const px = formatLive(opts.id, Math.abs(vsBeat))
  if (Math.abs(vsBeat) < thru) {
    return {
      side: 'sit',
      risk: 'quiet',
      atClose,
      vsBeat,
      good: `Forecast hug at close (${px} inside through). Sitting protects the ${HIT_FLOOR}% goal.`,
      bad: `A late spike through ${formatLive(opts.id, thru)} flips the clock. Watch last 90s.`,
    }
  }
  const side = vsBeat > 0 ? 'up' : 'down'
  const risk = Math.abs(vsBeat) >= thru * 2 ? 'swing' : 'watch'
  return {
    side,
    risk,
    atClose,
    vsBeat,
    good: `Forecast ${side.toUpperCase()} at close by ${px}. A hold through is the clean take for this desk.`,
    bad: `Fade risk: slope dies and we settle back through ${formatLive(opts.id, beat)}. That is the miss.`,
  }
}

export function buildDeskBrief(opts: {
  id: TapeId
  quote: TapeQuote | null
  recipe: TapeRecipe
  path?: TapePathStats
  upcoming?: ListedClock[]
  news?: NewsItem[]
  now?: number
}): DeskBrief {
  const now = opts.now ?? Date.now()
  const id = opts.id
  const meta = DESK_EXPERT[id]
  const quote = opts.quote
  const listed = opts.upcoming ?? []
  if (quote?.openAt && quote.closeAt) {
    listed.unshift({
      ticker: quote.ticker,
      openAt: quote.openAt,
      closeAt: quote.closeAt,
      beat: quote.beat,
    })
  }
  const upcoming = upcomingFromMarkets(listed, now)
  const news = (opts.news ?? []).slice(0, 4)
  const swing = forecastSwing({
    id,
    live: quote?.live ?? null,
    beat: quote?.beat ?? 0,
    closeAt: quote?.closeAt ?? now + 15 * 60_000,
    points: quote?.points,
    recipe: opts.recipe,
    now,
  })
  const trend = trendLine(id, opts.path)
  const intel = buildTapeIntel({
    id,
    points: quote?.points,
    closeAt: quote?.closeAt,
    news,
    now,
  })
  const newsFocus = news[0]
    ? `${TAPE_META[id].label} news focus: ${news[0].title}${news[0].source ? ` (${news[0].source})` : ''}`
    : `${TAPE_META[id].label} news focus: no fresh headline — this desk is on tape path only.`
  const nextLabel = upcoming[0]?.label ?? 'the next listed clock'
  const report = [
    `${meta.title} on ${TAPE_META[id].label}. ${meta.focus}`,
    `Upcoming runs: ${upcoming.length ? upcoming.map((r) => `${r.kind === 'live' ? 'LIVE' : 'NEXT'} ${r.label}`).join(' · ') : 'waiting on Kalshi clocks'}. Focus is ${nextLabel}.`,
    trend,
    intel.hourLine,
    intel.clockLine,
    newsFocus,
    `Swing: ${swing.good} ${swing.bad}`,
  ]
  return {
    id,
    expert: meta.title,
    focus: meta.focus,
    upcoming,
    trend,
    hourTrend: intel.hourLine,
    sameClock: intel.clockLine,
    news,
    newsFocus,
    swing,
    report,
  }
}

export function formatSwingPx(id: TapeId, n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—'
  return formatLive(id, n)
}

export function emptyBriefs(): Record<TapeId, DeskBrief> {
  const now = Date.now()
  return {
    btc: buildDeskBrief({ id: 'btc', quote: null, recipe: GOLD_RECIPES.btc, now }),
    ng: buildDeskBrief({ id: 'ng', quote: null, recipe: GOLD_RECIPES.ng, now }),
    cu: buildDeskBrief({ id: 'cu', quote: null, recipe: GOLD_RECIPES.cu, now }),
    gld: buildDeskBrief({ id: 'gld', quote: null, recipe: GOLD_RECIPES.gld, now }),
    wti: buildDeskBrief({ id: 'wti', quote: null, recipe: GOLD_RECIPES.wti, now }),
    slv: buildDeskBrief({ id: 'slv', quote: null, recipe: GOLD_RECIPES.slv, now }),
  }
}

export type DeskBriefsPayload = {
  upcoming: Record<TapeId, ListedClock[]>
  news: Record<TapeId, NewsItem[]>
  fetchedAt: number
}

export function newsRssUrl(id: TapeId) {
  const q = encodeURIComponent(DESK_EXPERT[id].newsQ)
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
}

export function formatNewsAge(at: number, now = Date.now()) {
  const min = Math.max(0, Math.round((now - at) / 60_000))
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h`
  return `${Math.round(hr / 24)}d`
}

export function pathWindowTone(w?: PathWindow) {
  if (!w || w.delta == null) return 'flat'
  if (w.delta > 0) return 'up'
  if (w.delta < 0) return 'down'
  return 'flat'
}
