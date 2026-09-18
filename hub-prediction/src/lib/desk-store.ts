import {
  FINANCE_KEY,
  hydrateFinanceBook,
  loadFinanceBook,
  saveFinanceBook,
  type FinanceBook,
} from './finance-book'

/** Desk-local persist. Soft FAIL shipping a cloud EG ledger first. */
export const DeskStore = {
  financeKey: FINANCE_KEY,
  loadFinance: loadFinanceBook,
  saveFinance: saveFinanceBook,
  hydrateFinance: hydrateFinanceBook,
}

export function persistFinance(book: FinanceBook) {
  return DeskStore.saveFinance(book)
}
