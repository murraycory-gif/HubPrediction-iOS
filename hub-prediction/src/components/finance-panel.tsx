import {
  ASK_CAP,
  DAILY_PNL_FLOOR_PAPER,
  PAPER_HOURS,
  bookRealizedPnl,
  dailyPnlFloorHit,
  liveCashFloor,
  paper48hPassed,
  paperCashFloor,
  paperHoursLeft,
  pnlVsDeposits,
  recommendSize,
  recipeLine,
  type FinanceState,
} from '../lib/finance'
import { TAPE_IDS, TAPE_META, formatCash, formatPnl } from '../lib/tapes'
import type { CashLatch } from '../lib/tapes'
import type { DeskBoard } from '../lib/types'

export function FinancePanel(props: {
  book: FinanceState
  cash: CashLatch
  board: DeskBoard | null
  onKill: () => void
  onClearKill: () => void
}) {
  const pnl = pnlVsDeposits(props.cash.cash, props.cash.deposits)
  const liveFloor = liveCashFloor(props.cash.deposits)
  const paperLeft = paperHoursLeft(props.book)
  return (
    <section className="finance" data-testid="finance">
      <p className="hud-label">Finance · desk-local</p>
      <p className="settings-note" data-testid="finance-lock">
        Books real Kalshi fills only. Does not send orders. Does not flip Live. Does not retune gold recipes.
        Paper floor {formatCash(paperCashFloor())}. Live floor max($150, 20% deposits) = {formatCash(liveFloor)}.
      </p>
      <div className="stat-row">
        <div className="stat" data-testid="finance-pnl">
          <p className="hud-label">P&L / DEPOSITS</p>
          <p className="stat-value">
            {formatPnl(pnl)} from {formatCash(props.cash.deposits)}
          </p>
        </div>
        <div className="stat" data-testid="finance-cash">
          <p className="hud-label">KALSHI CASH</p>
          <p className="stat-value">{formatCash(props.cash.cash)}</p>
        </div>
        <div className="stat" data-testid="finance-book-pnl">
          <p className="hud-label">BOOK P/L</p>
          <p className="stat-value">{formatPnl(bookRealizedPnl(props.book))}</p>
        </div>
      </div>
      <p className="tape-line" data-testid="finance-stack">
        Return stack · tab-open fill · real order id · one ticket/clock · ≥{ASK_CAP}¢ needs gold lock · KILL{' '}
        {props.book.killed ? 'ON' : 'off'} · paper {paper48hPassed(props.book) ? '48h PASS' : `${paperLeft.toFixed(1)}h / ${PAPER_HOURS}h`}
      </p>
      <div className="settings-toggles">
        <button type="button" className="chip-btn toggle-hot" data-testid="finance-kill" onClick={props.onKill}>
          KILL
        </button>
        <button type="button" className="chip-btn" data-testid="finance-clear-kill" onClick={props.onClearKill}>
          Clear KILL
        </button>
        <span className="settings-cash" data-testid="finance-kill-state">
          {dailyPnlFloorHit(props.book)
            ? `floor hit — daily P/L ≤ ${DAILY_PNL_FLOOR_PAPER}. KILL on. Place blocked.`
            : props.book.killed
              ? 'KILL on — bots disarmed, Place blocked'
              : 'KILL off'}
        </span>
      </div>
      <div className="analyst-grid">
        {TAPE_IDS.map((id) => {
          const q = props.board?.tapes[id]
          const ask = q ? `${q.yesAsk}¢ / ${q.noAsk}¢` : '—'
          return (
            <p key={id} className="tape-recipe" data-testid={`finance-size-${id}`}>
              Size rec {TAPE_META[id].label} ×{recommendSize(id)} (gold lock) · {recipeLine(id)} · ¢ {ask}
            </p>
          )
        })}
      </div>
      <div className="finance-book" data-testid="finance-book">
        {props.book.bets.length ? (
          props.book.bets
            .slice()
            .reverse()
            .slice(0, 24)
            .map((b) => (
              <p key={b.betId} className="tape-line" data-testid={`finance-bet-${b.orderId}`}>
                {TAPE_META[b.tape].label} {b.clock} {b.side.toUpperCase()} ×{b.count} · {b.ask}¢ · spent{' '}
                {formatCash(b.spent)} · {b.orderId} · {b.status}
                {b.pnl != null ? ` · ${formatPnl(b.pnl)}` : ''}
              </p>
            ))
        ) : (
          <p className="pulse-note">Book empty — ticket only after a real Kalshi order id.</p>
        )}
      </div>
    </section>
  )
}
