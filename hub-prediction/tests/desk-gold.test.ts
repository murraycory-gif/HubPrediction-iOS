import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanRacePoints, raceDomain } from '../src/components/race-chart'
import { mergeRaceTrail, pointTime, raceLinePath, smoothDrawPoints, MAX_RACE_DOTS } from '../src/lib/race-path'
import {
  DEFAULT_CLOCK,
  DEFAULT_SETTINGS,
  GOLD_RECIPES,
  hydrateChartRange,
  nowTone,
  formatNowDelta,
  SETTINGS_KEY,
  seriesForTape,
  setTapeChart,
  setTapeClock,
  askInBand,
  cashGates,
  askCentsFromMarket,
  emptyHits,
  eventsFromKalshiSettlements,
  extractOrderId,
  hitPct,
  hydrateCashFromKalshi,
  hydrateHitsFromKalshiCash,
  hydrateSettings,
  latchFromEvents,
  mergeHitEvents,
  inArmWindow,
  formatWeThink,
  lastPrintFromLiveData,
  pointsFromLiveData,
  loadSettings,
  makePaperTicket,
  makeTicket,
  marketTradingActive,
  patchTape,
  pulseTone,
  saveSettings,
  tabIsOpen,
  tapeLean,
  ticketStatus,
  ttlFromHits,
  weThink,
  weThinkPair,
} from '../src/lib/tapes'
import { emptyFinance, last24hBets } from '../src/lib/finance'
import { formatBetWindow } from '../src/lib/chicago-time'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('defaults Soft FAIL Live / bots ON', () => {
  it('keeps gold recipes locked after analyst paper drafts exist', async () => {
    const { analyzeDesk, makePaperDrafts, savePaperDrafts } = await import('../src/lib/analyst')
    const hits = {
      asOf: 1,
      events: [],
      tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } },
    }
    savePaperDrafts(makePaperDrafts(analyzeDesk(null, hits)))
    expect(loadSettings().tapes.btc).toMatchObject({ armFromMin: 8, through: 40, centLo: 69 })
    expect(loadSettings().liveBets).toBe(false)
  })

  it('boots live bets off and every bot / live-cash off', () => {
    const s = hydrateSettings(null)
    expect(s.liveBets).toBe(false)
    expect(DEFAULT_SETTINGS.liveBets).toBe(false)
    for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
      expect(s.tapes[id].botOn).toBe(false)
      expect(s.tapes[id].liveOn).toBe(false)
    }
  })

  it('persists an accepted recipe and clamps wild values — gold factory stays', () => {
    const s = hydrateSettings({
      tapes: { ng: { contracts: 4, armFromMin: 10, armToMin: 0.45, through: 0.003 } },
    })
    expect(s.tapes.ng.contracts).toBe(4)
    expect(s.tapes.ng.armFromMin).toBe(10)
    expect(s.tapes.ng.armToMin).toBe(0.45)
    expect(s.tapes.ng.through).toBeCloseTo(0.003)
    expect(s.liveBets).toBe(false)
    const wild = hydrateSettings({
      tapes: { btc: { armFromMin: 1, through: 99, centLo: 10 } },
    })
    expect(wild.tapes.btc.armFromMin).toBe(1)
    expect(wild.tapes.btc.through).toBe(99)
    expect(wild.tapes.btc.centLo).toBe(69)
    expect(GOLD_RECIPES.btc.armFromMin).toBe(8)
  })

  it('does not turn live on just because a stored blob omitted the flag', () => {
    const s = hydrateSettings({ tapes: { btc: { contracts: 7 } } })
    expect(s.liveBets).toBe(false)
    expect(s.tapes.btc.liveOn).toBe(false)
    expect(s.tapes.btc.botOn).toBe(false)
    expect(s.tapes.btc.contracts).toBe(7)
  })
})

