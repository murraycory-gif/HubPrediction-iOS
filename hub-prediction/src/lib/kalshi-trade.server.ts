import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSign, constants } from 'node:crypto'
import { cashFromBalancePayload } from './size-cash'

const BASE = 'https://external-api.kalshi.com'
const ROOT = '/trade-api/v2'

export type KalshiHostCreds = { keyId: string; pem: string }

let hostCredsCache: KalshiHostCreds | null | undefined

export function resetKalshiHostCredsForTests() {
  hostCredsCache = undefined
}

function readSecretFile(path: string) {
  try {
    if (!path || !existsSync(path)) return ''
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function looksLikePem(v: string) {
  return /BEGIN (?:RSA |EC )?PRIVATE KEY/.test(v)
}

function secretDirs() {
  const libDir = dirname(fileURLToPath(import.meta.url))
  const hubDir = resolve(libDir, '../..')
  const repoDir = resolve(hubDir, '..')
  const cwd = process.cwd()
  return [
    process.env.KALSHI_SECRETS_DIR,
    resolve(cwd, '.secrets'),
    resolve(cwd, '../.secrets'),
    resolve(hubDir, '.secrets'),
    resolve(repoDir, '.secrets'),
    resolve(repoDir, '../.secrets'),
  ].filter((d): d is string => Boolean(d))
}

function readKalshiHostCreds(): KalshiHostCreds | null {
  const envId = String(process.env.KALSHI_KEY_ID ?? '').trim()
  const envPem = String(
    process.env.KALSHI_PRIVATE_KEY ?? process.env.KALSHI_PEM ?? process.env.KALSHI_PRIVATE_KEY_PEM ?? '',
  ).replace(/\\n/g, '\n')
  if (envId && looksLikePem(envPem)) return { keyId: envId, pem: envPem }

  const idFile = String(process.env.KALSHI_KEY_ID_FILE ?? '').trim()
  const pemFile = String(process.env.KALSHI_PEM_FILE ?? process.env.KALSHI_PRIVATE_KEY_FILE ?? '').trim()
  const fromEnvFiles = {
    keyId: readSecretFile(idFile).trim(),
    pem: readSecretFile(pemFile),
  }
  if (fromEnvFiles.keyId && looksLikePem(fromEnvFiles.pem)) return fromEnvFiles

  for (const dir of secretDirs()) {
    const keyId =
      readSecretFile(resolve(dir, 'kalshi_key_id.txt')).trim() ||
      readSecretFile(resolve(dir, 'kalshi_key_id')).trim()
    const pem =
      readSecretFile(resolve(dir, 'kalshi_key.pem')) ||
      readSecretFile(resolve(dir, 'kalshi.pem')) ||
      readSecretFile(resolve(dir, 'kalshi_private_key.pem'))
    if (keyId && looksLikePem(pem)) return { keyId, pem }
  }
  return null
}

/** Windows-host Kalshi creds. Soft FAIL commit. Soft FAIL send PEM to the browser. */
export function loadKalshiHostCreds(): KalshiHostCreds | null {
  if (hostCredsCache !== undefined) return hostCredsCache
  hostCredsCache = readKalshiHostCreds()
  return hostCredsCache
}

export function hasKalshiHostCreds() {
  return loadKalshiHostCreds() != null
}

/** Kalshi signs the URL path only — query string must not be in the signature. */
export function signRequestPath(path: string) {
  const i = path.indexOf('?')
  return i === -1 ? path : path.slice(0, i)
}

function sign(pem: string, timestamp: string, method: string, path: string) {
  const signer = createSign('RSA-SHA256')
  signer.update(timestamp + method + signRequestPath(path))
  signer.end()
  return signer.sign(
    {
      key: pem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  )
}

async function signed(
  keyId: string,
  pem: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) {
  const timestamp = String(Date.now())
  const headers: Record<string, string> = {
    'KALSHI-ACCESS-KEY': keyId,
    'KALSHI-ACCESS-SIGNATURE': sign(pem, timestamp, method, path),
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    Accept: 'application/json',
  }
  if (body) headers['Content-Type'] = 'application/json'
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!r.ok) {
    const msg =
      (json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text) || `http ${r.status}`
    throw new Error(msg)
  }
  return json
}

export async function fetchBalance(keyId: string, pem: string) {
  const json = await signed(keyId, pem, 'GET', `${ROOT}/portfolio/balance`)
  return { cash: cashFromBalancePayload(json), raw: json }
}

export function rowsFromKalshiPage(json: unknown, listKeys: string[]) {
  if (!json || typeof json !== 'object') return { rows: [] as unknown[], cursor: '' }
  const o = json as Record<string, unknown>
  const nested = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null
  let rows: unknown[] = []
  for (const key of listKeys) {
    if (Array.isArray(o[key])) {
      rows = o[key] as unknown[]
      break
    }
    if (nested && Array.isArray(nested[key])) {
      rows = nested[key] as unknown[]
      break
    }
  }
  const cursor = o.cursor ?? nested?.cursor ?? ''
  return { rows, cursor: cursor ? String(cursor) : '' }
}

async function paginatedList(
  keyId: string,
  pem: string,
  path: string,
  listKeys: string[],
  extraQuery = '',
  pages = 16,
) {
  const rows: unknown[] = []
  let cursor = ''
  let last: unknown = null
  for (let i = 0; i < pages; i++) {
    const q = `limit=200${extraQuery}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const json = (await signed(keyId, pem, 'GET', `${path}?${q}`)) as Record<string, unknown>
    last = json
    const page = rowsFromKalshiPage(json, listKeys)
    rows.push(...page.rows)
    if (!page.cursor) break
    cursor = page.cursor
  }
  return { last, rows }
}

export async function fetchSettlements(keyId: string, pem: string, minTs = 0) {
  const since = Math.max(0, Math.floor(minTs))
  const extra = since > 0 ? `&min_ts=${since}` : ''
  const { rows } = await paginatedList(keyId, pem, `${ROOT}/portfolio/settlements`, ['settlements'], extra)
  return { settlements: rows }
}

export async function fetchDeposits(keyId: string, pem: string) {
  const { last, rows } = await paginatedList(keyId, pem, `${ROOT}/portfolio/deposits`, [
    'deposits',
    'deposit_history',
  ])
  return last && typeof last === 'object' ? { ...(last as object), deposits: rows } : { deposits: rows }
}

export async function fetchFills(keyId: string, pem: string) {
  const current = await paginatedList(keyId, pem, `${ROOT}/portfolio/fills`, ['fills'])
  let historical: unknown[] = []
  try {
    historical = (await paginatedList(keyId, pem, `${ROOT}/historical/fills`, ['fills'])).rows
  } catch {
    historical = []
  }
  const seen = new Set<string>()
  const fills: unknown[] = []
  for (const row of [...current.rows, ...historical]) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o.fill_id ?? o.trade_id ?? `${o.order_id ?? ''}:${o.ticker ?? ''}:${o.ts ?? ''}`)
    if (seen.has(id)) continue
    seen.add(id)
    fills.push(row)
  }
  return { fills }
}

async function fetchPublicMarket(ticker: string) {
  try {
    const r = await fetch(`${BASE}${ROOT}/markets/${encodeURIComponent(ticker)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'HUB-Prediction/1.0' },
    })
    if (!r.ok) return { ticker, result: '' }
    const json = (await r.json()) as { market?: Record<string, unknown> } & Record<string, unknown>
    const m = (json.market && typeof json.market === 'object' ? json.market : json) as Record<string, unknown>
    return {
      ticker,
      result: String(m.result ?? ''),
      closeTime: (m.close_time ?? m.close_ts ?? '') as string | number,
    }
  } catch {
    return { ticker, result: '' }
  }
}

