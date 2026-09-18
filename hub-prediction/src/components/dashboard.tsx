import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getDeskBoard, getKalshiCash, getSettledDesk, placeKalshi } from '../lib/btc-data'
import {
  KEY_ID,
  KEY_PEM,
  TAPE_IDS,
  TAPE_META,
  GOLD_RECIPES,
  askInBand,
  cashGates,
  claimSend,
  clampContracts,
  depositsFromPayload,
  disarmAllBots,
  eventsFromKalshiSettlements,
  eventsFromTickets,
  extractOrderId,
  formatCash,
  formatLive,
  formatPnl,
  formatWeThink,
  hitPct,
  inArmWindow,
  loadCash,
  loadHits,
  loadSettings,
  loadTickets,
  makeTicket,
  markFilled,
  mergeHitEvents,
  patchTape,
  releaseClaim,
  pulseTone,
  saveCash,
  saveHits,
  setLiveBets,
  tabIsOpen,
  tapeLean,
  ticketStatus,
  ttlFromHits,
  upsertTicket,
  weThinkPair,
  type DeskSettings,
  type DeskTicket,
  type SendClaim,
  type TapeId,
  type TapeRecipe,
} from '../lib/tapes'
import { ticketCost } from '../lib/size-cash'
import type { DeskBoard, TapeQuote } from '../lib/types'
import {
  bookFill,
  clearKill,
  engageKill,
  chasingLosses,
  liveArmGate,
  liveCashFloor,
  liveSendGate,
  loadFinance,
  paperCashFloor,
  recipeRetuneGate,
  settleBook,
  syncTicketsIntoBook,
  type FinanceState,
} from '../lib/finance'
import { AnalystPanel } from './analyst-panel'
import { CloseClock } from './close-clock'
import { FinancePanel } from './finance-panel'
import { RaceChart } from './race-chart'
import { SettingsPanel } from './settings-panel'

function readLocal(key: string) {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(key) ?? ''
}

function writeLocal(key: string, value: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}

