import { generateKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { V2_EVENTS_ORDERS, placeContract, v2EventsOrderBody } from '../src/lib/kalshi-trade.server'
import {
  emptyFinance,
  financeSendsOrders,
  HIT_FLOOR,
  last24hBets,
  liveArmGate,
  liveSendGate,
} from '../src/lib/finance'
import {
  DEFAULT_SETTINGS,
  GOLD_RECIPES,
  TAPE_IDS,
  cashGates,
  claimSend,
  eventsFromKalshiSettlements,
  extractOrderId,
  hydrateSettings,
  latchFromEvents,
  makeTicket,
  mergeHitEvents,
  tabIsOpen,
  ticketStatus,
  ttlFromHits,
} from '../src/lib/tapes'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QC0 defaults Soft FAIL Live / live-cash ON', () => {
  it('defaults and hydrate stay Live OFF and every tape live-cash OFF', () => {
    const s = hydrateSettings(null)
    expect(s.liveBets).toBe(false)
    expect(DEFAULT_SETTINGS.liveBets).toBe(false)
    for (const id of TAPE_IDS) {
      expect(s.tapes[id].liveOn).toBe(false)
      expect(DEFAULT_SETTINGS.tapes[id].liveOn).toBe(false)
      expect(GOLD_RECIPES[id].liveOn).toBe(false)
      expect(cashGates(s, id).ok).toBe(false)
    }
  })

  it('Confirm LIVE without keys / paper / cash stays OFF', () => {
    const gate = liveArmGate(emptyFinance(), { cash: null, deposits: null, hasKeys: false })
    expect(gate.ok).toBe(false)
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(HIT_FLOOR).toBe(83)
  })
})

