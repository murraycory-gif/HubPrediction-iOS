import { createSign, constants } from 'node:crypto'
import { cashFromBalancePayload } from './size-cash'

const BASE = 'https://external-api.kalshi.com'
const ROOT = '/trade-api/v2'

function sign(pem: string, timestamp: string, method: string, path: string) {
  const signer = createSign('RSA-SHA256')
  signer.update(timestamp + method + path)
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

export async function fetchSettlements(keyId: string, pem: string) {
  const minTs = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const settlements: unknown[] = []
  let cursor = ''
  for (let i = 0; i < 5; i++) {
    const path = `${ROOT}/portfolio/settlements?limit=200&min_ts=${minTs}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const json = (await signed(keyId, pem, 'GET', path)) as { settlements?: unknown[]; cursor?: string }
    if (Array.isArray(json?.settlements)) settlements.push(...json.settlements)
    if (!json?.cursor) break
    cursor = json.cursor
  }
  return { settlements }
}

export async function fetchDeposits(keyId: string, pem: string) {
  return signed(keyId, pem, 'GET', `${ROOT}/portfolio/deposits?limit=200`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export const V2_EVENTS_ORDERS = `${ROOT}/portfolio/events/orders`

function centsToPrice(cents: number) {
  const n = Math.max(1, Math.min(99, Math.round(cents)))
  return (n / 100).toFixed(4)
}

/** V2 events/orders body. DOWN is side ask at (1 − no_ask), never bid + no_ask. */
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
