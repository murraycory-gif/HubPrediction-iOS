import {
  cashFloor,
  cumulativeDeposits,
  pnlVsDeposits,
  workingCash,
  type FinanceBook,
} from '../lib/finance-book'
import { formatCash, formatPnl } from '../lib/tapes'

export function CashStrip(props: {
  book: FinanceBook
  liveCash: number | null
  onKill: () => void
  onClearKill: () => void
}) {
  const cash = workingCash(props.book, props.liveCash)
  const deposits = cumulativeDeposits(props.book)
  const pnl = pnlVsDeposits(props.book, props.liveCash)
  const floor = cashFloor(props.book)
  return (
    <div className="cash-strip" data-testid="cash-strip">
      <StripStat label="Deposits" value={formatCash(deposits)} testId="strip-deposits" />
      <StripStat label="Cash" value={formatCash(cash)} testId="strip-cash" />
      <StripStat label="PnL vs dep" value={formatPnl(pnl)} testId="strip-pnl-vs-dep" />
      <StripStat label="Floor" value={formatCash(floor)} testId="strip-floor" />
      <button
        type="button"
        className={`kill-btn ${props.book.killed ? 'kill-on' : ''}`}
        data-testid="kill"
        onClick={() => (props.book.killed ? props.onClearKill() : props.onKill())}
      >
        {props.book.killed ? 'KILL ON' : 'KILL'}
      </button>
    </div>
  )
}

function StripStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="strip-stat" data-testid={testId}>
      <p className="hud-label">{label}</p>
      <p className="strip-value">{value}</p>
    </div>
  )
}