describe('Grok Build recipes', () => {
  it('keeps BTC 8–3 / $40 / 69–89¢', () => {
    expect(GOLD_RECIPES.btc).toMatchObject({ armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 })
  })
  it('keeps NG 8:00–0:45 / $0.002 / 34–89¢ and CU 9:00–0:45', () => {
    expect(GOLD_RECIPES.ng).toMatchObject({ armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 })
    expect(GOLD_RECIPES.cu).toMatchObject({ armFromMin: 9, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 })
  })
  it('keeps gold 10:00–3:00 / $2 / 34–89¢ including 56–68', () => {
    expect(GOLD_RECIPES.gld).toMatchObject({ armFromMin: 10, armToMin: 3, through: 2, centLo: 34, centHi: 89 })
    expect(tapeLean({ id: 'gld', live: 4359, beat: 4358, recipe: GOLD_RECIPES.gld })).toBe('sit')
    expect(tapeLean({ id: 'gld', live: 4361, beat: 4358, recipe: GOLD_RECIPES.gld })).toBe('up')
  })
  it('skips BTC 34–55 and 56–68; hug sits', () => {
    expect(askInBand(50, GOLD_RECIPES.btc)).toBe(false)
    expect(askInBand(62, GOLD_RECIPES.btc)).toBe(false)
    expect(askInBand(73, GOLD_RECIPES.btc)).toBe(true)
    expect(askInBand(62, GOLD_RECIPES.gld)).toBe(true)
    expect(tapeLean({ id: 'btc', live: 76520, beat: 76500, recipe: GOLD_RECIPES.btc })).toBe('sit')
  })
})

describe('settings persist', () => {
  it('holds phone contract edits across reload', () => {
    const first = loadSettings()
    const saved = patchTape(first, 'btc', { contracts: 12 })
    expect(saved.tapes.btc.contracts).toBe(12)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').tapes.btc.contracts).toBe(12)
    const again = loadSettings()
    expect(again.tapes.btc.contracts).toBe(12)
    expect(again.tapes.ng.contracts).toBe(GOLD_RECIPES.ng.contracts)
  })

  it('saveSettings does not reset recipes on refresh', () => {
    saveSettings({
      liveBets: false,
      tapes: {
        ...DEFAULT_SETTINGS.tapes,
        ng: { ...GOLD_RECIPES.ng, contracts: 4, botOn: true },
      },
      betsFilter: DEFAULT_SETTINGS.betsFilter,
      clocks: DEFAULT_SETTINGS.clocks,
    })
    const again = loadSettings()
    expect(again.tapes.ng.contracts).toBe(4)
    expect(again.tapes.ng.botOn).toBe(true)
    expect(again.liveBets).toBe(false)
  })

  it('persists per-tape 5m / 15m / 1h clocks — 15m gold default', () => {
    const first = loadSettings()
    expect(first.clocks.btc).toBe(DEFAULT_CLOCK)
    expect(first.clocks.ng).toBe('15m')
    expect(seriesForTape('btc', '15m')).toBe('KXBTC15M')
    expect(seriesForTape('btc', '5m')).toBe('KXBTC5M')
    expect(seriesForTape('btc', '1h')).toBe('KXBTCD')
    expect(seriesForTape('gld', '1h')).toBe('KXGOLDH')
    expect(seriesForTape('ng', '15m')).toBe('KXNATGAS15M')
    const saved = setTapeClock(first, 'btc', '5m')
    expect(saved.clocks.btc).toBe('5m')
    expect(saved.clocks.ng).toBe('15m')
    expect(saved.tapes.btc.armFromMin).toBe(8)
    expect(saved.tapes.btc.through).toBe(40)
    expect(loadSettings().clocks.btc).toBe('5m')
    expect(hydrateSettings(loadSettings()).liveBets).toBe(false)
    expect(GOLD_RECIPES.btc).toMatchObject({ armFromMin: 8, through: 40, centLo: 69 })
  })
})

