import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDeskBoard, getKalshiBalance, getKalshiCash, getSettledDesk, placeKalshi } from '../lib/btc-data'
import {
  TAPE_IDS,
  TAPE_META,
  TAPE_CLOCKS,
  CLOCK_CALLOUT,
  CLOCK_LABELS,
  DEFAULT_CHART,
  defaultChartRanges,
  GOLD_RECIPES,
  applyBetsFilter,
  askInBand,
  cashGates,
  claimSend,
  clampContracts,
  disarmAllBots,
  eventsFromTickets,
  extractOrderId,
  formatCash,
  formatLive,
  formatNowDelta,
  formatPnl,
  formatWeThink,
  nowTone,
  hitPct,
  hydrateCashFromKalshi,
  inArmWindow,
  loadCash,
  loadHits,
  hydrateSettings,
  loadSettings,
  saveSettings,
  loadTickets,
  makePaperTicket,
  makeTicket,
  markFilled,
  mergeHitEvents,
  patchTape,
  releaseClaim,
  saveHits,
  setLiveBets,
  setTapeChart,
  setTapeClock,
  tabIsOpen,
  tapeLean,
  ticketStatus,
  ttlFromHits,
  upsertTicket,
  weThinkPair,
  type DeskSettings,
  type DeskTicket,
  type SendClaim,
  type ChartRange,
  type TapeClock,
  type TapeId,
  type TapeRecipe,
} from '../lib/tapes'
import { ticketCost } from '../lib/size-cash'
import type { DeskBoard, TapeQuote } from '../lib/types'
import {
  betKind,
  betWindowMs,
  cashUpdateForBet,
  bookFill,
  clearKill,
  engageKill,
  chasingLosses,
  isAllBetsFilter,
  HIT_FLOOR,
  last24hBets,
  liveArmGate,
  mergeKalshiHistoryToBook,
  liveSendGate,
  loadFinance,
  recipeRetuneGate,
  settleBook,
  syncTicketsIntoBook,
  type FinanceState,
} from '../lib/finance'
import { AnalystPanel } from './analyst-panel'
import { CloseClock } from './close-clock'
import { FinancePanel } from './finance-panel'
import { formatBetWindow, formatWindowRange } from '../lib/chicago-time'
import { RaceChart, useSmoothedLive } from './race-chart'
import { SettingsPanel } from './settings-panel'
import { TapeIcon } from './tape-icon'

