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

export function cashFromBalancePayload(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0
  const o = raw as Record<string, unknown>
  const dollars =
    o.balance_dollars ?? o.cash_dollars ?? o.portfolio_value_dollars ?? o.available_balance_dollars
  if (typeof dollars === 'string' && dollars.length) {
    const n = Number(dollars)
    if (Number.isFinite(n)) return n
  }
  if (typeof dollars === 'number' && Number.isFinite(dollars)) return dollars
  const cents = o.balance ?? o.cash ?? o.available_balance
  if (typeof cents === 'number' && Number.isFinite(cents)) {
    return cents > 5000 ? cents / 100 : cents
  }
  if (typeof cents === 'string') {
    const n = Number(cents)
    if (Number.isFinite(n)) return n > 5000 ? n / 100 : n
  }
  return 0
}