export function Dashboard({ seedBoard }: { seedBoard: DeskBoard | null }) {
  const [settings, setSettings] = useState<DeskSettings>(() => loadSettings())
  const [tickets, setTickets] = useState<DeskTicket[]>(() => loadTickets())
  const [hits, setHits] = useState(() => loadHits())
  const [cash, setCash] = useState(() => loadCash())
  const [keyId, setKeyId] = useState(() => readLocal(KEY_ID))
  const [pem, setPem] = useState(() => readLocal(KEY_PEM))
  const [msg, setMsg] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [book, setBook] = useState<FinanceState>(() => loadFinance())
  const [liveConfirm, setLiveConfirm] = useState(false)
  const [bets, setBets] = useState<TapeId[] | 'all'>('all')
  const sentRef = useRef<Record<string, SendClaim>>({})

  useEffect(() => {
    setSettings(loadSettings())
    const nextTickets = loadTickets()
    setTickets(nextTickets)
    setHits(loadHits())
    setCash(loadCash())
    setKeyId(readLocal(KEY_ID))
    setPem(readLocal(KEY_PEM))
    setBook(
      syncTicketsIntoBook(loadFinance(), nextTickets, () => ({
        clock: '',
        closeAt: 0,
        ask: 50,
      })),
    )
  }, [])

  const boardQuery = useQuery({
    queryKey: ['desk-board'],
    queryFn: () => getDeskBoard(),
    refetchInterval: 2000,
    placeholderData: keepPreviousData,
    initialData: seedBoard ?? undefined,
    staleTime: 800,
  })

  const board = boardQuery.data ?? seedBoard

  async function refreshCash(nextKey = keyId, nextPem = pem) {
    if (!nextKey || !nextPem) return
    try {
      const r = await getKalshiCash({ data: { keyId: nextKey, pem: nextPem } })
      const deposits = depositsFromPayload(r.deposits) ?? cash.deposits
      const next = saveCash({
        cash: r.cash,
        deposits,
        pnl: r.cash != null && deposits != null ? r.cash - deposits : cash.pnl,
        asOf: Date.now(),
      })
      setCash(next)
      if (r.settlements) {
        const ev = eventsFromKalshiSettlements(r.settlements)
        setHits((prev) => saveHits(mergeHitEvents(prev, ev)))
      }
      setMsg('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'balance failed')
    }
  }

  const settledQuery = useQuery({
    queryKey: ['settled-desk'],
    queryFn: () => getSettledDesk(),
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  useEffect(() => {
    const settled = settledQuery.data
    if (!settled?.length) return
    const ev = eventsFromTickets(tickets, settled)
    if (ev.length) setHits((prev) => saveHits(mergeHitEvents(prev, ev)))
    setBook((prev) => settleBook(prev, settled))
  }, [settledQuery.data, tickets])

  async function sendLive(tape: TapeId, side: 'up' | 'down', quote: TapeQuote) {
    if (!tabIsOpen()) {
      setMsg('Send needs this tab open')
      return
    }
    const gates = cashGates(settings, tape)
    if (!gates.ok) {
      setMsg(
        !gates.bot
          ? `${TAPE_META[tape].label} PAPER — bot off / not sent`
          : !gates.liveCash
            ? `${TAPE_META[tape].label} PAPER LOCK · not sent to Kalshi`
            : 'Live bets OFF — paper only. No ticket.',
      )
      return
    }
    if (!keyId || !pem) {
      setMsg('Paste API Key ID + PEM to send live')
      return
    }
    if (!quote.ticker) return
    const ask = side === 'down' ? quote.noAsk : quote.yesAsk
    const spent = ticketCost(settings.tapes[tape].contracts, ask)
    const gate = liveSendGate(book, {
      tape,
      ticker: quote.ticker,
      ask,
      cash: cash.cash,
      deposits: cash.deposits,
      spent,
    })
    if (!gate.ok) {
      setMsg(gate.reason)
      return
    }
    try {
      const raw = await placeKalshi({
        data: {
          keyId,
          pem,
          ticker: quote.ticker,
          side,
          count: settings.tapes[tape].contracts,
          yesAsk: quote.yesAsk,
          noAsk: quote.noAsk,
        },
      })
      const orderId = extractOrderId(raw)
      const ticket = makeTicket({
        tape,
        ticker: quote.ticker,
        side,
        orderId,
        contracts: settings.tapes[tape].contracts,
        beat: quote.beat,
      })
      if (!ticket) {
        setMsg('Kalshi returned no order id — no ticket')
        releaseClaim(sentRef.current, `${tape}:${quote.ticker}`)
        return
      }
      markFilled(sentRef.current, `${tape}:${quote.ticker}`, ticket.orderId)
      setTickets((prev) => upsertTicket(prev, ticket))
      const booked = bookFill(book, {
        tape,
        ticker: quote.ticker,
        clock: quote.clock,
        closeAt: quote.closeAt,
        side,
        count: ticket.contracts,
        ask,
        orderId: ticket.orderId,
      })
      if (booked.ok) setBook(booked.state)
      setMsg(`${TAPE_META[tape].label} ${side.toUpperCase()} ${ticket.orderId}`)
      await refreshCash()
    } catch (e) {
      releaseClaim(sentRef.current, `${tape}:${quote.ticker}`)
      setMsg(e instanceof Error ? e.message : 'IOC miss — clock released')
    }
  }

  useEffect(() => {
    if (!board || !tabIsOpen() || book.killed) return
    for (const id of TAPE_IDS) {
      const quote = board.tapes[id]
      const recipe = settings.tapes[id]
      const gold = GOLD_RECIPES[id]
      if (!quote?.ticker || !recipe.botOn) continue
      if (ticketFor(tickets, id, quote.ticker)) continue
      if (!inArmWindow(gold, quote.closeAt)) continue
      const lean = tapeLean({ id, live: quote.live, beat: quote.beat, recipe: gold })
      if (lean === 'sit') continue
      const ask = lean === 'down' ? quote.noAsk : quote.yesAsk
      if (!askInBand(ask, gold)) continue
      const key = `${id}:${quote.ticker}`
      const gates = cashGates(settings, id)
      if (!gates.ok) continue
      if (claimSend(sentRef.current, key) !== 'send') continue
      void sendLive(id, lean, quote)
    }
  }, [board?.fetchedAt, settings, tickets, book.killed])

  const ttl = ttlFromHits(hits)
  const liveTicket = tickets.find((t) => {
    const q = board?.tapes[t.tape]
    return q?.ticker === t.ticker
  })
  const pulseQuote = liveTicket ? board?.tapes[liveTicket.tape] : board?.tapes.btc
  const pulse = pulseTone(liveTicket, pulseQuote?.live ?? null)
  const visible = bets === 'all' ? TAPE_IDS : TAPE_IDS.filter((id) => bets.includes(id))

  return (
    <div className="desk">
      <header className="desk-head" data-testid="desk-head">
        <div className="brand-bar">
          <h1 data-testid="desk-title">HUB / PREDICTIONS</h1>
          <button
            type="button"
            className="chip-btn"
            data-testid="settings-toggle"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? 'Hide settings' : 'Settings'}
          </button>
        </div>
        <div className="stat-row">
          <Stat
            label="P&L VS DEPOSITS"
            value={`${formatPnl(cash.pnl)} from ${formatCash(cash.deposits)}`}
            testId="pnl"
            tone={cash.pnl != null && cash.pnl < 0 ? 'down' : cash.pnl != null && cash.pnl > 0 ? 'up' : undefined}
          />
          <Stat label="TTL 24H" value={`${ttl.pct}% ${ttl.w}W–${ttl.l}L`} testId="ttl" />
          <Stat label="KALSHI CASH" value={formatCash(cash.cash)} testId="kalshi-cash" />
        </div>
        <p className="mode-line" data-testid="mode-line">
          {settings.liveBets ? 'LIVE BETS ON' : 'Live bets OFF'} · paper only unless you flip Live · bots{' '}
          {TAPE_IDS.every((id) => !settings.tapes[id].botOn) ? 'OFF' : 'armed'}
        </p>
        <p className="mode-line" data-testid="host-line">
          HUB · Windows local · not grok.me
        </p>
        <p className="mode-line" data-testid="finance-strip">
          Paper floor {formatCash(paperCashFloor())} · Live floor {formatCash(liveCashFloor(cash.deposits))} · KILL{' '}
          {book.killed ? 'ON' : 'off'}
          {chasingLosses(book) ? ' · recipe lock' : ''}
        </p>
        {liveConfirm ? (
          <div className="live-banner" data-testid="live-banner">
            <p>Confirm LIVE — keys + paper 48h + cash floor. Soft FAIL silent Paper→Live.</p>
            <button
              type="button"
              className="chip-btn toggle-hot"
              data-testid="confirm-live"
              onClick={() => {
                const gate = liveArmGate(book, {
                  cash: cash.cash,
                  deposits: cash.deposits,
                  hasKeys: Boolean(keyId && pem),
                })
                setLiveConfirm(false)
                if (!gate.ok) {
                  setSettings(setLiveBets(settings, false))
                  setMsg(gate.reason)
                  return
                }
                setSettings(setLiveBets(settings, true))
                setMsg('LIVE armed — confirm + keys + floor')
              }}
            >
              Confirm LIVE
            </button>
            <button type="button" className="chip-btn" data-testid="cancel-live" onClick={() => setLiveConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : null}
      </header>

      <main className="desk-main">
        <div className="bets-filter" data-testid="bets-filter">
          <button
            type="button"
            className={`chip-btn ${bets === 'all' ? 'toggle-on' : ''}`}
            data-testid="filter-all"
            onClick={() => setBets('all')}
          >
            All
          </button>
          {TAPE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip-btn ${bets !== 'all' && bets.includes(id) ? 'toggle-on' : ''}`}
              data-testid={`filter-${id}`}
              onClick={() => {
                setBets((prev) => {
                  if (prev === 'all') return [id]
                  const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  return next.length === 0 || next.length === TAPE_IDS.length ? 'all' : next
                })
              }}
            >
              {TAPE_META[id].label}
            </button>
          ))}
        </div>

        <div className="tape-grid">
          {visible.map((id) => (
            <TapeRow
              key={id}
              id={id}
              quote={board?.tapes[id] ?? null}
              ticket={ticketFor(tickets, id, board?.tapes[id]?.ticker)}
              hits={hits.tapes[id]}
              recipe={settings.tapes[id]}
              liveBets={settings.liveBets}
              recipeLocked={chasingLosses(book) || book.killed}
              onTape={(patch) => {
                if (book.killed && patch.botOn) {
                  setMsg('KILL on — bots stay off')
                  return
                }
                const gate = recipeRetuneGate(book, patch)
                if (!gate.ok) {
                  setMsg(gate.reason)
                  return
                }
                setSettings(patchTape(settings, id, patch))
              }}
            />
          ))}
        </div>

        <PulseCard
          ticket={liveTicket}
          quote={pulseQuote ?? null}
          tone={pulse}
        />

        <AnalystPanel board={board ?? null} hits={hits} />

        <FinancePanel
          book={book}
          cash={cash}
          board={board ?? null}
          onKill={() => {
            setBook(engageKill(book))
            setSettings(disarmAllBots(settings))
            setLiveConfirm(false)
            setMsg('KILL on — bots disarmed, Place blocked')
          }}
          onClearKill={() => {
            setBook(clearKill(book))
            setMsg('KILL cleared')
          }}
        />

        {msg ? <p className="desk-msg">{msg}</p> : null}

        {settingsOpen ? (
          <SettingsPanel
            settings={settings}
            keyId={keyId}
            pem={pem}
            cashLabel={`Cash ${formatCash(cash.cash)}`}
            onKeyId={(v) => {
              setKeyId(v)
              writeLocal(KEY_ID, v)
            }}
            onPem={(v) => {
              setPem(v)
              writeLocal(KEY_PEM, v)
            }}
            onLiveBets={(on) => {
              if (on) setLiveConfirm(true)
              else {
                setLiveConfirm(false)
                setSettings(setLiveBets(settings, false))
              }
            }}
            recipeLocked={chasingLosses(book) || book.killed}
            onTape={(id, patch) => {
              if (book.killed && patch.botOn) {
                setMsg('KILL on — bots stay off')
                return
              }
              const gate = recipeRetuneGate(book, patch)
              if (!gate.ok) {
                setMsg(gate.reason)
                return
              }
              setSettings(patchTape(settings, id, patch))
            }}
            onRefreshCash={() => void refreshCash()}
          />
        ) : null}
      </main>
    </div>
  )
}

function ticketFor(tickets: DeskTicket[], id: TapeId, ticker?: string) {
  if (!ticker) return tickets.find((t) => t.tape === id)
  return tickets.find((t) => t.tape === id && t.ticker === ticker)
}

function Stat({
  label,
  value,
  testId,
  tone,
}: {
  label: string
  value: string
  testId: string
  tone?: 'up' | 'down'
}) {
  return (
    <div className="stat" data-testid={testId}>
      <p className="hud-label">{label}</p>
      <p className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</p>
    </div>
  )
}

function TapeRow({
  id,
  quote,
  ticket,
  hits,
  recipe,
  liveBets,
  recipeLocked,
  onTape,
}: {
  id: TapeId
  quote: TapeQuote | null
  ticket: DeskTicket | undefined
  hits: { w: number; l: number }
  recipe: TapeRecipe
  liveBets: boolean
  recipeLocked: boolean
  onTape: (patch: Partial<TapeRecipe>) => void
}) {
  const status = ticketStatus(ticket)
  const pct = hitPct(hits)
  const live = quote?.live ?? null
  const beat = quote?.beat ?? 0
  const think = weThinkPair(live, beat, quote?.points ?? [])
  const paper = recipe.botOn && !(liveBets && recipe.botOn && recipe.liveOn)
  const [draft, setDraft] = useState(recipe.contracts)
  useEffect(() => {
    setDraft(recipe.contracts)
  }, [recipe.contracts])

  function saveContracts(raw: number = draft) {
    const n = clampContracts(Number(raw))
    setDraft(n)
    onTape({ contracts: n })
  }

  return (
    <article className="tape" data-testid={`tape-${id}`}>
      <div className="tape-row">
        <div className="hit-chip" data-testid={`hit-${id}`}>
          <span className="hit-k">24H</span>
          <span className="tape-hit">{pct}%</span>
          <span className="tape-wl" data-testid={`wl-${id}`}>
            {hits.w}W–{hits.l}L
          </span>
        </div>
        <p className="tape-name">
          {TAPE_META[id].label} · {quote?.clock || '—'}
        </p>
        <p className={`tape-status status-${status.toLowerCase()}`} data-testid={`status-${id}`}>
          {status}
        </p>
        <p className="tape-ticket" data-testid={`ticket-${id}`}>
          {ticket
            ? `${status} · ${ticket.contracts} · ${ticket.orderId}`
            : 'No ticket this clock'}
        </p>
        <CloseClock closeAt={quote?.closeAt} />
        <p className="tape-num" data-testid={`beat-${id}`}>
          BEAT {formatLive(id, beat || null)}
        </p>
      </div>

      <div className="tape-reads">
        <div>
          <p className="hud-label">LIVE</p>
          <p className="tape-num" data-testid={`live-${id}`}>
            {formatLive(id, live)}
          </p>
        </div>
        <div>
          <p className="hud-label">WE THINK</p>
          <p className="tape-think" data-testid={`we-think-${id}`}>
            {formatWeThink(id, think.live, think.ahead)}
          </p>
        </div>
        <div className="tape-cents">
          <p className="hud-label">UP / DOWN ¢</p>
          <p className="tape-ask" data-testid={`ask-${id}`}>
            <span className="tone-up">UP {Number.isFinite(quote?.yesAsk) ? `${quote!.yesAsk}¢` : '—'}</span>
            <span className="tone-down">DOWN {Number.isFinite(quote?.noAsk) ? `${quote!.noAsk}¢` : '—'}</span>
          </p>
        </div>
      </div>

      <RaceChart id={id} beat={beat} live={live} points={quote?.points} />

      <p className="tape-line">
        {paper ? 'PAPER · bot on / live cash or master off · not sent to Kalshi' : recipe.botOn ? 'bot armed' : 'bot OFF'}
        {ticket ? ` · live ticket ${ticket.orderId}` : ''}
      </p>

      <div className="tape-controls">
        <label className={`toggle ${recipe.botOn ? 'toggle-on' : ''}`}>
          <input
            type="checkbox"
            data-testid={`bot-${id}`}
            checked={recipe.botOn}
            onChange={(e) => onTape({ botOn: e.target.checked })}
          />
          Bot {recipe.botOn ? 'ON' : 'OFF'}
        </label>
        <label className={`toggle ${recipe.liveOn ? 'toggle-hot' : ''}`}>
          <input
            type="checkbox"
            data-testid={`live-cash-${id}`}
            checked={recipe.liveOn}
            onChange={(e) => onTape({ liveOn: e.target.checked })}
          />
          Live cash {recipe.liveOn ? 'ON' : 'OFF'}
        </label>
        <label className="contracts-field">
          Contracts
          <input
            className="field field-contracts"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            data-testid={`contracts-${id}`}
            value={draft}
            disabled={recipeLocked}
            onChange={(e) => {
              const n = clampContracts(Number(e.target.value))
              setDraft(n)
              onTape({ contracts: n })
            }}
            onBlur={() => saveContracts()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveContracts()
            }}
          />
        </label>
        <button
          type="button"
          className="chip-btn"
          data-testid={`save-${id}`}
          disabled={recipeLocked}
          onClick={() => saveContracts()}
        >
          Save
        </button>
      </div>
    </article>
  )
}

function PulseCard({
  ticket,
  quote,
  tone,
}: {
  ticket: DeskTicket | undefined
  quote: TapeQuote | null
  tone: 'quiet' | 'green' | 'red'
}) {
  const think = useMemo(
    () => weThinkPair(quote?.live ?? null, quote?.beat ?? 0, quote?.points ?? []),
    [quote?.live, quote?.beat, quote?.fetchedAt],
  )
  const vs = quote?.live != null && quote.beat ? quote.live - quote.beat : null
  const vsLabel = quote
    ? `${TAPE_META[quote.id].short} VS LINE`
    : 'VS LINE'
  if (tone === 'quiet' || !ticket) {
    return (
      <section className="pulse pulse-quiet" data-testid="pulse">
        <p className="pulse-title">{quote ? TAPE_META[quote.id].pulseName : 'PULSE'}</p>
        <div className="pulse-grid">
          <div>
            <p className="hud-label">LINE TO BEAT</p>
            <p>{quote ? formatLive(quote.id, quote.beat) : '—'}</p>
          </div>
          <div>
            <p className="hud-label">WE THINK</p>
            <p data-testid="we-think">{quote ? formatWeThink(quote.id, think.live, think.ahead) : '—'}</p>
          </div>
          <div>
            <p className="hud-label">{vsLabel}</p>
            <p>
              {quote && vs != null
                ? `${vs >= 0 ? '+' : ''}${formatLive(quote.id, Math.abs(vs))}`
                : '—'}
            </p>
          </div>
        </div>
        <p className="pulse-note">
          {quote && vs != null
            ? `${vs >= 0 ? 'above' : 'below'} the gold line by ${formatLive(quote.id, Math.abs(vs))}`
            : 'all quiet'}
          . Hit % and TTL stay on each tape. No live ticket.
        </p>
      </section>
    )
  }
  const side = ticket.side === 'up' ? 'UP' : 'DOWN'
  return (
    <section className={`pulse pulse-${tone}`} data-testid="pulse">
      <p className="hud-label">Pulse · live ticket {ticket.orderId}</p>
      <p className="pulse-title">
        {TAPE_META[ticket.tape].pulseName} · {side}
      </p>
      <div className="pulse-grid">
        <div>
          <p className="hud-label">LINE TO BEAT</p>
          <p>{formatLive(ticket.tape, ticket.beat)}</p>
        </div>
        <div>
          <p className="hud-label">WE THINK</p>
          <p data-testid="we-think">{formatWeThink(ticket.tape, think.live, think.ahead)}</p>
        </div>
        <div>
          <p className="hud-label">{TAPE_META[ticket.tape].short} VS LINE</p>
          <p>
            {quote?.live != null
              ? `${quote.live - ticket.beat >= 0 ? '+' : ''}${formatLive(ticket.tape, Math.abs(quote.live - ticket.beat))}`
              : '—'}
          </p>
        </div>
      </div>
      <p className="pulse-note">
        {tone === 'green' ? 'live is on our side of BEAT' : 'live is against BEAT'}
      </p>
    </section>
  )
}