describe('QC2 wires', () => {
  it('quotes poll + send require an OPEN tab — Soft FAIL hidden-tab-only', async () => {
    const dash = await readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8')
    expect(dash).toMatch(/refetchInterval:\s*\(q\)\s*=>\s*boardPollMs\(q\.state\.data\)/)
    expect(dash).toMatch(/boardPollMs/)
    expect(dash).toMatch(/nextBoardRolloverWait/)
    expect(dash).toMatch(/holdTapeQuote/)
    expect(dash).toMatch(/quoteIsLiveClock/)
    expect(dash).toMatch(/runAutoAnalyst/)
    expect(dash).toMatch(/isRehabPaper/)
    expect(dash).toMatch(/getTapePaths/)
    expect(dash).toMatch(/getDeskBriefs/)
    expect(dash).toMatch(/queryKey: \['desk-briefs'/)
    expect(dash).toMatch(/inArmWindow\(recipe/)
    expect(dash).toMatch(/hitFloorGate/)
    expect(dash).toMatch(/getDeskBoard\(\{ data: \{ clocks: settings\.clocks \} \}\)/)
    expect(dash).toMatch(/latchDeskBoard/)
    expect(dash).toMatch(/holdLiveEvents/)
    expect(dash).toMatch(/loadHeldBoard/)
    expect(dash).toMatch(/saveHeldBoard/)
    expect(dash).toMatch(/quoteHasClock/)
    expect(dash).toMatch(/refetchOnWindowFocus:\s*false/)
    expect(dash).toMatch(/getLivePrints/)
    expect(dash).toMatch(/mergeLiveOntoBoard/)
    expect(dash).toMatch(/refetchInterval:\s*LIVE_PRINT_MS/)
    expect(dash).toMatch(/liveEventKey/)
    expect(dash).not.toMatch(/queryKey: \['live-prints', liveEvents, settings\.charts\][\s\S]{0,80}fetchedAt/)
    const data = await readFile(new URL('../src/lib/btc-data.ts', import.meta.url), 'utf8')
    expect(data).toMatch(/export const getLivePrints/)
    expect(data).toMatch(/export const getDeskBriefs/)
    expect(data).toMatch(/hostLivePlaceGate/)
    expect(data).toMatch(/readDeskState/)
    expect(data).not.toMatch(/liveBets === true/)
    const panel = await readFile(new URL('../src/components/analyst-panel.tsx', import.meta.url), 'utf8')
    expect(panel).toMatch(/buildDeskBrief/)
    expect(panel).toMatch(/analyst-report/)
    expect(panel).toMatch(/desk chief/)
    expect(panel).toMatch(/Current rules/)
    expect(panel).toMatch(/Proposed/)
    expect(panel).toMatch(/Profit dollars/)
    expect(panel).not.toMatch(/liveBets:\s*true/)
    expect(dash).not.toMatch(/data-testid="live-bets"/)
    expect(dash).not.toMatch(/data-testid="live-banner"/)
    expect(dash).not.toMatch(/data-testid="confirm-live"/)
    expect(dash).not.toMatch(/setLiveBets/)
    expect(dash).not.toMatch(/liveBets:\s*settings\.liveBets/)
    expect(dash).toMatch(/WINDOW · CLOCK · MODE · CASH/)
    expect(dash).toMatch(/this desk LIVE walks CASH/)
    expect(dash).toMatch(/bets-cash-head/)
    expect(dash).toMatch(/liveBotCall/)
    expect(dash).toMatch(/Live cash OFF — paper only, not sent to Kalshi/)
    expect(dash).toMatch(/Bot ON \+ Live cash ON posts to Kalshi/)
    expect(dash).toMatch(/disabled=\{rehabPaper\}/)
    expect(dash).toMatch(/Hit percent/)
    expect(dash).toMatch(/hits\.w\}W–\{hits\.l\}L/)
    expect(dash).toMatch(/tapeHitCell/)
    expect(dash).toMatch(/setAnalystOpen\] = useState\(true\)/)
    expect(dash).toMatch(/if \(!tabIsOpen\(\)\)/)
    expect(dash).toMatch(/if \(!board \|\| !tabIsOpen\(\) \|\| book\.killed\) return/)
    expect(tabIsOpen()).toBe(true)

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { hidden: true, visibilityState: 'hidden' },
    })
    expect(tabIsOpen()).toBe(false)
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { hidden: false, visibilityState: 'visible' },
    })
    expect(tabIsOpen()).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { document?: unknown }).document
  })

  it('Hit% hydrates from Kalshi settlements only — open clocks stay 0', () => {
    const now = Date.now()
    const open = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-OPEN-QC',
      side: 'up',
      orderId: 'ord-open-qc-ticket',
      contracts: 1,
      beat: 76000,
    })!
    const openLatch = latchFromEvents([], now)
    expect(ttlFromHits(openLatch)).toEqual({ w: 0, l: 0, pct: 0 })
    const ev = eventsFromKalshiSettlements(
      {
        settlements: [
          {
            ticker: 'KXBTC15M-WIN',
            market_result: 'yes',
            yes_count_fp: '2',
            no_count_fp: '0',
            settled_time: new Date(now - 1000).toISOString(),
          },
          {
            ticker: 'KXCOPPER15M-LOSS',
            market_result: 'yes',
            yes_count_fp: '0',
            no_count_fp: '1',
            settled_time: new Date(now - 2000).toISOString(),
          },
        ],
      },
      now,
    )
    const latch = mergeHitEvents(openLatch, ev, now)
    expect(latch.tapes.btc.w).toBe(1)
    expect(latch.tapes.cu.l).toBe(1)
    expect(ttlFromHits(latch)).toEqual({ w: 1, l: 1, pct: 50 })
    expect(ticketStatus(open)).toBe('UP')
  })

  it('cash / P&L first-paint is balance+deposits — Soft FAIL wait for Settings / settlements', async () => {
    const src = await readFile(new URL('../src/lib/btc-data.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/export const getKalshiBalance/)
    expect(src).toMatch(/loadKalshiHostCreds/)
    expect(src).toMatch(/fetchBalance/)
    expect(src).toMatch(/fetchDeposits/)
    expect(src).toMatch(/fetchSettlements/)
    expect(src).toMatch(/fetchFills/)
    expect(src).toMatch(/fetchPositions/)
    expect(src).toMatch(/return \{ \.\.\.bal, deposits, hostCreds: true \}/)
    expect(src).toMatch(/return \{ \.\.\.bal, deposits, settlements, fills, positions, hostCreds: true \}/)
    expect(src).not.toMatch(/validator\(\(d: \{ keyId: string; pem: string \}\) => d\)/)
    const balStart = src.indexOf('export const getKalshiBalance')
    const cashStart = src.indexOf('export const getKalshiCash')
    const balFn = src.slice(balStart, cashStart)
    expect(balFn).not.toMatch(/fetchSettlements/)
    expect(balFn).not.toMatch(/fetchFills/)
    expect(balFn).not.toMatch(/fetchPositions/)
    expect(balStart).toBeGreaterThan(-1)
    expect(balStart).toBeLessThan(cashStart)
    const dash = await readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8')
    expect(dash).toMatch(/applyCashAndSettlements/)
    expect(dash).toMatch(/hydrateCashFromKalshi/)
    expect(dash).toMatch(/void getKalshiBalance\(\)/)
    expect(dash).toMatch(/void getKalshiCash\(\)/)
    expect(dash).not.toMatch(/keyId: nextKey/)
    expect(dash).not.toMatch(/pem: nextPem/)
    expect(dash).not.toMatch(/if \(nextKey && nextPem\)/)
    expect(dash).toMatch(/queryKey: \['kalshi-cash-hits'/)
    expect(dash).toMatch(/queryKey: \['kalshi-balance'/)
    expect(dash).toMatch(/quote\.tradingActive === false/)
    const boot = dash.slice(dash.indexOf('useLayoutEffect'), dash.indexOf('const boardQuery'))
    expect(boot.indexOf('getKalshiBalance')).toBeGreaterThan(-1)
    expect(boot.indexOf('getKalshiBalance')).toBeLessThan(boot.indexOf('getKalshiCash'))
    expect(dash).not.toMatch(/grok\.me/)
    const quote = await readFile(new URL('../src/lib/kalshi.server.ts', import.meta.url), 'utf8')
    expect(quote).toMatch(/\/markets\/\$\{/)
    expect(quote).toMatch(/marketTradingActive/)
    expect(quote).not.toMatch(/String\(m\.status \?\? 'open'\) === 'open'/)
    expect(quote).not.toMatch(/grok\.me/)
  })

  it('independent per-tape send claims — one tape cannot starve another', () => {
    const map: Record<string, { at: number; tries: number; filled?: string }> = {}
    const now = 9_000_000
    expect(claimSend(map, 'btc:KXBTC15M-QC', now)).toBe('send')
    expect(claimSend(map, 'ng:KXNATGAS15M-QC', now)).toBe('send')
    expect(claimSend(map, 'cu:KXCOPPER15M-QC', now)).toBe('send')
    expect(claimSend(map, 'gld:KXGOLD15M-QC', now)).toBe('send')
    expect(claimSend(map, 'btc:KXBTC15M-QC', now)).toBe('skip')
    expect(Object.keys(map)).toEqual([
      'btc:KXBTC15M-QC',
      'ng:KXNATGAS15M-QC',
      'cu:KXCOPPER15M-QC',
      'gld:KXGOLD15M-QC',
    ])
  })

  it('ticket only with a real order_id — Soft FAIL ARMING fake fill', () => {
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'ARMING', contracts: 1, beat: 1 })).toBeNull()
    expect(makeTicket({ tape: 'btc', ticker: 'KXBTC15M-1', side: 'up', orderId: 'armed', contracts: 1, beat: 1 })).toBeNull()
    expect(extractOrderId({ order: { order_id: 'ARMING' } })).toBeNull()
    const ok = makeTicket({
      tape: 'btc',
      ticker: 'KXBTC15M-1',
      side: 'down',
      orderId: 'ord-kalshi-qc-fill-01',
      contracts: 1,
      beat: 76000,
    })
    expect(ok?.orderId).toBe('ord-kalshi-qc-fill-01')
    expect(ticketStatus(ok)).toBe('DOWN')
  })
})

