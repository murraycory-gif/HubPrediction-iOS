import { describe, expect, it } from 'vitest'
import {
  DESK_EXPERT,
  buildDeskBrief,
  buildTapeIntel,
  emptyBriefs,
  forecastSwing,
  formatNewsAge,
  hourTrendFromPoints,
  newsRssUrl,
  parseNewsRss,
  sameClockPriorFromPoints,
  upcomingFromMarkets,
} from '../src/lib/desk-brief'
import { GOLD_RECIPES, TAPE_IDS } from '../src/lib/tapes'
import type { TapeQuote } from '../src/lib/types'

const NOW = Date.UTC(2026, 8, 18, 21, 7, 0)

function quote(id: TapeQuote['id'], live: number, beat: number, extra: Partial<TapeQuote> = {}): TapeQuote {
  return {
    id,
    series: 'X',
    ticker: `${id}-live`,
    eventTicker: `${id}-e`,
    yesAsk: 72,
    noAsk: 29,
    beat,
    live,
    liveSource: 'kalshi-timeseries',
    points: [],
    openAt: NOW - 7 * 60_000,
    closeAt: NOW + 8 * 60_000,
    fetchedAt: NOW,
    clock: '9:15 PM',
    tradingActive: true,
    ...extra,
  }
}

describe('desk chiefs Soft KEEP gold + Google News RSS', () => {
  it('names one expert per tape and keeps factory recipes / Live OFF', () => {
    expect(DESK_EXPERT.btc.title).toMatch(/BTC desk chief/)
    expect(DESK_EXPERT.ng.title).toMatch(/NG desk chief/)
    expect(DESK_EXPERT.cu.title).toMatch(/CU desk chief/)
    expect(DESK_EXPERT.gld.title).toMatch(/GLD desk chief/)
    expect(GOLD_RECIPES.btc).toMatchObject({ armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89, liveOn: false })
    expect(GOLD_RECIPES.ng).toMatchObject({ armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, liveOn: false })
    expect(GOLD_RECIPES.cu).toMatchObject({ armFromMin: 9, armToMin: 0.45, through: 0.002, liveOn: false })
    expect(GOLD_RECIPES.gld).toMatchObject({ armFromMin: 10, armToMin: 3, through: 2, centLo: 34, liveOn: false })
    for (const id of TAPE_IDS) {
      expect(newsRssUrl(id)).toMatch(/^https:\/\/news\.google\.com\/rss\/search\?/)
      expect(newsRssUrl(id)).not.toMatch(/twitter|x\.com|api\.x\.com/i)
    }
  })

  it('parseNewsRss reads title, source, link, and stops at 4', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item><title>Bitcoin holds $76k - Reuters</title><link>https://news.example/1</link><pubDate>Thu, 18 Sep 2026 20:00:00 GMT</pubDate></item>
        <item><title><![CDATA[ETF inflow — Bloomberg]]></title><link>https://news.example/2</link><pubDate>Thu, 18 Sep 2026 19:00:00 GMT</pubDate></item>
        <item><title>Third wire - AP</title><link>https://news.example/3</link></item>
        <item><title>Fourth wire - CNBC</title><link>https://news.example/4</link></item>
        <item><title>Dropped fifth - WSJ</title><link>https://news.example/5</link></item>
      </channel></rss>`
    const items = parseNewsRss(xml, NOW)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({ title: 'Bitcoin holds $76k', source: 'Reuters', href: 'https://news.example/1' })
    expect(items[1].title).toBe('ETF inflow')
    expect(items[1].source).toBe('Bloomberg')
    expect(items.some((n) => n.title.includes('Dropped'))).toBe(false)
  })

  it('upcomingFromMarkets puts LIVE first then NEXT and drops closed clocks', () => {
    const rows = upcomingFromMarkets(
      [
        { ticker: 'closed', openAt: NOW - 40 * 60_000, closeAt: NOW - 10 * 60_000, beat: 1 },
        { ticker: 'live-a', openAt: NOW - 5 * 60_000, closeAt: NOW + 10 * 60_000, beat: 2 },
        { ticker: 'next-b', openAt: NOW + 10 * 60_000, closeAt: NOW + 25 * 60_000, beat: 3 },
        { ticker: 'next-c', openAt: NOW + 25 * 60_000, closeAt: NOW + 40 * 60_000, beat: 4 },
        { ticker: 'live-a', openAt: NOW - 5 * 60_000, closeAt: NOW + 10 * 60_000, beat: 2 },
      ],
      NOW,
      4,
    )
    expect(rows.map((r) => `${r.kind}:${r.ticker}`)).toEqual(['live:live-a', 'next:next-b', 'next:next-c'])
    expect(rows[0]?.label).not.toBe('—')
  })
})

describe('forecastSwing good / bad', () => {
  it('sits with no print', () => {
    const swing = forecastSwing({
      id: 'btc',
      live: null,
      beat: 76500,
      closeAt: NOW + 8 * 60_000,
      points: [],
      recipe: GOLD_RECIPES.btc,
      now: NOW,
    })
    expect(swing.side).toBe('sit')
    expect(swing.risk).toBe('quiet')
    expect(swing.good).toMatch(/sits/)
    expect(swing.bad).toMatch(/gap/)
  })

  it('sits a hug inside through and flags a late spike', () => {
    const swing = forecastSwing({
      id: 'btc',
      live: 76520,
      beat: 76500,
      closeAt: NOW + 8 * 60_000,
      points: [],
      recipe: GOLD_RECIPES.btc,
      now: NOW,
    })
    expect(swing.side).toBe('sit')
    expect(swing.risk).toBe('quiet')
    expect(swing.good).toMatch(/hug/)
    expect(swing.good).toMatch(/80%/)
    expect(swing.bad).toMatch(/late spike/)
  })

  it('forecasts an UP swing when close is through and names the fade miss', () => {
    const swing = forecastSwing({
      id: 'btc',
      live: 76600,
      beat: 76500,
      closeAt: NOW + 8 * 60_000,
      points: [
        { t: NOW - 5 * 60_000, px: 76540 },
        { t: NOW - 60_000, px: 76600 },
      ],
      recipe: GOLD_RECIPES.btc,
      now: NOW,
    })
    expect(swing.side).toBe('up')
    expect(swing.risk).toBe('swing')
    expect(swing.good).toMatch(/UP/)
    expect(swing.bad).toMatch(/Fade/)
  })

  it('forecasts a DOWN watch on NG when the gap is just through', () => {
    const swing = forecastSwing({
      id: 'ng',
      live: 2.989,
      beat: 2.992,
      closeAt: NOW + 8 * 60_000,
      points: [],
      recipe: GOLD_RECIPES.ng,
      now: NOW,
    })
    expect(swing.side).toBe('down')
    expect(swing.risk).toBe('watch')
    expect(swing.good).toMatch(/DOWN/)
    expect(swing.bad).toMatch(/Fade/)
  })
})

describe('buildDeskBrief per-desk report', () => {
  it('writes upcoming, trend, news, and swing for the BTC chief', () => {
    const brief = buildDeskBrief({
      id: 'btc',
      quote: quote('btc', 76620, 76500),
      recipe: GOLD_RECIPES.btc,
      path: {
        id: 'btc',
        current: 76620,
        hours24: { delta: 180, pct: 0.2, minutes: 1440, upMin: 800, downMin: 400 },
        hours48: { delta: -40, pct: -0.05, minutes: 2880, upMin: 1400, downMin: 1200 },
      },
      upcoming: [
        { ticker: 'btc-next', openAt: NOW + 8 * 60_000, closeAt: NOW + 23 * 60_000, beat: 76600 },
      ],
      news: [
        { title: 'Spot ETF prints another inflow', source: 'Reuters', at: NOW - 20 * 60_000, href: 'https://news.example/btc' },
      ],
      now: NOW,
    })
    expect(brief.expert).toBe(DESK_EXPERT.btc.title)
    expect(brief.focus).toMatch(/69–89/)
    expect(brief.upcoming[0]?.kind).toBe('live')
    expect(brief.upcoming.some((r) => r.ticker === 'btc-next')).toBe(true)
    expect(brief.trend).toMatch(/24h \+\$180/)
    expect(brief.trend).toMatch(/48h −\$40/)
    expect(brief.newsFocus).toMatch(/Spot ETF/)
    expect(brief.hourTrend).toMatch(/Hour|Sat hour/)
    expect(brief.sameClock).toMatch(/Same-clock prior/)
    expect(brief.swing.side).toBe('up')
    expect(brief.report).toHaveLength(7)
    expect(brief.report[0]).toMatch(/BTC desk chief/)
    expect(brief.report[1]).toMatch(/Upcoming runs/)
    expect(brief.report[2]).toMatch(/Trend/)
    expect(brief.report[3]).toMatch(/Hour|Sat hour/)
    expect(brief.report[4]).toMatch(/Same-clock prior/)
    expect(brief.report[5]).toMatch(/news focus/)
    expect(brief.report[6]).toMatch(/Swing/)
  })

  it('keeps a report on every desk when the tape is dark', () => {
    const briefs = emptyBriefs()
    for (const id of TAPE_IDS) {
      expect(briefs[id].expert).toBe(DESK_EXPERT[id].title)
      expect(briefs[id].report).toHaveLength(7)
      expect(briefs[id].newsFocus).toMatch(/no fresh headline/)
      expect(briefs[id].hourTrend).toMatch(/Hour|Sat hour/)
      expect(briefs[id].sameClock).toMatch(/Same-clock prior/)
      expect(briefs[id].swing.side).toBe('sit')
    }
  })

  it('formatNewsAge stays short', () => {
    expect(formatNewsAge(NOW - 12 * 60_000, NOW)).toBe('12m')
    expect(formatNewsAge(NOW - 3 * 60 * 60_000, NOW)).toBe('3h')
    expect(formatNewsAge(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3d')
  })

  it('Sat hour trend + same-clock prior feed BTC intel Soft FAIL Live rewrite', () => {
    const sat = Date.UTC(2026, 8, 19, 19, 10, 0)
    const points = [
      { t: Date.UTC(2026, 8, 12, 19, 2, 0), px: 80_000 },
      { t: Date.UTC(2026, 8, 12, 19, 12, 0), px: 80_400 },
      { t: Date.UTC(2026, 8, 19, 19, 4, 0), px: 81_000 },
      { t: Date.UTC(2026, 8, 19, 19, 9, 0), px: 81_200 },
    ]
    const hourTrend = hourTrendFromPoints('btc', points, sat)
    expect(hourTrend.dir).toBe('up')
    expect(hourTrend.line).toMatch(/Sat hour/)
    const prior = sameClockPriorFromPoints('btc', points, sat, 15 * 60_000, sat)
    expect(prior.dir).toBe('up')
    expect(prior.line).toMatch(/Same-clock prior/)
    const intel = buildTapeIntel({
      id: 'btc',
      points,
      closeAt: sat,
      news: [{ title: 'BTC weekend bid', source: 'Reuters', at: sat, href: 'https://n.example' }],
      now: sat,
    })
    expect(intel.bias).toBe('print')
    expect(intel.newsLine).toMatch(/BTC weekend bid/)
  })
})
