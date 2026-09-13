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

export async function placeContract(args: {
  keyId: string
  pem: string
  ticker: string
  side: 'up' | 'down'
  count: number
  yesAsk: number
  noAsk: number
}) {
  const count = Math.max(1, Math.floor(args.count))
  const priceCents = args.side === 'up' ? args.yesAsk : args.noAsk
  const price = (Math.max(1, Math.min(99, priceCents)) / 100).toFixed(4)
  const path = `${ROOT}/portfolio/orders`
  const body = {
    ticker: args.ticker,
    side: args.side === 'up' ? 'yes' : 'no',
    action: 'buy',
    count,
    type: 'limit',
    yes_price: args.side === 'up' ? priceCents : undefined,
    no_price: args.side === 'down' ? priceCents : undefined,
    client_order_id: crypto.randomUUID(),
  }
  try {
    return await signed(args.keyId, args.pem, 'POST', path, body)
  } catch {
    return await signed(args.keyId, args.pem, 'POST', `${ROOT}/portfolio/events/orders`, {
      ticker: args.ticker,
      side: 'bid',
      count: String(count),
      price,
      time_in_force: 'immediate_or_cancel',
      client_order_id: crypto.randomUUID(),
    })
  }
}