function rowsNamed(raw: unknown, keys: string[]) {
  if (!raw || typeof raw !== 'object') return [] as unknown[]
  const o = raw as Record<string, unknown>
  for (const key of keys) {
    if (Array.isArray(o[key])) return o[key] as unknown[]
  }
  return []
}

function filterTickerRows(raw: unknown, keys: string[], want: Set<string>) {
  const rows = rowsNamed(raw, keys).filter((row) => {
    if (!row || typeof row !== 'object') return false
    const ticker = String((row as { ticker?: unknown }).ticker ?? '')
    return !want.size || want.has(ticker)
  })
  const first = keys[0] || 'rows'
  return { [first]: rows, ...Object.fromEntries(keys.map((k) => [k, rows])) }
}

/** One closed ticker: market result + portfolio settlement + cash. Soft FAIL a 20s series drip. */
export async function fetchClockSettle(keyId: string, pem: string, tickers: string[], minTsMs = 0) {
  const want = new Set(tickers.map((t) => String(t || '').trim()).filter(Boolean))
  const minSec =
    minTsMs > 1e12 ? Math.max(0, Math.floor(minTsMs / 1000) - 180) : Math.max(0, Math.floor(minTsMs || Date.now() / 1000 - 7200))
  const [bal, settlements, fills, positions, orders, markets] = await Promise.all([
    fetchBalance(keyId, pem),
    fetchSettlements(keyId, pem, minSec).catch(() => ({ settlements: [] as unknown[] })),
    fetchFills(keyId, pem).catch(() => ({ fills: [] as unknown[] })),
    fetchPositions(keyId, pem).catch(() => ({ market_positions: [] as unknown[], positions: [] as unknown[] })),
    fetchOrders(keyId, pem).catch(() => ({ orders: [] as unknown[] })),
    Promise.all([...want].map((ticker) => fetchPublicMarket(ticker))),
  ])
  return {
    cash: bal.cash,
    raw: bal.raw,
    settlements: filterTickerRows(settlements, ['settlements'], want),
    fills: filterTickerRows(fills, ['fills'], want),
    positions: filterTickerRows(positions, ['market_positions', 'positions'], want),
    orders: filterTickerRows(orders, ['orders', 'event_orders'], want),
    markets,
    tickers: [...want],
    fetchedAt: Date.now(),
    hostCreds: true,
  }
}