describe('QC3 live-cash READY dry-run — Soft FAIL real POST', () => {
  it('V2 body: UP yes_ask bid, DOWN ask=1-noAsk, STP, sticky client_order_id', () => {
    const id = 'sticky-qc-client-order-01'
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
    expect(up.time_in_force).toBe('immediate_or_cancel')
  })

  it('placeContract source posts first-legal-print immediately — no book/position GET first', async () => {
    const src = await readFile(new URL('../src/lib/kalshi-trade.server.ts', import.meta.url), 'utf8')
    const start = src.indexOf('export async function placeContract')
    const fn = src.slice(start)
    expect(fn).toMatch(/signed\(args\.keyId, args\.pem, 'POST', V2_EVENTS_ORDERS, body\)/)
    expect(fn).not.toMatch(/portfolio\/positions/)
    expect(fn).not.toMatch(/portfolio\/orders\?/)
    expect(fn).not.toMatch(/fetchBalance/)
    expect(fn).not.toMatch(/fetchSettlements/)
    expect(src.indexOf('export async function fetchBalance')).toBeLessThan(start)
  })

  it('mocked first print POSTs events/orders only — never hits live Kalshi', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const calls: { method: string; url: string }[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string, init?: { method?: string }) => {
        const method = init?.method || 'GET'
        calls.push({ method, url: String(url) })
        if (String(url).includes('external-api.kalshi.com') && method === 'POST') {
          return {
            ok: true,
            text: async () => JSON.stringify({ order: { order_id: 'ord-dry-run-fill-01' } }),
          }
        }
        throw new Error('Soft FAIL unexpected live path ' + method + ' ' + url)
      },
    )
    const raw = await placeContract({
      keyId: 'dry-run-key',
      pem,
      ticker: 'KXBTC15M-DRY',
      side: 'down',
      count: 1,
      yesAsk: 70,
      noAsk: 31,
      clientOrderId: 'sticky-dry-run-client-01',
    })
    expect(extractOrderId(raw)).toBe('ord-dry-run-fill-01')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('https://external-api.kalshi.com/trade-api/v2/portfolio/events/orders')
    expect(calls.some((c) => /positions|portfolio\/orders\?|portfolio\/balance/.test(c.url))).toBe(false)
    expect(calls.filter((c) => c.method === 'GET')).toEqual([])
  })

  it('finance never sends and liveSendGate sits without the three cash gates', () => {
    expect(() => financeSendsOrders()).toThrow(/must not send/i)
    const s = hydrateSettings(null)
    expect(cashGates(s, 'btc').ok).toBe(false)
    const blocked = liveSendGate(emptyFinance(), {
      tape: 'btc',
      ticker: 'KXBTC15M-1',
      ask: 72,
      cash: 10,
      deposits: 100,
      spent: 0.72,
    })
    expect(blocked.ok).toBe(false)
  })

  it('24H strip filter still splits placed / W–L / P&L', () => {
    const now = Date.now()
    const hits = { tapes: { btc: { w: 0, l: 0 }, ng: { w: 0, l: 0 }, cu: { w: 0, l: 0 }, gld: { w: 0, l: 0 } } }
    const state = {
      ...emptyFinance(),
      bets: [
        {
          betId: 'bet_btc',
          tape: 'btc' as const,
          ticker: 'KXBTC15M-A',
          clock: '9:00 PM',
          closeAt: now,
          side: 'up' as const,
          count: 1,
          ask: 70,
          spent: 10,
          orderId: 'ord-btc-qc-aaaa',
          status: 'settled' as const,
          pnl: 5,
          filledAt: now - 1000,
          settledAt: now,
        },
        {
          betId: 'bet_gld',
          tape: 'gld' as const,
          ticker: 'KXGOLD15M-A',
          clock: '9:00 PM',
          closeAt: now,
          side: 'down' as const,
          count: 1,
          ask: 40,
          spent: 4,
          orderId: 'ord-gld-qc-bbbb',
          status: 'settled' as const,
          pnl: -4,
          filledAt: now - 2000,
          settledAt: now,
        },
      ],
    }
    expect(last24hBets(state, hits, now, ['gld']).placed).toBeCloseTo(4)
    expect(last24hBets(state, hits, now, ['gld']).l).toBe(1)
    expect(last24hBets(state, hits, now).placed).toBeCloseTo(14)
  })
})