export function Dashboard({ seedBoard }: { seedBoard: DeskBoard | null }) {
  const [settings, setSettings] = useState<DeskSettings>(() => hydrateSettings(null))
  const [tickets, setTickets] = useState<DeskTicket[]>(() => loadTickets())
  const [hits, setHits] = useState(() => loadHits())
  const [cash, setCash] = useState(() => loadCash())
  const [hostCreds, setHostCreds] = useState(false)
  const [msg, setMsg] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [book, setBook] = useState<FinanceState>(() => loadFinance())
  const [liveConfirm, setLiveConfirm] = useState(false)
  const [analystOpen, setAnalystOpen] = useState(false)
  const [financeOpen, setFinanceOpen] = useState(false)
  const sentRef = useRef<Record<string, SendClaim>>({})

  function applyCashAndSettlements(r: {
    cash?: number | null
    deposits?: unknown
    settlements?: unknown
    fills?: unknown
    positions?: unknown
    hostCreds?: boolean
  }) {
    const next = hydrateCashFromKalshi(r, loadCash())
    setCash(next.cash)
    setHits(next.hits)
    if (r.hostCreds === true) setHostCreds(true)
    if (r.settlements != null || r.fills != null || r.positions != null) {
      setBook((prev) =>
        mergeKalshiHistoryToBook(prev, {
          fills: r.fills,
          settlements: r.settlements,
          positions: r.positions,
          fromMs: next.cash.firstDepositAt ?? 0,
        }),
      )
    }
  }

  useLayoutEffect(() => {
    setSettings(saveSettings({ ...loadSettings(), charts: defaultChartRanges() }))
    const nextTickets = loadTickets()
    setTickets(nextTickets)
    setHits(loadHits())
    setCash(loadCash())
    setBook(
      syncTicketsIntoBook(loadFinance(), nextTickets, () => ({
        clock: '',
        closeAt: 0,
        ask: 50,
      })),
    )
    void getKalshiBalance()
      .then((r) => applyCashAndSettlements(r))
      .catch(() => {
        /* host keys missing or balance miss — latch stays */
      })
    void getKalshiCash()
      .then((r) => applyCashAndSettlements(r))
      .catch(() => {
        /* settlements follow cash — latch stays */
      })
  }, [])

  const boardQuery = useQuery({
    queryKey: ['desk-board', settings.clocks],
    queryFn: () => getDeskBoard({ data: { clocks: settings.clocks } }),
    refetchInterval: 1000,
    placeholderData: keepPreviousData,
    initialData: seedBoard ?? undefined,
    staleTime: 400,
  })

  const board = boardQuery.data ?? seedBoard

  async function refreshCash() {
    try {
      const fast = await getKalshiBalance()
      applyCashAndSettlements(fast)
      setMsg(fast.hostCreds ? '' : 'Kalshi host keys missing on Windows')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'balance failed')
    }
    try {
      const r = await getKalshiCash()
      applyCashAndSettlements(r)
    } catch {
      /* cash already painted — settlements optional */
    }
  }

  const cashQuery = useQuery({
    queryKey: ['kalshi-balance'],
    queryFn: () => getKalshiBalance(),
    refetchInterval: 15_000,
    staleTime: 2_000,
    refetchOnMount: 'always',
  })

  const cashHitsQuery = useQuery({
    queryKey: ['kalshi-cash-hits'],
    queryFn: () => getKalshiCash(),
    refetchInterval: 30_000,
    staleTime: 8_000,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (!cashQuery.data) return
    applyCashAndSettlements(cashQuery.data)
  }, [cashQuery.data])

  useEffect(() => {
    if (!cashHitsQuery.data) return
    applyCashAndSettlements(cashHitsQuery.data)
  }, [cashHitsQuery.data])

  const settledQuery = useQuery({
    queryKey: ['settled-desk'],
    queryFn: () => getSettledDesk(),
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  useEffect(() => {
    const settled = settledQuery.data
    if (!settled?.length) return
    const recent = settled.filter((s) => !s.closeAt || s.closeAt >= Date.now() - 24 * 60 * 60 * 1000)
    const ev = eventsFromTickets(tickets, recent)
    if (ev.length) setHits((prev) => saveHits(mergeHitEvents(prev, ev)))
    setBook((prev) => settleBook(prev, recent))
  }, [settledQuery.data, tickets])

  function sendPaper(tape: TapeId, side: 'up' | 'down', quote: TapeQuote) {
    if (!tabIsOpen() || !quote.ticker) return
    const ticket = makePaperTicket({
      tape,
      ticker: quote.ticker,
      side,
      contracts: settings.tapes[tape].contracts,
      beat: quote.beat,
    })
    if (!ticket) {
      releaseClaim(sentRef.current, `${tape}:${quote.ticker}`)
      return
    }
    const ask = side === 'down' ? quote.noAsk : quote.yesAsk
    markFilled(sentRef.current, `${tape}:${quote.ticker}`, ticket.orderId)
    setTickets((prev) => upsertTicket(prev, ticket))
    const booked = bookFill(book, {
      tape,
      ticker: quote.ticker,
      clock: quote.clockId || quote.clock,
      closeAt: quote.closeAt,
      side,
      count: ticket.contracts,
      ask,
      orderId: ticket.orderId,
    })
    if (booked.ok) setBook(booked.state)
    setMsg(`${TAPE_META[tape].label} PAPER ${side.toUpperCase()} ${ticket.orderId}`)
  }

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
    if (!quote.ticker) return
    if (quote.tradingActive === false) {
      setMsg(`${TAPE_META[tape].label} Kalshi window closed — sit`)
      return
    }
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
      clock: quote.clockId || quote.clock,
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
      if (quote.tradingActive === false) continue
      if (ticketFor(tickets, id, quote.ticker)) continue
      if (!inArmWindow(gold, quote.closeAt)) continue
      const lean = tapeLean({ id, live: quote.live, beat: quote.beat, recipe: gold })
      if (lean === 'sit') continue
      const ask = lean === 'down' ? quote.noAsk : quote.yesAsk
      if (!askInBand(ask, gold)) continue
      const key = `${id}:${quote.ticker}`
      const gates = cashGates(settings, id)
      if (claimSend(sentRef.current, key) !== 'send') continue
      if (gates.ok) void sendLive(id, lean, quote)
      else if (!settings.liveBets && !recipe.liveOn) sendPaper(id, lean, quote)
    }
  }, [board?.fetchedAt, settings, tickets, book.killed])

  const ttl = ttlFromHits(hits)
  const bets24 = last24hBets(book, hits, Date.now(), settings.betsFilter, cash.firstDepositAt ?? 0)

  return (
    <div className="desk">
      <header className="desk-head" data-testid="desk-head">
        <div className="brand-bar">
          <div className="wordmark" data-testid="wordmark">
            <h1 data-testid="desk-title">HUB / PREDICTIONS</h1>
          </div>
          <div className="rain" data-testid="rain" aria-hidden="true" />
          <div className="brand-actions">
            <label className={`toggle glyph-plate ${settings.liveBets ? 'toggle-hot' : ''}`}>
              <input
                type="checkbox"
                data-testid="live-bets"
                checked={settings.liveBets}
                onChange={(e) => {
                  if (e.target.checked) setLiveConfirm(true)
                  else {
                    setLiveConfirm(false)
                    setSettings(setLiveBets(settings, false))
                  }
                }}
              />
              Live {settings.liveBets ? 'ON' : 'OFF'}
            </label>
            <button
              type="button"
              className="chip-btn glyph-plate"
              data-testid="settings-toggle"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              {settingsOpen ? 'Hide' : 'Settings'}
            </button>
          </div>
        </div>
        <div className="stat-row scoreboard-row" data-testid="scoreboard">
          <Stat
            label="P&L"
            value={cash.pnl != null ? formatPnl(cash.pnl) : '—'}
            testId="pnl"
            tone={cash.pnl != null && cash.pnl < 0 ? 'down' : cash.pnl != null && cash.pnl > 0 ? 'up' : undefined}
          />
          <Stat label="TTL 24H" value={`${ttl.pct}% ${ttl.w}W–${ttl.l}L`} testId="ttl" />
          <Stat label="KALSHI CASH" value={formatCash(cash.cash)} testId="kalshi-cash" />
        </div>
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
                  hasKeys: hostCreds,
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
        <div className="tape-grid">
          {TAPE_IDS.map((id) => (
            <TapeRow
              key={id}
              id={id}
              quote={board?.tapes[id] ?? null}
              ticket={ticketFor(tickets, id, board?.tapes[id]?.ticker)}
              hits={hits.tapes[id]}
              recipe={settings.tapes[id]}
              clock={settings.clocks[id]}
              chart={settings.charts?.[id] ?? DEFAULT_CHART}
              liveBets={settings.liveBets}
              recipeLocked={chasingLosses(book) || book.killed}
              onClock={(next) => setSettings(setTapeClock(settings, id, next))}
              onChart={(next) => setSettings(setTapeChart(settings, id, next))}
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

        <Bets24Strip
          placed={bets24.placed}
          w={bets24.w}
          l={bets24.l}
          pnl={isAllBetsFilter(settings.betsFilter) && cash.pnl != null ? cash.pnl : bets24.pnl}
          open={bets24.open}
          pct={bets24.pct}
          rows={book.bets
            .filter((b) => settings.betsFilter.includes(b.tape))
            .slice()
            .sort((a, b) => (b.filledAt || b.settledAt || 0) - (a.filledAt || a.settledAt || 0))}
          filter={settings.betsFilter}
          onFilter={(chip) => setSettings((cur) => applyBetsFilter(cur, chip))}
        />

        <div className="under-desk" data-testid="under-desk">
          <button
            type="button"
            className="chip-btn tap"
            data-testid="analyst-toggle"
            onClick={() => setAnalystOpen((v) => !v)}
          >
            {analystOpen ? 'Hide Analyst' : 'Analyst'}
          </button>
          <button
            type="button"
            className="chip-btn tap"
            data-testid="finance-toggle"
            onClick={() => setFinanceOpen((v) => !v)}
          >
            {financeOpen ? 'Hide Finance' : 'Finance'}
          </button>
        </div>
        {analystOpen ? <AnalystPanel board={board ?? null} hits={hits} /> : null}
        {financeOpen ? (
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
        ) : null}

        {msg ? <p className="desk-msg">{msg}</p> : null}

        {settingsOpen ? (
          <SettingsPanel
            settings={settings}
            cashLabel={`Cash ${formatCash(cash.cash)}`}
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
      <p className="hud-label" data-testid={`${testId}-label`}>
        {label}
      </p>
      <p className={`stat-value ${tone ? `tone-${tone}` : ''}`} data-testid={`${testId}-value`}>
        {value}
      </p>
    </div>
  )
}

function TapeRow({
  id,
  quote,
  ticket,
  hits,
  recipe,
  clock,
  chart,
  liveBets,
  recipeLocked,
  onClock,
  onChart,
  onTape,
}: {
  id: TapeId
  quote: TapeQuote | null
  ticket: DeskTicket | undefined
  hits: { w: number; l: number }
  recipe: TapeRecipe
  clock: TapeClock
  chart: ChartRange
  liveBets: boolean
  recipeLocked: boolean
  onClock: (clock: TapeClock) => void
  onChart: (chart: ChartRange) => void
  onTape: (patch: Partial<TapeRecipe>) => void
}) {
  const status = ticketStatus(ticket)
  const pct = hitPct(hits)
  const live = quote?.live ?? null
  const shownLive = useSmoothedLive(live)
  const beat = quote?.beat ?? 0
  const think = weThinkPair(live, beat, quote?.points ?? [])
  const paper = recipe.botOn && !(liveBets && recipe.botOn && recipe.liveOn)
  const callout = CLOCK_CALLOUT[clock]
  const tone = nowTone(live, beat)
  const liveOn = quote?.tradingActive === true
  const [draft, setDraft] = useState(recipe.contracts)
  const contractsRef = useRef<HTMLInputElement>(null)
  const lastTicker = useRef(quote?.ticker ?? '')
  useEffect(() => {
    setDraft(recipe.contracts)
  }, [recipe.contracts])
  useEffect(() => {
    const ticker = quote?.ticker ?? ''
    if (lastTicker.current && ticker && lastTicker.current !== ticker && chart !== DEFAULT_CHART) {
      onChart(DEFAULT_CHART)
    }
    lastTicker.current = ticker
  }, [quote?.ticker, chart, onChart])

  function saveContracts(raw?: number) {
    const fromDom = contractsRef.current ? Number(contractsRef.current.value) : draft
    const n = clampContracts(Number(raw ?? fromDom))
    setDraft(n)
    patchTape(loadSettings(), id, { contracts: n })
    onTape({ contracts: n })
  }

  return (
    <article className={`tape tape-${id}`} data-testid={`tape-${id}`} data-tape={id}>
      <header className="tape-head">
        <div className="tape-identity">
          <TapeIcon id={id} />
          <div className="tape-callout">
            <p className="tape-kicker glyph-plate">
              {TAPE_META[id].label} / {callout.kicker}
            </p>
            <h2 className="tape-title glyph-plate" data-testid={`name-${id}`}>
              {TAPE_META[id].label} {callout.title}
            </h2>
            <p className="tape-window glyph-plate">
              <span className="tape-name">
                {formatWindowRange(quote?.openAt, quote?.closeAt)}
              </span>
              {liveOn ? (
                <span className="tape-live-flag">
                  <span className="live-dot" /> LIVE
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="tape-head-tools">
          <CloseClock closeAt={quote?.closeAt} />
          <p className={`tape-status status-${status.toLowerCase()}`} data-testid={`status-${id}`}>
            {status}
          </p>
        </div>
      </header>

      <div className="tape-marks">
        <div className="mark-beat glyph-plate" data-testid={`beat-${id}`}>
          <p className="mark-label beat-k" data-testid={`beat-label-${id}`}>
            TO BEAT
          </p>
          <p className="tape-num" data-testid={`beat-value-${id}`}>
            {formatLive(id, beat || null)}
          </p>
          <p className="mark-sub">{quote?.clock || '—'}</p>
        </div>
        <div className="mark-now live-read glyph-plate" data-testid={`live-plate-${id}`}>
          <p className="mark-label">NOW</p>
          <p className={`tape-num${tone ? ` tone-${tone}` : ''}`} data-testid={`live-${id}`}>
            {formatLive(id, shownLive)}
          </p>
          <p className={`mark-sub now-delta${tone ? ` tone-${tone}` : ''}`} data-testid={`now-delta-${id}`}>
            {formatNowDelta(id, shownLive, beat)}
          </p>
        </div>
      </div>

      <div className="tape-row">
        <div className="hit-chip" data-testid={`hit-${id}`}>
          <span className="hit-k">24H</span>
          <span className="tape-hit">{pct}%</span>
          <span className="tape-wl" data-testid={`wl-${id}`}>
            {hits.w}W–{hits.l}L
          </span>
        </div>
        <label className="clock-field glyph-plate">
          Clock
          <select
            className="clock-select"
            data-testid={`clock-${id}`}
            value={clock}
            onChange={(e) => onClock(e.target.value as TapeClock)}
          >
            {TAPE_CLOCKS.map((c) => (
              <option key={c} value={c}>
                {CLOCK_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <p className="tape-ticket" data-testid={`ticket-${id}`}>
          {ticket ? `${status} · ${ticket.contracts} · ${ticket.orderId}` : 'No ticket this clock'}
        </p>
      </div>

      <div className="tape-reads">
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

      <RaceChart
        id={id}
        beat={beat}
        live={live}
        points={quote?.points}
        clock={clock}
        chart={chart}
        openAt={quote?.openAt}
        closeAt={quote?.closeAt}
        onChart={onChart}
      />

      {paper || ticket ? (
        <p className="tape-banner glyph-plate" data-testid={`banner-${id}`}>
          {ticket ? `${ticket.orderId.startsWith('deskfill') ? 'PAPER' : 'LIVE'} ${status}` : 'PAPER'}
        </p>
      ) : null}

      <div className="tape-controls">
        <label className={`toggle tap glyph-plate ${recipe.botOn ? 'toggle-on' : ''}`}>
          <input
            type="checkbox"
            data-testid={`bot-${id}`}
            checked={recipe.botOn}
            onChange={(e) => onTape({ botOn: e.target.checked })}
          />
          Bot {recipe.botOn ? 'ON' : 'OFF'}
        </label>
        <label className={`toggle tap glyph-plate ${recipe.liveOn ? 'toggle-hot' : ''}`}>
          <input
            type="checkbox"
            data-testid={`live-cash-${id}`}
            checked={recipe.liveOn}
            onChange={(e) => onTape({ liveOn: e.target.checked })}
          />
          Live cash {recipe.liveOn ? 'ON' : 'OFF'}
        </label>
        <label className="contracts-field">
          <span className="contracts-label glyph-plate" data-testid={`contracts-label-${id}`}>
            Contracts
          </span>
          <input
            className="field field-contracts"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            data-testid={`contracts-${id}`}
            value={draft}
            disabled={recipeLocked}
            ref={contractsRef}
            onChange={(e) => {
              const n = clampContracts(Number(e.target.value))
              setDraft(n)
              onTape({ contracts: n })
            }}
            onInput={(e) => {
              const n = clampContracts(Number((e.target as HTMLInputElement).value))
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
          className="chip-btn tap glyph-plate"
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

function Bets24Strip({
  placed,
  w,
  l,
  pnl,
  open,
  pct,
  rows,
  filter,
  onFilter,
}: {
  placed: number
  w: number
  l: number
  pnl: number
  open: number
  pct: number
  rows: Array<{
    betId: string
    tape: TapeId
    ticker: string
    side: 'up' | 'down'
    status: 'open' | 'settled'
    spent: number
    pnl: number | null
    clock?: string
    closeAt?: number
    filledAt?: number
    kind?: 'live' | 'paper'
    orderId?: string
  }>
  filter: TapeId[]
  onFilter: (chip: 'all' | TapeId) => void
}) {
  const allOn = isAllBetsFilter(filter)
  return (
    <section className="bets-24h" data-testid="bets-24h" data-filter={filter.join(',')}>
      <p className="hud-label">Bets since first deposit · P&L is live only · paper in hit · hit floor {HIT_FLOOR}%</p>
      <div className="bets-filter" data-testid="bets-filter">
        <button
          type="button"
          className={`filter-chip glyph-plate${allOn ? ' toggle-on' : ''}`}
          data-testid="bets-filter-all"
          aria-pressed={allOn}
          onClick={() => onFilter('all')}
        >
          All
        </button>
        {TAPE_IDS.map((id) => {
          const on = !allOn && filter.includes(id)
          return (
            <button
              key={id}
              type="button"
              className={`filter-chip glyph-plate${on ? ' toggle-on' : ''}`}
              data-testid={`bets-filter-${id}`}
              aria-pressed={on}
              onClick={() => onFilter(id)}
            >
              {TAPE_META[id].short}
            </button>
          )
        })}
      </div>
      <div className="scoreboard-row">
        <Stat label="PLACED" value={placed > 0 || open > 0 ? formatCash(placed) : '—'} testId="bets-placed" />
        <Stat
          label="WINS–LOSSES"
          value={`${w}W–${l}L · ${open} open${w + l > 0 ? ` · ${pct}%${pct > 0 && pct < HIT_FLOOR ? ` <${HIT_FLOOR}%` : ''}` : ''}`}
          testId="bets-wl"
        />
        <Stat
          label="P&L"
          value={w + l === 0 && placed === 0 && pnl === 0 ? '—' : formatPnl(pnl)}
          testId="bets-pnl"
          tone={pnl < 0 ? 'down' : pnl > 0 ? 'up' : undefined}
        />
      </div>
      {rows.length ? (
        <div className="bets-log-wrap">
          <div className="bets-log-row bets-log-head" aria-hidden>
            <span>TAPE</span>
            <span>WINDOW</span>
            <span>SIDE</span>
            <span>RESULT</span>
            <span>MODE</span>
            <span>SPENT</span>
            <span>P&L</span>
            <span>CASH</span>
          </div>
          <ul className="bets-log" data-testid="bets-log">
            {rows.map((b) => {
              const settled = b.status === 'settled' && b.pnl != null
              const result = b.status === 'open' ? 'OPEN' : (b.pnl ?? 0) > 0 ? 'WIN' : (b.pnl ?? 0) < 0 ? 'LOSS' : 'PUSH'
              const rowPnl = settled ? (b.pnl as number) : null
              const mode = betKind(b).toUpperCase()
              const cashUp = cashUpdateForBet(b)
              const cashText =
                cashUp.kind === 'paper' ? 'N/A' : cashUp.kind === 'open' || cashUp.amount == null ? '—' : formatPnl(cashUp.amount)
              return (
                <li key={b.betId} className="bets-log-row" data-kind={betKind(b)}>
                  <span>{b.tape.toUpperCase()}</span>
                  <span data-testid="bets-window">{formatBetWindow(b.closeAt, betWindowMs(b), b.filledAt)}</span>
                  <span>{b.side.toUpperCase()}</span>
                  <span>{result}</span>
                  <span data-testid="bets-mode">{mode}</span>
                  <span>{formatCash(b.spent)}</span>
                  <span
                    className={rowPnl == null ? undefined : rowPnl > 0 ? 'tone-up' : rowPnl < 0 ? 'tone-down' : undefined}
                  >
                    {rowPnl == null ? '—' : formatPnl(rowPnl)}
                  </span>
                  <span
                    data-testid="bets-cash"
                    className={
                      cashUp.kind === 'paper' || cashUp.amount == null
                        ? undefined
                        : cashUp.amount > 0
                          ? 'tone-up'
                          : cashUp.amount < 0
                            ? 'tone-down'
                            : undefined
                    }
                  >
                    {cashText}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="settings-note">No Kalshi fills since first deposit. Soft FAIL Live POST.</p>
      )}
    </section>
  )
}