describe('tickets', () => {
  it('refuses ARMING / paper / missing ids as fills', () => {
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'ARMING', contracts: 1, beat: 1 })).toBeNull()
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'paper', contracts: 1, beat: 1 })).toBeNull()
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: '', contracts: 1, beat: 1 })).toBeNull()
  })

  it('shows a ticket only after a real Kalshi order id', () => {
    const t = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-1',
      side: 'up',
      orderId: 'abc12345-real-order',
      contracts: 2,
      beat: 76000,
    })
    expect(t?.orderId).toBe('abc12345-real-order')
    expect(ticketStatus(t)).toBe('UP')
    expect(ticketStatus(undefined)).toBe('WAIT')
  })

  it('does not flip a confirmed ticket back to WAIT', () => {
    const t = makeTicket({
      tape: 'ng',
      ticker: 'KXNATGAS15M-1',
      side: 'down',
      orderId: 'ord-99887766',
      contracts: 1,
      beat: 2.99,
    })
    expect(ticketStatus(t)).toBe('DOWN')
    expect(ticketStatus({ ...t!, side: 'down' })).not.toBe('WAIT')
  })
})

describe('live $ and asks', () => {
  it('reads timeseries last print and never uses strike', () => {
    const print = lastPrintFromLiveData({
      live_data: { details: { timeseries: [{ t: 1, v: 2.99 }, { t: 2, v: 2.99663 }] } },
    })
    expect(print?.px).toBeCloseTo(2.99663)
    expect(print?.source).toBe('kalshi-timeseries')
    expect(lastPrintFromLiveData({ live_data: { details: { floor_strike: 2.99 } } })).toBeNull()
  })

  it('reads BTC candlestick close from live_data', () => {
    const print = lastPrintFromLiveData({
      live_data: { details: { candlesticks: { '1M': [{ open_ts_ms: 1, close: 76537.05 }] } } },
    })
    expect(print?.px).toBeCloseTo(76537.05)
  })

  it('takes YES/NO asks from the same market snapshot', () => {
    const m = { yes_ask_dollars: '0.9400', no_ask_dollars: '0.0700', floor_strike: 2.99 }
    expect(askCentsFromMarket(m, true)).toBe(94)
    expect(askCentsFromMarket(m, false)).toBe(7)
  })

  it('prefers latest live print over a stale 1M candle', () => {
    const print = lastPrintFromLiveData({
      live_data: { details: { last: 76540.12, candlesticks: { '1M': [{ close: 76530 }] } } },
    })
    expect(print?.px).toBeCloseTo(76540.12)
    expect(print?.source).toBe('kalshi-live')
  })

  it('reads 1S candle before 1M', () => {
    const print = lastPrintFromLiveData({
      live_data: { details: { candlesticks: { '1M': [{ close: 76530 }], '1S': [{ close: 76541.5 }] } } },
    })
    expect(print?.px).toBeCloseTo(76541.5)
  })

  it('normalizes live_data seconds into a Kalshi print trail', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const pts = pointsFromLiveData({
      live_data: {
        details: {
          last: 76541.2,
          timeseries: [
            { t: nowSec - 3, v: 76540.1 },
            { t: nowSec - 1, v: 76541.2 },
          ],
        },
      },
    })
    expect(pts[0]?.t).toBeGreaterThan(1e12)
    expect(pts[pts.length - 1]?.px).toBeCloseTo(76541.2)
  })
})