describe('QC Windows host start Soft FAIL hop off 8080', () => {
  it('pins Vite to 8080 and starts with npm.cmd', async () => {
    const pkg = await readFile(new URL('../package.json', import.meta.url), 'utf8')
    expect(pkg).toMatch(/node desk-host\.mjs/)
    const host = await readFile(new URL('../desk-host.mjs', import.meta.url), 'utf8')
    expect(host).toMatch(/PUBLIC_PORT/)
    expect(host).toMatch(/splashHtml/)
    expect(host).toMatch(/ALIAS_PORT/)
    expect(host).toMatch(/ALIAS_PORTS/)
    expect(host).toMatch(/18081/)
    expect(host).toMatch(/18082/)
    expect(host).toMatch(/12783/)
    expect(host).toMatch(/DESK_URL/)
    expect(host).toMatch(/hushViteLine/)
    expect(host).toMatch(/viteEntry/)
    expect(host).toMatch(/vite\.js/)
    expect(host).not.toMatch(/shell:\s*process\.platform === 'win32'/)
    expect(host).toMatch(/createAliasHost/)
    expect(host).toMatch(/rewritePublicLocation/)
    expect(host).toMatch(/listTailscaleDeskUrls/)
    const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
    expect(vite).toMatch(/strictPort:\s*true/)
    expect(vite).toMatch(/customLogger/)
    expect(vite).toMatch(/Local\|Network/)
    const start = await readFile(new URL('../../start-desk.bat', import.meta.url), 'utf8')
    expect(start).toMatch(/npm\.cmd run dev/)
    expect(start).toMatch(/127\.0\.0\.1:8080/)
    expect(start).toMatch(/free-desk-ports/)
    expect(host).toMatch(/reclaimDeskPort/)
    const update = await readFile(new URL('../../update-desk.bat', import.meta.url), 'utf8')
    expect(update).toMatch(/FETCH_HEAD/)
    expect(update).toMatch(/reset --hard FETCH_HEAD/)
    expect(update).toMatch(/HUB_DESK_START/)
    expect(update).toMatch(/free-desk-ports/)
    expect(update).toMatch(/--no-fund/)
    expect(update).not.toMatch(/git checkout -B %BRANCH% origin\/%BRANCH%/)
    const free = await readFile(new URL('../../free-desk-ports.ps1', import.meta.url), 'utf8')
    expect(free).toMatch(/8080/)
    expect(free).toMatch(/Stop-Process/)
    expect(free).toMatch(/desk-host\\.mjs/)
    const hub = await readFile(new URL('../../UPDATE-HUB.txt', import.meta.url), 'utf8')
    expect(hub).toMatch(/cd C:\\Users\\Cory\\Developer\\HubPrediction-iOS; \.\\update-desk\.bat/)
    expect(hub).not.toMatch(/HubPrediction-iOS & update-desk/)
    expect(hub).toMatch(/Our own tunnel/)
    expect(hub).toMatch(/PHONE \/ iPAD/)
    expect(hub).not.toMatch(/One-time Tailscale/)
    expect(vite).not.toMatch(/host:\s*'127\.0\.0\.1'/)
    expect(start).toMatch(/10\.77\.0\.1:8080/)
    const tunnel = await readFile(new URL('../desk-tunnel.mjs', import.meta.url), 'utf8')
    expect(tunnel).toMatch(/TUNNEL_DESK_IP/)
    expect(tunnel).toMatch(/51820/)
    const bat = await readFile(new URL('../../start-tunnel.bat', import.meta.url), 'utf8')
    expect(bat).toMatch(/desk-tunnel\.mjs/)
    expect(bat).toMatch(/UDP 51820/)
    expect(bat).not.toMatch(/tailscale (up|login|ip)/i)
  })
})
