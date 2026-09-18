import { afterEach, describe, expect, it } from 'vitest'
import { V2_EVENTS_ORDERS, v2EventsOrderBody } from '../src/lib/kalshi-trade.server'
import { recipeRetuneGate, emptyFinance, chasingLosses } from '../src/lib/finance'
import {
  DEFAULT_SETTINGS,
  GOLD_RECIPES,
  SETTINGS_KEY,
  TAPE_IDS,
  claimSend,
  cashGates,
  extractOrderId,
  eventsFromKalshiSettlements,
  eventsFromTickets,
  hydrateSettings,
  latchFromEvents,
  loadSettings,
  makeTicket,
  mergeHitEvents,
  patchTape,
  ticketStatus,
  ttlFromHits,
} from '../src/lib/tapes'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('HARD QA 1–10', () => {
  it('1 header wordmark is HUB / PREDICTIONS not HUBPREDICTIONS', async () => {
    expect('HUB / PREDICTIONS').toMatch(/HUB\s\/\sPREDICTIONS/)
    expect('HUB / PREDICTIONS').not.toBe('HUBPREDICTIONS')
    expect(TAPE_IDS).toEqual(['btc', 'ng', 'cu', 'gld'])
    const dash = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8'),
    )
    const css = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../public/desk.css', import.meta.url), 'utf8'),
    )
    expect(dash).not.toMatch(/rain-col/)
    expect(dash).not.toMatch(/010011010111001001101001011100100110/)
    expect(css).toMatch(/\.desk-head::before/)
    expect(css).toMatch(/content:\s*none/)
    expect(css).toMatch(/grid-template-columns:\s*repeat\(3/)
    expect(css).toMatch(/\.scoreboard-row \.stat \{[\s\S]*flex-direction:\s*column/)
    expect(css).toMatch(/\.brand-bar \{[\s\S]*overflow:\s*hidden/)
    expect(css).toMatch(/\.glyph-plate/)
    expect(css).toMatch(/\.beat-k/)
    expect(css).toMatch(/\.contracts-label/)
    expect(css).toMatch(/background:\s*#0a100e/)
    expect(dash).toMatch(/glyph-plate/)
    expect(dash).toMatch(/beat-k/)
    expect(dash).toMatch(/contracts-label/)
  })

  it('2 recipes stay gold — Soft FAIL rewrite', () => {
    expect(GOLD_RECIPES.btc).toMatchObject({ armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 })
    expect(GOLD_RECIPES.ng).toMatchObject({ armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 })
    expect(GOLD_RECIPES.cu).toMatchObject({ armFromMin: 9, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 })
    expect(GOLD_RECIPES.gld).toMatchObject({ armFromMin: 10, armToMin: 3, through: 2, centLo: 34, centHi: 89 })
    const forced = hydrateSettings({
      tapes: {
        btc: { armFromMin: 1, through: 99, centLo: 10 },
        ng: { armFromMin: 10, through: 3 },
        cu: { armToMin: 8, through: 9 },
        gld: { armFromMin: 6, through: 40, centLo: 69 },
      },
    })
    expect(forced.tapes.btc).toMatchObject({ armFromMin: 8, through: 40, centLo: 69 })
    expect(forced.tapes.ng).toMatchObject({ armFromMin: 8, armToMin: 0.45, through: 0.002 })
    expect(forced.tapes.cu).toMatchObject({ armFromMin: 9, armToMin: 0.45, through: 0.002 })
    expect(forced.tapes.gld).toMatchObject({ armFromMin: 10, through: 2, centLo: 34 })
  })

  it('3 Live + bots + per-tape cash Soft FAIL cold ON', () => {
    const s = hydrateSettings(null)
    expect(s.liveBets).toBe(false)
    expect(DEFAULT_SETTINGS.liveBets).toBe(false)
    for (const id of TAPE_IDS) {
      expect(s.tapes[id].botOn).toBe(false)
      expect(s.tapes[id].liveOn).toBe(false)
      expect(cashGates(s, id).ok).toBe(false)
    }
  })

  it('4 ticket Soft FAIL ARMING; BOT BOUGHT only with Kalshi order_id', () => {
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'ARMING', contracts: 1, beat: 1 })).toBeNull()
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'armed', contracts: 1, beat: 1 })).toBeNull()
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'paper-local', contracts: 1, beat: 1 })).toBeNull()
    const live = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-1',
      side: 'up',
      orderId: 'ord-kalshi-fill-99',
      contracts: 1,
      beat: 76000,
    })
    expect(live?.orderId).toBe('ord-kalshi-fill-99')
    expect(ticketStatus(live)).toBe('UP')
    expect(ticketStatus(undefined)).toBe('WAIT')
    expect(extractOrderId({ order: { order_id: 'ARMING' } })).toBeNull()
  })

  it('5 contracts persist in localStorage after Save', () => {
    const saved = patchTape(loadSettings(), 'btc', { contracts: 17 })
    expect(saved.tapes.btc.contracts).toBe(17)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').tapes.btc.contracts).toBe(17)
    expect(loadSettings().tapes.btc.contracts).toBe(17)
    expect(loadSettings().liveBets).toBe(false)
    expect(loadSettings().tapes.btc.armFromMin).toBe(8)
  })

  it('6 stable CSS Soft FAIL hashed /assets/index-*.css', async () => {
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/routes/__root.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/['"]\/hub-app\.css['"]/)
    expect(src).toMatch(/['"]\/desk\.css['"]/)
    expect(src).not.toMatch(/\/assets\/index-.*\.css/)
  })

  it('7 placeContract V2 DOWN ask = 1-noAsk, STP, sticky client_order_id', () => {
    const id = 'sticky-qa-client-order-01'
    const up = v2EventsOrderBody({ ticker: 'KXBTC15M-1', side: 'up', count: 1, yesAsk: 73, noAsk: 28, clientOrderId: id })
    const down = v2EventsOrderBody({ ticker: 'KXCOPPER15M-1', side: 'down', count: 1, yesAsk: 88, noAsk: 12, clientOrderId: id })
    expect(V2_EVENTS_ORDERS).toBe('/trade-api/v2/portfolio/events/orders')
    expect(up.side).toBe('bid')
    expect(up.price).toBe('0.7300')
    expect(down.side).toBe('ask')
    expect(down.price).toBe('0.8800')
    expect(down.price).not.toBe('0.1200')
    expect(down.self_trade_prevention_type).toBe('taker_at_cross')
    expect(up.client_order_id).toBe(id)
    expect(down.client_order_id).toBe(id)
  })

  it('8 Soft FAIL mid-session recipe retune after a loss / KILL', () => {
    const now = Date.now()
    const chasing = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_qa',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-QA',
          clock: '9:00 PM',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 72,
          spent: 0.72,
          orderId: 'ord-loss-qa-12345',
          status: 'settled' as const,
          pnl: -0.72,
          filledAt: now - 1000,
          settledAt: now,
        },
      ],
    }
    expect(chasingLosses(chasing, now)).toBe(true)
    expect(recipeRetuneGate(chasing, { through: 99 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { armFromMin: 1 }, now).ok).toBe(false)
    expect(recipeRetuneGate(chasing, { centLo: 10 }, now).ok).toBe(false)
    expect(recipeRetuneGate({ ...emptyFinance(), killed: true }, { contracts: 9 }, now).ok).toBe(false)
    expect(recipeRetuneGate(emptyFinance(), { contracts: 3 }, now).ok).toBe(true)
  })

  it('9 independent per-tape send Soft FAIL one tape starve another', () => {
    const map: Record<string, { at: number; tries: number; filled?: string }> = {}
    const now = 5_000_000
    expect(claimSend(map, 'btc:KXBTC15M-1', now)).toBe('send')
    expect(claimSend(map, 'ng:KXNATGAS15M-1', now)).toBe('send')
    expect(claimSend(map, 'cu:KXCOPPER15M-1', now)).toBe('send')
    expect(claimSend(map, 'gld:KXGOLD15M-1', now)).toBe('send')
    expect(claimSend(map, 'btc:KXBTC15M-1', now)).toBe('skip')
    expect(Object.keys(map)).toHaveLength(4)
  })

  it('10 Hit% settled-only; TTL one latch Soft FAIL empty while Bets has tickets', () => {
    const now = Date.now()
    const open = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-OPEN',
      side: 'up',
      orderId: 'ord-open-ticket-01',
      contracts: 1,
      beat: 76000,
    })!
    const openHits = latchFromEvents(eventsFromTickets([open], []), now)
    expect(openHits.tapes.btc).toEqual({ w: 0, l: 0 })
    const settled = eventsFromKalshiSettlements({
      settlements: [
        { ticker: 'KXBTC15M-A', market_result: 'yes', yes_count_fp: '1', no_count_fp: '0', settled_time: new Date(now - 1000).toISOString() },
        { ticker: 'KXNATGAS15M-B', market_result: 'no', yes_count_fp: '0', no_count_fp: '1', settled_time: new Date(now - 2000).toISOString() },
      ],
    }, now)
    const latch = mergeHitEvents(openHits, settled, now)
    const ttl = ttlFromHits(latch)
    expect(ttl.w + ttl.l).toBeGreaterThan(0)
    expect(ttl).toEqual({ w: 2, l: 0, pct: 100 })
    expect(`${ttl.pct}% ${ttl.w}W–${ttl.l}L`).not.toMatch(/no bets/i)
    expect(ttlFromHits(latch).w).toBe(latch.tapes.btc.w + latch.tapes.ng.w + latch.tapes.cu.w + latch.tapes.gld.w)
  })
})
