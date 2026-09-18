import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBalance,
  fetchDeposits,
  loadKalshiHostCreds,
  resetKalshiHostCredsForTests,
  signRequestPath,
} from '../src/lib/kalshi-trade.server'
import { eventsFromKalshiSettlements, hydrateCashFromKalshi, hydrateSettings } from '../src/lib/tapes'
import { emptyFinance, last24hBets } from '../src/lib/finance'

const ENV_KEYS = [
  'KALSHI_KEY_ID',
  'KALSHI_PRIVATE_KEY',
  'KALSHI_PEM',
  'KALSHI_PRIVATE_KEY_PEM',
  'KALSHI_KEY_ID_FILE',
  'KALSHI_PEM_FILE',
  'KALSHI_PRIVATE_KEY_FILE',
  'KALSHI_SECRETS_DIR',
] as const

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
  resetKalshiHostCredsForTests()
}

afterEach(() => {
  clearEnv()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

function testPem() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
}

describe('Windows-host Kalshi creds — Soft FAIL browser PEM', () => {
  it('reads key id + PEM from env and never requires localStorage', async () => {
    const pem = testPem()
    process.env.KALSHI_KEY_ID = 'host-env-key'
    process.env.KALSHI_PRIVATE_KEY = pem
    resetKalshiHostCredsForTests()
    const creds = loadKalshiHostCreds()
    expect(creds?.keyId).toBe('host-env-key')
    expect(creds?.pem).toMatch(/BEGIN (?:RSA )?PRIVATE KEY/)
    expect(hydrateSettings(null).liveBets).toBe(false)
  })

  it('reads gitignored .secrets files via KALSHI_SECRETS_DIR', async () => {
    const pem = testPem()
    const dir = await mkdtemp(join(tmpdir(), 'hub-kalshi-secrets-'))
    try {
      await writeFile(join(dir, 'kalshi_key_id.txt'), 'host-file-key\n', 'utf8')
      await writeFile(join(dir, 'kalshi_key.pem'), pem, 'utf8')
      process.env.KALSHI_SECRETS_DIR = dir
      resetKalshiHostCredsForTests()
      const creds = loadKalshiHostCreds()
      expect(creds?.keyId).toBe('host-file-key')
      expect(creds?.pem).toMatch(/BEGIN (?:RSA )?PRIVATE KEY/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null without host files — cash stays — , Live stays OFF', () => {
    clearEnv()
    expect(loadKalshiHostCreds()).toBeNull()
    expect(hydrateSettings(null).liveBets).toBe(false)
    expect(hydrateSettings(null).tapes.btc.liveOn).toBe(false)
  })

  it('host fetchBalance paints cash from GET /portfolio/balance', async () => {
    const pem = testPem()
    process.env.KALSHI_KEY_ID = 'host-env-key'
    process.env.KALSHI_PRIVATE_KEY = pem
    resetKalshiHostCredsForTests()
    const creds = loadKalshiHostCreds()
    expect(creds).not.toBeNull()
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        expect(String(url)).toBe('https://external-api.kalshi.com/trade-api/v2/portfolio/balance')
        return {
          ok: true,
          text: async () => JSON.stringify({ balance_dollars: 293.37 }),
        }
      },
    )
    const bal = await fetchBalance(creds!.keyId, creds!.pem)
    expect(bal.cash).toBe(293.37)
  })

  it('signs deposits / fills / settlements without the query string', async () => {
    expect(signRequestPath('/trade-api/v2/portfolio/deposits?limit=200')).toBe('/trade-api/v2/portfolio/deposits')
    expect(signRequestPath('/trade-api/v2/portfolio/fills?limit=200&cursor=abc')).toBe('/trade-api/v2/portfolio/fills')
    expect(signRequestPath('/trade-api/v2/portfolio/balance')).toBe('/trade-api/v2/portfolio/balance')
    const pem = testPem()
    process.env.KALSHI_KEY_ID = 'host-env-key'
    process.env.KALSHI_PRIVATE_KEY = pem
    resetKalshiHostCredsForTests()
    const creds = loadKalshiHostCreds()
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        urls.push(String(url))
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              deposits: [{ amount_cents: 76000, status: 'applied', created_ts: 1_700_000_000 }],
            }),
        }
      },
    )
    const dep = await fetchDeposits(creds!.keyId, creds!.pem)
    expect(urls[0]).toContain('/trade-api/v2/portfolio/deposits?limit=200')
    expect((dep as { deposits: unknown[] }).deposits).toHaveLength(1)
  })

  it('settlements hydrate cash + 24H chips without a phone book', () => {
    const now = Date.now()
    const desk = hydrateCashFromKalshi({
      cash: 293.37,
      deposits: { deposits: [{ amount_dollars: 760 }] },
      settlements: {
        settlements: [
          {
            ticker: 'KXBTC15M-HOST',
            market_result: 'yes',
            yes_count_fp: '1',
            no_count_fp: '0',
            yes_total_cost_dollars: 0.69,
            revenue_dollars: 1,
            settled_time: new Date(now - 1000).toISOString(),
          },
        ],
      },
    })
    expect(desk.cash.cash).toBe(293.37)
    expect(desk.cash.pnl).toBeCloseTo(293.37 - 760)
    expect(desk.hits.tapes.btc.w).toBe(1)
    const strip = last24hBets(emptyFinance(), desk.hits, now)
    expect(strip.w).toBe(1)
    expect(strip.placed).toBeCloseTo(0.69)
    expect(strip.pnl).toBeCloseTo(0.31)
    expect(eventsFromKalshiSettlements({ settlements: [] })).toEqual([])
  })

  it('server fns keep PEM on the host — Soft FAIL send to the browser', async () => {
    const src = await readFile(new URL('../src/lib/btc-data.ts', import.meta.url), 'utf8')
    const dash = await readFile(new URL('../src/components/dashboard.tsx', import.meta.url), 'utf8')
    const ignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8')
    expect(src).toMatch(/createServerFn\(\{ method: 'GET' \}\)\.handler/)
    expect(src).toMatch(/loadKalshiHostCreds/)
    expect(src).toMatch(/placeContract\(\{ \.\.\.data, keyId: creds\.keyId, pem: creds\.pem \}\)/)
    expect(dash).not.toMatch(/pem:/)
    expect(dash).not.toMatch(/KEY_PEM/)
    expect(dash).toMatch(/getKalshiBalance\(\)/)
    expect(dash).toMatch(/getKalshiCash\(\)/)
    expect(dash).toMatch(/charts: defaultChartRanges\(\)/)
    expect(dash).toMatch(/mergeKalshiHistoryToBook/)
    expect(dash).toMatch(/label="P&L"/)
    expect(dash).toMatch(/cash\.pnl != null \? formatPnl\(cash\.pnl\) : '—'/)
    expect(dash).not.toMatch(/deposits pending/)
    const trade = await readFile(new URL('../src/lib/kalshi-trade.server.ts', import.meta.url), 'utf8')
    expect(trade).toMatch(/timestamp \+ method \+ signRequestPath\(path\)/)
    expect(trade).toMatch(/export async function fetchFills/)
    expect(trade).toMatch(/export async function fetchPositions/)
    expect(ignore).toMatch(/\.secrets\//)
    expect(ignore).toMatch(/\*\.pem/)
  })
})
