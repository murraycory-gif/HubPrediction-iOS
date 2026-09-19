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
import {
  DAILY_PROFIT_LOCK,
  MAX_LIVE_CLOCKS,
  RESERVE_CASH,
  RESERVE_RISK,
  type ChiefProposal,
  type ChiefState,
} from '../lib/desk-chief'
import { TAPE_IDS, TAPE_META, formatCash, formatPnl } from '../lib/tapes'
import type { CashLatch } from '../lib/tapes'
import type { DeskBoard } from '../lib/types'

export function FinancePanel(props: {
  book: FinanceState
  cash: CashLatch
  board: DeskBoard | null
  chief: ChiefState
  onKill: () => void
  onClearKill: () => void
  onChiefAccept: (id: string) => void
  onChiefReject: (id: string) => void
}) {
  const pnl = pnlVsDeposits(props.cash.cash, props.cash.deposits)
  const liveFloor = liveCashFloor(props.cash.deposits)
  const paperLeft = paperHoursLeft(props.book)
  const pending = props.chief.proposals.filter((p) => p.status === 'pending')
  return (
    <section className="finance" data-testid="finance">
      <p className="hud-label">Finance / Desk Chief</p>
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
        Return stack · tab-open fill · real order id · one ticket/clock · skip ≥{ASK_CAP}¢ unless locked · KILL{' '}
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
      <section className="chief" data-testid="desk-chief">
        <p className="hud-label">Desk Chief · profit + Kalshi cash</p>
        <p className="settings-note" data-testid="chief-lock">
          Paper size auto. Live size is a draft. Soft FAIL Live ON. Soft FAIL recipe rewrite. Reserve{' '}
          {Math.round(RESERVE_CASH * 100)}/{Math.round(RESERVE_RISK * 100)} · max {MAX_LIVE_CLOCKS} Live clocks (BTC + NG/CU)
          · lock-in +$
          {DAILY_PROFIT_LOCK}
          {props.chief.lockIn ? ' · lock-in sit' : ''}.
        </p>
        <p className="tape-line" data-testid="chief-cash">
          Cash {formatCash(props.chief.cash ?? props.cash.cash)} vs floor {formatCash(props.chief.cashFloor)} · day{' '}
          {formatPnl(props.chief.dailyPnl)}
        </p>
        <div className="analyst-grid">
          {TAPE_IDS.map((id) => {
            const row = props.chief.progress[id]
            const sleeve = props.chief.sleeves[id]
            return (
              <p key={id} className="tape-recipe" data-testid={`chief-alloc-${id}`}>
                {TAPE_META[id].label} ×{sleeve?.contracts ?? row?.contracts ?? 1} · {row?.clock ?? '15m'} · sleeve{' '}
                {formatCash(sleeve?.sleeveUsd ?? 0)} · Bot {row?.botOn ? 'ON' : 'OFF'} · Live {row?.liveOn ? 'ON' : 'OFF'} ·{' '}
                {row?.hitPct ?? 0}% {row?.w ?? 0}W–{row?.l ?? 0}L · risk {formatCash(row?.openRisk ?? 0)} ·{' '}
                {row?.halt ? 'HALT' : row?.closed ? 'CLOSED' : row?.stale ? 'STALE' : row?.tradingActive ? 'LIVE' : '—'} ·{' '}
                {formatPnl(row?.pnl ?? 0)}
              </p>
            )
          })}
        </div>
        <div className="chief-actions" data-testid="chief-actions">
          {props.chief.actions.length ? (
            props.chief.actions
              .slice()
              .reverse()
              .slice(0, 8)
              .map((a) => (
                <p key={a.id} className="tape-line" data-testid={`chief-action-${a.id}`}>
                  {a.text}
                </p>
              ))
          ) : (
            <p className="pulse-note">No Chief actions yet.</p>
          )}
        </div>
        <div className="chief-proposals" data-testid="chief-proposals">
          {pending.length ? (
            pending.map((p: ChiefProposal) => (
              <div key={p.id} className="chief-propose" data-testid={`chief-proposal-${p.id}`}>
                <p className="tape-line">{p.reason}</p>
                <button
                  type="button"
                  className="chip-btn toggle-hot"
                  data-testid={`chief-accept-${p.id}`}
                  onClick={() => props.onChiefAccept(p.id)}
                >
                  Accept
                </button>
                <button type="button" className="chip-btn" data-testid={`chief-reject-${p.id}`} onClick={() => props.onChiefReject(p.id)}>
                  Reject
                </button>
              </div>
            ))
          ) : (
            <p className="pulse-note">No pending Live drafts.</p>
          )}
        </div>
      </section>
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