describe('marketTradingActive Soft KEEP open window', () => {
  it('is true for status=active while now < close', () => {
    const now = 1_700_000_000_000
    expect(
      marketTradingActive(
        {
          status: 'active',
          open_time: new Date(now - 5 * 60_000).toISOString(),
          close_time: new Date(now + 8 * 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(true)
    expect(
      marketTradingActive(
        {
          status: 'open',
          open_time: new Date(now - 1 * 60_000).toISOString(),
          close_time: new Date(now + 14 * 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(true)
  })

  it('is false after close even if status still says open', () => {
    const now = 1_700_000_000_000
    expect(
      marketTradingActive(
        {
          status: 'open',
          open_time: new Date(now - 15 * 60_000).toISOString(),
          close_time: new Date(now - 1).toISOString(),
        },
        now,
      ),
    ).toBe(false)
    expect(
      marketTradingActive(
        {
          status: 'closed',
          open_time: new Date(now - 5 * 60_000).toISOString(),
          close_time: new Date(now + 8 * 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(false)
  })

  it('is true for initialized once the window is open, false before it opens', () => {
    const now = 1_700_000_000_000
    expect(
      marketTradingActive(
        {
          status: 'initialized',
          open_time: new Date(now - 1_000).toISOString(),
          close_time: new Date(now + 14 * 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(true)
    expect(
      marketTradingActive(
        {
          status: 'initialized',
          open_time: new Date(now + 60_000).toISOString(),
          close_time: new Date(now + 16 * 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(false)
  })
})

describe('arm / pulse / send tab', () => {
  it('BTC arm window is 8–3 minutes remaining', () => {
    const now = 1_000_000
    const close = now + 5 * 60_000
    expect(inArmWindow(GOLD_RECIPES.btc, close, now)).toBe(true)
    expect(inArmWindow(GOLD_RECIPES.btc, now + 2 * 60_000, now)).toBe(false)
    expect(inArmWindow(GOLD_RECIPES.ng, now + 9 * 60_000, now)).toBe(false)
    expect(inArmWindow(GOLD_RECIPES.ng, now + 7 * 60_000, now)).toBe(true)
    expect(inArmWindow(GOLD_RECIPES.cu, now + 8 * 60_000, now)).toBe(true)
    expect(inArmWindow(GOLD_RECIPES.gld, now + 6 * 60_000, now)).toBe(true)
    expect(inArmWindow(GOLD_RECIPES.gld, now + 2 * 60_000, now)).toBe(false)
  })

  it('three cash gates default OFF; bot+no live cash is PAPER', () => {
    const s = hydrateSettings(null)
    expect(cashGates(s, 'btc').ok).toBe(false)
    expect(cashGates({ ...s, liveBets: true, tapes: { ...s.tapes, gld: { ...s.tapes.gld, botOn: true, liveOn: false } } }, 'gld').ok).toBe(false)
    expect(cashGates({ ...s, liveBets: true, tapes: { ...s.tapes, btc: { ...s.tapes.btc, botOn: true, liveOn: true } } }, 'btc').ok).toBe(true)
  })

  it('pulse is quiet without a live ticket', () => {
    expect(pulseTone(undefined, 76500)).toBe('quiet')
    const t = makeTicket({
      tape: 'btc',
      ticker: 'x',
      side: 'up',
      orderId: 'order-live-1',
      contracts: 1,
      beat: 76500,
    })!
    expect(pulseTone(t, 76540)).toBe('green')
    expect(pulseTone(t, 76400)).toBe('red')
  })

  it('TTL sums the four tape latches', () => {
    const ttl = ttlFromHits({
      asOf: 1,
      events: [],
      tapes: {
        btc: { w: 20, l: 9 },
        ng: { w: 4, l: 0 },
        cu: { w: 5, l: 1 },
        gld: { w: 12, l: 8 },
      },
    })
    expect(ttl).toEqual({ w: 41, l: 18, pct: 69 })
  })

  it('tabIsOpen is true in this visible test runtime', () => {
    expect(tabIsOpen()).toBe(true)
  })

  it('WE THINK is live / 4-min ahead, not strike', () => {
    const now = 10_000_000
    const pair = weThinkPair(
      76537.05,
      76511.91,
      [
        { t: now - 5 * 60_000, px: 76487.55 },
        { t: now, px: 76537.05 },
      ],
      now,
    )
    expect(pair.live).toBeCloseTo(76537.05)
    expect(pair.ahead).toBeCloseTo(76576.65, 0)
    expect(weThink(76537.05, 76511.91, [
      { t: now - 5 * 60_000, px: 76487.55 },
      { t: now, px: 76537.05 },
    ], now)).toBeCloseTo(76576.65, 0)
    expect(formatWeThink('btc', pair.live, pair.ahead)).toMatch(/\$76,537\.05 \/ \$76,576\./)
    expect(formatWeThink('btc', 76537.05, 76511.91)).not.toContain('76,511.91 / 76,511.91')
  })

  it('extracts Kalshi order_id from place payload', () => {
    expect(extractOrderId({ order: { order_id: 'deadbeef-1111-2222' } })).toBe('deadbeef-1111-2222')
    expect(extractOrderId({ order_id: 'short' })).toBeNull()
  })
})

describe('gold race path', () => {
  it('downsamples a scribbled 1s series and zooms Gold around its own BEAT', () => {
    const now = 1_000_000
    const dense = Array.from({ length: 200 }, (_, i) => ({ t: now - (199 - i) * 1000, px: 4358 + (i % 7) * 0.1 }))
    const cleaned = cleanRacePoints(dense, now)
    expect(cleaned.length).toBeLessThanOrEqual(MAX_RACE_DOTS)
    expect(cleaned[cleaned.length - 1]?.px).toBeCloseTo(dense[dense.length - 1]!.px)
    expect(pointTime(1_714_000_000)).toBe(1_714_000_000_000)
    const held = cleanRacePoints([{ t: now - 4000, px: 4358.2 }], now, 15_000)
    expect(held[held.length - 1]?.t).toBe(now)
    expect(held[held.length - 1]?.px).toBeCloseTo(4358.2)
    const trail = mergeRaceTrail([{ t: now - 2000, px: 4358 }], [{ t: now - 1000, px: 4358.4 }], 4358.8, now)
    expect(trail[trail.length - 1]?.px).toBeCloseTo(4358.8)
    const path = raceLinePath(trail, (t) => t / 1000, (px) => px)
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain(' C')
    const hour = Array.from({ length: 40 }, (_, i) => ({ t: now - (39 - i) * 90_000, px: 4358 + i * 0.05 }))
    const hourPts = cleanRacePoints(hour, now, 60 * 60_000)
    expect(hourPts.length).toBeGreaterThan(20)
    expect(cleanRacePoints(hour, now, 15 * 60_000).length).toBeLessThan(hourPts.length)
    const gold = raceDomain('gld', 4358, 4360, cleaned)
    expect(gold.hi - gold.lo).toBeLessThan(40)
    const jagged = [
      { t: now - 3000, px: 4358 },
      { t: now - 2000, px: 4362 },
      { t: now - 1000, px: 4357 },
      { t: now, px: 4358.2 },
    ]
    const drawn = smoothDrawPoints(jagged)
    expect(drawn[0]?.px).toBe(4358)
    expect(drawn[drawn.length - 1]?.px).toBeCloseTo(4358.2)
    expect(drawn[1]!.px).toBeLessThan(4362)
    const btc = raceDomain('btc', 76500, 76540, [{ t: now, px: 76520 }])
    expect(btc.hi - btc.lo).toBeGreaterThan(70)
    const empty = raceDomain('btc', 0, null, [])
    expect(empty.hi).toBeLessThan(2)
    expect(empty.lo).toBe(0)
  })

  it('LIVE chart eases NOW and ticks the wall on rAF — Soft FAIL 250ms hop', async () => {
    const src = await readFile(new URL('../src/components/race-chart.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/export function useSmoothedLive\(live: number \| null, ms = 700\)/)
    expect(src).toMatch(/t - last >= 48/)
    expect(src).toMatch(/requestAnimationFrame\(tick\)/)
    expect(src).toMatch(/displayLive/)
    expect(src).toMatch(/Waiting on this clock/)
    expect(src).toMatch(/if \(target == null \|\| !Number.isFinite\(target\) \|\| target <= 0\) next = cur/)
    expect(src).not.toMatch(/setInterval\(\(\) => setNow\(Date\.now\(\)\), 250\)/)
  })

  it('settlement cost in cents does not inflate spent to dollars', () => {
    const now = Date.now()
    const ev = eventsFromKalshiSettlements(
      {
        settlements: [
          {
            ticker: 'KXBTC15M-CENTS',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost: 72,
            revenue: 100,
            settled_time: new Date(now - 1000).toISOString(),
          },
        ],
      },
      now,
    )
    expect(ev[0]?.spent).toBeCloseTo(0.72)
    expect(ev[0]?.pnl).toBeCloseTo(0.28)
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('NOW is green below TO BEAT and red above — Kalshi chips LIVE/5M/15M/1H', () => {
    expect(nowTone(80935.21, 81005.03)).toBe('up')
    expect(nowTone(81040, 81005.03)).toBe('down')
    expect(nowTone(81005.03, 81005.03)).toBeUndefined()
    expect(formatNowDelta('btc', 80935.21, 81005.03)).toMatch(/−/)
    expect(hydrateChartRange('20m')).toBe('15m')
    expect(hydrateChartRange('10m')).toBe('15m')
    expect(hydrateChartRange('live')).toBe('live')
    expect(hydrateSettings(null).charts.btc).toBe('live')
    expect(hydrateSettings(null).charts.ng).toBe('live')
    expect(hydrateSettings(null).charts.cu).toBe('live')
    expect(hydrateSettings(null).charts.gld).toBe('live')
    const kept = setTapeChart(hydrateSettings(null), 'btc', '15m')
    expect(kept.charts.btc).toBe('15m')
    expect(kept.charts.ng).toBe('live')
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(GOLD_RECIPES.btc.centLo).toBe(69)
    expect(formatBetWindow(Date.parse('2026-09-18T16:45:00-05:00'), 15 * 60_000)).toBe('9/18 4:30–4:45 PM')
    expect(formatBetWindow(Date.parse('2026-09-18T12:11:00-05:00'), 15 * 60_000)).toBe('9/18 11:56 AM–12:11 PM')
  })
})

describe('bets log one scrollbar', () => {
  it('wrap is the only x-scroller — Soft FAIL overflow:auto on the list', async () => {
    const css = await readFile(new URL('../public/desk.css', import.meta.url), 'utf8')
    const dash = await readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8')
    expect(css).toMatch(/\.bets-log-wrap \{[\s\S]*?overflow-x:\s*auto/)
    expect(css).toMatch(/\.bets-log \{[\s\S]*?overflow-x:\s*hidden/)
    expect(css).toMatch(/\.bets-log \{[\s\S]*?overflow-y:\s*auto/)
    expect(css).not.toMatch(/min-width:\s*58rem/)
    expect(css).toMatch(/\.bets-log-scroll/)
    expect(dash).toMatch(/bets-log-scroll/)
    expect(css).not.toMatch(/\.bets-log-row > span\.bets-window \{\s*overflow:\s*visible/)
  })
})

describe('Kalshi-settled 24h latch', () => {
  it('counts W–L from portfolio settlements and does not double a ticker', () => {
    const now = Date.now()
    const ev = eventsFromKalshiSettlements({
      settlements: [
        { ticker: 'KXBTC15M-A', market_result: 'yes', yes_count_fp: '2.00', no_count_fp: '0', settled_time: new Date(now - 1000).toISOString() },
        { ticker: 'KXNATGAS15M-B', market_result: 'no', yes_count_fp: '0', no_count_fp: '1.00', settled_time: new Date(now - 2000).toISOString() },
        { ticker: 'KXBTC15M-A', market_result: 'yes', yes_count_fp: '2.00', no_count_fp: '0', settled_time: new Date(now - 1000).toISOString() },
      ],
    }, now)
    const latch = latchFromEvents(ev, now)
    expect(latch.tapes.btc).toEqual({ w: 1, l: 0 })
    expect(latch.tapes.ng).toEqual({ w: 1, l: 0 })
    const again = mergeHitEvents(latch, ev, now)
    expect(again.tapes.btc.w).toBe(1)
  })

  it('hydrates last-24h fills from portfolio shapes Kalshi actually sends', () => {
    const now = Date.now()
    const ev = eventsFromKalshiSettlements({
      data: {
        settlements: [
          { ticker: 'KXBTC15M-A', market_result: 'yes', yes_count: 2, no_count: 0, settled_ts: Math.floor((now - 1000) / 1000) },
          { ticker: 'KXNATGAS15M-B', result: 'no', no_count_fp: '1.00', settled_time: new Date(now - 2000).toISOString() },
          { ticker: 'KXCOPPER15M-OPEN', market_result: 'yes', yes_count: 1, settled_time: new Date(now + 60_000).toISOString() },
        ],
      },
    }, now)
    const latch = latchFromEvents(ev, now)
    expect(latch.tapes.btc.w + latch.tapes.ng.w).toBeGreaterThan(0)
    expect(ttlFromHits(latch).w + ttlFromHits(latch).l).toBeGreaterThan(0)
  })

  it('keeps a stored bot ON and live-cash OFF unless stored true', () => {
    const s = hydrateSettings({
      liveBets: false,
      tapes: { btc: { contracts: 2, botOn: true } },
    })
    expect(s.liveBets).toBe(false)
    expect(s.tapes.btc.botOn).toBe(true)
    expect(s.tapes.btc.liveOn).toBe(false)
  })

  it('boot hydrate writes tape 24H chips from portfolio settlements', () => {
    const now = Date.now()
    const hits = hydrateHitsFromKalshiCash(
      {
        settlements: [
          {
            ticker: 'KXBTC15M-BOOT',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            settled_time: new Date(now - 1000).toISOString(),
          },
        ],
      },
      emptyHits(),
      now,
    )
    expect(hits.tapes.btc.w).toBe(1)
    expect(hitPct(hits.tapes.btc)).toBe(100)
    const desk = hydrateCashFromKalshi({
      cash: 200,
      deposits: { deposits: [{ amount_dollars: 760 }] },
      settlements: {
        settlements: [
          {
            ticker: 'KXNATGAS15M-BOOT',
            market_result: 'no',
            yes_count_fp: '0',
            no_count_fp: '1',
            settled_time: new Date(now - 2000).toISOString(),
          },
        ],
      },
    })
    expect(desk.cash.cash).toBe(200)
    expect(desk.hits.tapes.ng.w).toBe(1)
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('P&L vs deposits reads cents deposits and first deposit time', () => {
    const now = Date.now()
    const desk = hydrateCashFromKalshi({
      cash: 293.37,
      deposits: {
        deposits: [
          { amount: 76000, created_ts: Math.floor((now - 40 * 86400000) / 1000) },
        ],
      },
    })
    expect(desk.cash.deposits).toBeCloseTo(760)
    expect(desk.cash.pnl).toBeCloseTo(293.37 - 760)
    const official = hydrateCashFromKalshi({
      cash: 263,
      deposits: {
        deposits: [{ amount_cents: 76000, status: 'applied', created_ts: Math.floor((now - 40 * 86400000) / 1000) }],
      },
    })
    expect(official.cash.deposits).toBe(760)
    expect(official.cash.pnl).toBe(-497)
    expect(desk.cash.firstDepositAt).toBeGreaterThan(0)
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(GOLD_RECIPES.btc.centLo).toBe(69)
  })

  it('paper ticket books without a Kalshi POST id prefix', () => {
    const t = makePaperTicket({ tape: 'btc', ticker: 'KXBTC15M-PAPER', side: 'up', contracts: 1, beat: 80000 })
    expect(t?.orderId.startsWith('deskfill-')).toBe(true)
    expect(t?.orderId).not.toMatch(/^paper/i)
    expect(hydrateSettings(null).tapes.btc.liveOn).toBe(false)
  })

  it('Last 24H strip uses settlement spent / P&L when the phone book is empty', () => {
    const now = Date.now()
    const ev = eventsFromKalshiSettlements(
      {
        settlements: [
          {
            ticker: 'KXBTC15M-CASH',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost_dollars: 0.72,
            revenue_dollars: 1,
            settled_time: new Date(now - 1000).toISOString(),
          },
          {
            ticker: 'KXGOLD15M-CASH',
            market_result: 'yes',
            yes_count_fp: '0',
            no_count_fp: '1',
            no_total_cost_dollars: 0.4,
            revenue_dollars: 0,
            settled_time: new Date(now - 2000).toISOString(),
          },
        ],
      },
      now,
    )
    const hits = latchFromEvents(ev, now)
    const strip = last24hBets(emptyFinance(), hits, now)
    expect(strip.w).toBe(1)
    expect(strip.l).toBe(1)
    expect(strip.placed).toBeCloseTo(1.12)
    expect(strip.pnl).toBeCloseTo(-0.12)
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('drops settlements older than 24h', () => {
    const now = Date.now()
    const ev = eventsFromKalshiSettlements({
      settlements: [
        { ticker: 'KXGOLD15M-OLD', market_result: 'yes', yes_count_fp: '1', no_count_fp: '0', settled_time: new Date(now - 25 * 60 * 60 * 1000).toISOString() },
      ],
    }, now)
    expect(ev).toEqual([])
  })
})
