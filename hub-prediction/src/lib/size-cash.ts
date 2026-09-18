/** Lock up to 40% of cash, risk ~8%, quarter-Kelly. High conviction → more than one contract. */
export function contractsFromCash(
  cash: number,
  askCents: number,
  pWin: number,
): number {
  const ask = askCents / 100
  if (!Number.isFinite(cash) || !Number.isFinite(ask) || !Number.isFinite(pWin)) return 0
  if (cash <= 0 || ask <= 0.01 || ask >= 0.99) return 0

  const b = (1 - ask) / ask
  const kelly = (pWin * b - (1 - pWin)) / b
  const quarter = Math.max(0, kelly * 0.25)
  const lockCap = cash * 0.4
  const riskCap = cash * 0.08
  const stake = Math.min(lockCap, cash * quarter, riskCap / ask)
  if (stake < ask) {
    if (pWin >= 0.68 && cash >= ask * 2) return 2
    if (pWin >= 0.62 && cash >= ask) return 1
    return 0
  }
  const n = Math.floor(stake / ask)
  if (pWin >= 0.7 && n < 2 && cash >= ask * 2) return 2
  return Math.max(0, n)
}

export function ticketCost(count: number, askCents: number) {
  if (!Number.isFinite(count) || !Number.isFinite(askCents) || count <= 0 || askCents <= 0) return 0
  return Math.round(count * (askCents / 100) * 100) / 100
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function flattenBalance(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const extras: Record<string, unknown>[] = []
  for (const key of ['data', 'portfolio', 'balances']) {
    const nested = o[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) extras.push(nested as Record<string, unknown>)
  }
  if (o.balance && typeof o.balance === 'object' && !Array.isArray(o.balance)) {
    extras.push(o.balance as Record<string, unknown>)
  }
  return Object.assign({}, o, ...extras)
}

/** GET /portfolio/balance — dollars fields first, then cents. Unwraps nested data. */
export function cashFromBalancePayload(raw: unknown): number {
  const o = flattenBalance(raw)
  if (!o) return 0
  for (const key of [
    'balance_dollars',
    'cash_dollars',
    'portfolio_value_dollars',
    'available_balance_dollars',
    'available_dollars',
  ]) {
    const n = asNum(o[key])
    if (n != null) return n
  }
  for (const key of ['balance', 'cash', 'available_balance', 'portfolio_value', 'available']) {
    const n = asNum(o[key])
    if (n == null) continue
    if (Number.isInteger(n) && Math.abs(n) > 5000) return n / 100
    return n
  }
  return 0
}
