/** Soft KEEP SizeCash recipe — locked per session. Soft FAIL mid-session retune knobs. */
export const SIZE_CASH_RECIPE = Object.freeze({
  riskCap: 0.08,
  lockCap: 0.4,
  kellyFraction: 0.25,
  maxContracts: 25,
})

export function sizeCashRecipe() {
  return { ...SIZE_CASH_RECIPE }
}

export function ticketCost(count: number, askCents: number, fee = 0) {
  if (!Number.isFinite(count) || !Number.isFinite(askCents) || count <= 0) return 0
  return roundMoney(count * (askCents / 100) + (Number.isFinite(fee) ? fee : 0))
}

export function expectedProfit(count: number, askCents: number, pWin: number) {
  const ask = askCents / 100
  if (!Number.isFinite(count) || !Number.isFinite(ask) || !Number.isFinite(pWin) || count <= 0) return 0
  return roundMoney(count * (pWin * (1 - ask) - (1 - pWin) * ask))
}

/** Lock up to 40% of cash, risk ~8%, quarter-Kelly, max 25. High conviction → more than one contract. */
export function contractsFromCash(
  cash: number,
  askCents: number,
  pWin: number,
  floor = 0,
): number {
  const ask = askCents / 100
  if (!Number.isFinite(cash) || !Number.isFinite(ask) || !Number.isFinite(pWin)) return 0
  if (cash <= 0 || ask <= 0.01 || ask >= 0.99) return 0

  const spendable = Math.max(0, cash - (Number.isFinite(floor) ? floor : 0))
  if (spendable < ask) return 0

  const b = (1 - ask) / ask
  const kelly = (pWin * b - (1 - pWin)) / b
  const quarter = Math.max(0, kelly * SIZE_CASH_RECIPE.kellyFraction)
  const lockCap = cash * SIZE_CASH_RECIPE.lockCap
  const riskCap = cash * SIZE_CASH_RECIPE.riskCap
  const stake = Math.min(lockCap, cash * quarter, riskCap / ask, spendable)
  let n = 0
  if (stake < ask) {
    if (pWin >= 0.68 && cash >= ask * 2) n = 2
    else if (pWin >= 0.62 && cash >= ask) n = 1
    else return 0
  } else {
    n = Math.floor(stake / ask)
    if (pWin >= 0.7 && n < 2 && cash >= ask * 2) n = 2
  }
  n = Math.max(0, Math.min(SIZE_CASH_RECIPE.maxContracts, n))
  while (n > 0 && ticketCost(n, askCents) > spendable + 1e-9) n -= 1
  return n
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

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}