export async function fetchPositions(keyId: string, pem: string) {
  const { rows } = await paginatedList(
    keyId,
    pem,
    `${ROOT}/portfolio/positions`,
    ['market_positions', 'positions'],
    '&count_filter=position,total_traded',
  )
  return { market_positions: rows, positions: rows }
}

export async function fetchOrders(keyId: string, pem: string) {
  const current = await paginatedList(keyId, pem, `${ROOT}/portfolio/orders`, ['orders', 'event_orders'])
  return { orders: current.rows, event_orders: current.rows }
}

/** Entire Kalshi book: balance + fills + settlements + open orders + positions. Soft FAIL a drip. */
export async function fetchKalshiBook(keyId: string, pem: string) {
  const [bal, deposits, settlements, fills, positions, orders] = await Promise.all([
    fetchBalance(keyId, pem),
    fetchDeposits(keyId, pem).catch(() => null),
    fetchSettlements(keyId, pem).catch(() => null),
    fetchFills(keyId, pem).catch(() => null),
    fetchPositions(keyId, pem).catch(() => null),
    fetchOrders(keyId, pem).catch(() => null),
  ])
  return {
    ...bal,
    deposits,
    settlements,
    fills,
    positions,
    orders,
    fetchedAt: Date.now(),
    hostCreds: true,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export const V2_EVENTS_ORDERS = `${ROOT}/portfolio/events/orders`

function centsToPrice(cents: number) {
  const n = Math.max(1, Math.min(99, Math.round(cents)))
  return (n / 100).toFixed(4)
}

/** V2 events/orders body. bid = BUY YES. ask = BUY NO (legacy sell-yes at 1 − no_ask). */
export function v2EventsOrderBody(args: {
  ticker: string
  side: 'up' | 'down'
  count: number
  yesAsk: number
  noAsk: number
  clientOrderId: string
}) {
  const count = Math.max(1, Math.floor(args.count))
  const price = args.side === 'up' ? centsToPrice(args.yesAsk) : (1 - Number(centsToPrice(args.noAsk))).toFixed(4)
  return {
    ticker: args.ticker,
    side: args.side === 'up' ? 'bid' : 'ask',
    count: String(count),
    price,
    time_in_force: 'immediate_or_cancel',
    self_trade_prevention_type: 'taker_at_cross',
    client_order_id: args.clientOrderId,
  }
}

/** V2 events/orders primary. Sticky client_order_id on every retry. Soft FAIL Live send from tests. */
export async function placeContract(args: {
  keyId: string
  pem: string
  ticker: string
  side: 'up' | 'down'
  count: number
  yesAsk: number
  noAsk: number
  clientOrderId?: string
}) {
  const clientOrderId = args.clientOrderId || crypto.randomUUID()
  const body = v2EventsOrderBody({
    ticker: args.ticker,
    side: args.side,
    count: args.count,
    yesAsk: args.yesAsk,
    noAsk: args.noAsk,
    clientOrderId,
  })
  let last: unknown = null
  for (let i = 0; i < 4; i++) {
    try {
      return await signed(args.keyId, args.pem, 'POST', V2_EVENTS_ORDERS, body)
    } catch (e) {
      last = e
      await sleep(200)
    }
  }
  throw last instanceof Error ? last : new Error('IOC miss — clock released')
}
