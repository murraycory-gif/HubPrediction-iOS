import { useMemo, useState } from 'react'
import { expectedProfit, ticketCost } from '../lib/size-cash'
import {
  bookBet,
  cashFloor,
  logDeposit,
  logWithdrawal,
  placeGate,
  suggestedSize,
  workingCash,
  type FinanceBook,
} from '../lib/finance-book'
import { pWin as deskPWin } from '../lib/desk'
import { TAPE_IDS, TAPE_META, formatCash, formatPnl, type TapeId } from '../lib/tapes'
import type { DeskBoard, Quote, TapeQuote } from '../lib/types'

export function FinancePanel(props: {
  book: FinanceBook
  liveCash: number | null
  board: DeskBoard | null
  onBook: (book: FinanceBook) => void
  onMsg: (msg: string) => void
}) {
  const [amount, setAmount] = useState('760')
  const [note, setNote] = useState('deposit logged')
  const [tape, setTape] = useState<TapeId>('btc')
  const [side, setSide] = useState<'up' | 'down'>('up')
  const [pending, setPending] = useState(false)

  const quote = props.board?.tapes[tape] ?? null
  const ask = side === 'down' ? (quote?.noAsk ?? 0) : (quote?.yesAsk ?? 0)
  const pWin = useMemo(() => deskPWin(quoteToCall(quote)), [quote?.ticker, quote?.live, quote?.yesAsk, quote?.noAsk, quote?.beat])
  const count = suggestedSize(props.book, ask, pWin, props.liveCash)
  const cost = ticketCost(count, ask)
  const ev = expectedProfit(count, ask, pWin)
  const gate = placeGate(props.book, cost, props.liveCash)
  const cash = workingCash(props.book, props.liveCash)
  const floor = cashFloor(props.book)

  function applyDeposit(kind: 'deposit' | 'withdrawal') {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      props.onMsg('Enter a deposit amount')
      return
    }
    const next = kind === 'deposit' ? logDeposit(props.book, n, note) : logWithdrawal(props.book, n, note)
    props.onBook(next)
    props.onMsg(`${kind} ${n.toFixed(2)} logged`)
  }

  function onPlace() {
    if (!gate.ok) {
      props.onMsg(gate.reason)
      return
    }
    if (!quote?.ticker || count < 1) {
      props.onMsg('No SizeCash size on this tape')
      return
    }
    setPending(true)
    props.onMsg(`Confirm ${count} ${side.toUpperCase()} ${quote.ticker} · ${cost.toFixed(2)}`)
  }

  function onConfirm() {
    if (!pending) return
    if (!quote?.ticker) return
    const result = bookBet(props.book, {
      ticker: quote.ticker,
      side,
      count,
      ask,
      mode: props.book.mode,
      source: 'manual',
      liveCash: props.liveCash,
    })
    setPending(false)
    if (!result.ok) {
      props.onMsg(result.reason)
      return
    }
    props.onBook(result.book)
    props.onMsg(`Booked ${result.bet.count} ${result.bet.side.toUpperCase()} ${result.bet.ticker} · ${props.book.mode}`)
  }

  return (
    <section className="finance" data-testid="finance-panel">
      <p className="hud-label">AI finance manager · desk-local</p>
      <p className="settings-note">
        SizeCash locked: risk 8% · lock 40% · ¼ Kelly · max 25. Paper floor $50. Live floor max($150, 20%
        deposits). Soft FAIL recipe retune.
      </p>

      <div className="finance-log">
        <input
          className="field"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          data-testid="deposit-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="field"
          data-testid="deposit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note"
        />
        <button type="button" className="chip-btn" data-testid="log-deposit" onClick={() => applyDeposit('deposit')}>
          Log deposit
        </button>
        <button type="button" className="chip-btn" data-testid="log-withdrawal" onClick={() => applyDeposit('withdrawal')}>
          Log withdrawal
        </button>
      </div>

      <div className="ticket-box" data-testid="ticket-box">
        <div className="settings-grid">
          <label>
            Tape
            <select className="field" data-testid="place-tape" value={tape} onChange={(e) => setTape(e.target.value as TapeId)}>
              {TAPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {TAPE_META[id].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Side
            <select className="field" data-testid="place-side" value={side} onChange={(e) => setSide(e.target.value as 'up' | 'down')}>
              <option value="up">UP</option>
              <option value="down">DOWN</option>
            </select>
          </label>
        </div>
        <p className="tape-line" data-testid="size-line">
          Size {count} · ask {Number.isFinite(ask) && ask > 0 ? `${ask}¢` : '—'} · cost {formatCash(cost)} · EV{' '}
          {formatPnl(ev)} · cash after {formatCash(cash - cost)} · floor {formatCash(floor)}
        </p>
        <div className="settings-toggles">
          <button
            type="button"
            className="chip-btn"
            data-testid="place"
            disabled={!gate.ok || count < 1 || !quote?.ticker}
            onClick={onPlace}
          >
            Place
          </button>
          <button
            type="button"
            className="chip-btn"
            data-testid="confirm"
            disabled={!pending || !gate.ok}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
        {!gate.ok ? (
          <p className="desk-msg" data-testid="place-block">
            {gate.reason}
          </p>
        ) : null}
      </div>

      <div className="book-list" data-testid="deposit-log">
        <p className="hud-label">Deposit log</p>
        {props.book.deposits.length ? (
          props.book.deposits
            .slice()
            .reverse()
            .map((d) => (
              <p key={d.deposit_id} className="book-row" data-testid="deposit-row">
                {d.kind === 'deposit' ? '+' : '−'}
                {formatCash(d.amount)} · {d.note}
              </p>
            ))
        ) : (
          <p className="tape-line">No deposits logged</p>
        )}
      </div>

      <div className="book-list" data-testid="bet-book">
        <p className="hud-label">Bet book</p>
        {props.book.bets.length ? (
          props.book.bets
            .slice()
            .reverse()
            .map((b) => (
              <p key={b.bet_id} className="book-row" data-testid="bet-row">
                {new Date(b.at).toLocaleString()} · {b.ticker} · {b.side.toUpperCase()} ×{b.count} @ {b.ask}¢ ·{' '}
                {b.mode} · {b.source} · {formatCash(b.cost)}
                {b.fee ? ` + fee ${formatCash(b.fee)}` : ''} · {b.status}
                {b.realized_pnl != null ? ` · ${formatPnl(b.realized_pnl)}` : ''}
              </p>
            ))
        ) : (
          <p className="tape-line">No fills yet</p>
        )}
      </div>
    </section>
  )
}

function quoteToCall(quote: TapeQuote | null): Quote | null {
  if (!quote) return null
  return {
    ticker: quote.ticker,
    yesAsk: quote.yesAsk,
    noAsk: quote.noAsk,
    strike: quote.beat,
    live: quote.live ?? quote.beat,
    liveSource: quote.liveSource ?? 'kalshi-live',
    openAt: quote.openAt,
    closeAt: quote.closeAt,
    fetchedAt: quote.fetchedAt,
    tradingActive: quote.tradingActive,
    points: quote.points,
    past: [],
  }
}
