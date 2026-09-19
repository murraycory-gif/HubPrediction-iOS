import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getClockSettle, getDeskBoard, getDeskBriefs, getDeskState, getKalshiBalance, getKalshiBook, getKalshiCash, getLivePrints, getSettledDesk, getTapePaths, placeKalshi, saveDeskState } from '../lib/btc-data'
import { applyHostDeskState, hostSettingsNewer, SETTINGS_DEBOUNCE_MS, SETTINGS_LATCH_MS } from '../lib/desk-hydrate'
import { DESK_TICK_MS, useDeskTick } from '../lib/desk-tick'
import { setHostDeskWriter } from '../lib/desk-persist'
import {
  TAPE_IDS,
  TAPE_META,
  TAPE_CLOCKS,
  CLOCK_CALLOUT,
  CLOCK_LABELS,
  DEFAULT_CHART,
  LIVE_PRINT_MS,
  applyBetsFilter,
  boardEventTickers,
  boardPollMs,
  nextBoardRolloverWait,
  holdLiveEvents,
  latchDeskBoard,
  loadHeldBoard,
  quoteHasClock,
  quoteIsLiveClock,
  holdTapeQuote,
  trueLiveGate,
  saveHeldBoard,
  mergeLiveOntoBoard,
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
  settingsReadyToPush,
  loadTickets,
  makePaperTicket,
  makeTicket,
  markFilled,
  mergeHitEvents,
  patchTape,
  releaseClaim,
  saveHits,
  setTapeChart,
  setTapeClock,
  tabIsOpen,
  tapeLean,
  ticketFillStrip,
  ticketStatus,
  displayTicket,
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
import { nextClockLabel, tapeHoursLine, tapeSessionHours } from '../lib/tape-hours'
import type { DeskBoard, LivePrints, TapeQuote } from '../lib/types'
import {
  betClockLabel,
  betKind,
  betWindowMs,
  cashAfterEachBet,
  bookFill,
  collapseClockBets,
  openDeskFillOnTicker,
  clearKill,
  engageKill,
  chasingLosses,
  isAllBetsFilter,
  HIT_FLOOR,
  last24hBets,
  tapeHitCell,
  tapeBotNote,
  liveBotCall,
  paperFillAllowed,
  liveSendGate,
  liveArmGateForDesk,
  loadFinance,
  recipeRetuneGate,
  hitFloorGate,
  recentLiveTapeWL,
  settleBook,
  syncTicketsIntoBook,
  dailyPnlFloorHit,
  DAILY_PNL_FLOOR_PAPER,
  type FinanceState,
} from '../lib/finance'
import { acceptAnalystRecipe, analyzeDesk, isRehabPaper, loadAutoState, runAutoAnalyst, type AnalystAutoState } from '../lib/analyst'
import { AnalystPanel } from './analyst-panel'
import { CloseClock } from './close-clock'
import { readTestCloseClock } from '../lib/close-clock'
import { FinancePanel } from './finance-panel'
import { formatBetWindow, formatWindowRange } from '../lib/chicago-time'
import { applyKalshiBook, BOOK_LATCH_MS } from '../lib/kalshi-book'
import { applyClockSettle, balanceLatchMs, clocksNeedingSettle, readTestClockSettle } from '../lib/settle-latch'
import { RaceChart, useSmoothedLive } from './race-chart'
import { SettingsPanel } from './settings-panel'
import { TapeIcon } from './tape-icon'

export function Dashboard({ seedBoard }: { seedBoard: DeskBoard | null }) {
  const [hostReady, setHostReady] = useState(false)
  const [settings, setSettings] = useState<DeskSettings>(() => hydrateSettings(null))
  const [tickets, setTickets] = useState<DeskTicket[]>(() => loadTickets())
  const [hits, setHits] = useState(() => loadHits())
  const [cash, setCash] = useState(() => loadCash())
  const [hostCreds, setHostCreds] = useState(false)
  const [msg, setMsg] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [book, setBook] = useState<FinanceState>(() => loadFinance())
  const [analystOpen, setAnalystOpen] = useState(true)
  const [financeOpen, setFinanceOpen] = useState(false)
  const [rehab, setRehab] = useState<AnalystAutoState>(() => loadAutoState())
  const sentRef = useRef<Record<string, SendClaim>>({})
  const lastLocalWrite = useRef(0)
  const wall = useDeskTick()

  function applyCashAndSettlements(r: {
    cash?: number | null
    deposits?: unknown
    settlements?: unknown
    fills?: unknown
    positions?: unknown
    orders?: unknown
    hostCreds?: boolean
    fetchedAt?: number
  }) {
    const next = hydrateCashFromKalshi(r, loadCash())
    setCash(next.cash)
    setHits(next.hits)
    setHostCreds(r.hostCreds === true)
    if (r.settlements != null || r.fills != null || r.positions != null || r.orders != null) {
      setBook((prev) =>
        applyKalshiBook(prev, {
          cash: r.cash,
          fills: r.fills,
          settlements: r.settlements,
          positions: r.positions,
          orders: r.orders,
          fetchedAt: r.fetchedAt ?? Date.now(),
          hostCreds: r.hostCreds === true,
        }),
      )
    }
  }

  useLayoutEffect(() => {
    setSettings(loadSettings())
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
    setRehab(loadAutoState())
    let writeChain = Promise.resolve()
    const writeHost = (patch: { settings?: unknown; tickets?: unknown; finance?: unknown; hits?: unknown }) => {
      if (patch.settings) lastLocalWrite.current = Date.now()
      writeChain = writeChain.catch(() => undefined).then(() => saveDeskState({ data: patch }).then(() => undefined))
      return writeChain
    }
    setHostDeskWriter(writeHost)
    void getDeskState({ data: { t: Date.now() } })
      .then(async (host) => {
        if (host && applyHostDeskState(host)) {
          setSettings(loadSettings())
          const hostTickets = loadTickets()
          setTickets(hostTickets)
          setBook(
            syncTicketsIntoBook(loadFinance(), hostTickets, () => ({
              clock: '',
              closeAt: 0,
              ask: 50,
            })),
          )
        }
        setHostDeskWriter(writeHost)
        const local = loadSettings()
        await writeHost({
          settings: settingsReadyToPush(local) ? local : undefined,
          tickets: loadTickets(),
          finance: loadFinance(),
        })
        setHostReady(true)
      })
      .catch(async () => {
        setHostDeskWriter(writeHost)
        const local = loadSettings()
        await writeHost({
          settings: settingsReadyToPush(local) ? local : undefined,
          tickets: loadTickets(),
          finance: loadFinance(),
        })
        setHostReady(true)
      })
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
    return () => setHostDeskWriter(null)
  }, [])

  useEffect(() => {
    if (!hostReady) return
    let cancelled = false
    const latchHost = async () => {
      try {
        const host = await getDeskState({ data: { t: Date.now() } })
        if (cancelled || !host) return
        const newer = hostSettingsNewer(host)
        const applied = applyHostDeskState(host)
        if (!applied && !newer) return
        setSettings(loadSettings())
        const hostTickets = loadTickets()
        setTickets(hostTickets)
        setBook(
          syncTicketsIntoBook(loadFinance(), hostTickets, () => ({
            clock: '',
            closeAt: 0,
            ask: 50,
          })),
        )
      } catch {
        /* host latch stays */
      }
    }
    void latchHost()
    const id = window.setInterval(() => {
      void latchHost()
    }, SETTINGS_LATCH_MS)
    const onFocus = () => {
      void latchHost()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [hostReady])

  const heldBoard = useRef<DeskBoard | null>(seedBoard ?? loadHeldBoard())
  const heldEvents = useRef<Partial<Record<TapeId, string>>>({})

  const boardQuery = useQuery({
    queryKey: ['desk-board', settings.clocks],
    queryFn: async () => {
      try {
        const next = await getDeskBoard({ data: { clocks: settings.clocks } })
        return latchDeskBoard(next, heldBoard.current) ?? next
      } catch {
        if (heldBoard.current) return heldBoard.current
        throw new Error('desk board miss')
      }
    },
    refetchInterval: (q) => boardPollMs(q.state.data),
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
    initialData: seedBoard ?? undefined,
    staleTime: 350,
    retry: 1,
    retryDelay: 250,
    refetchOnWindowFocus: false,
  })

  const structure = useMemo(() => {
    const next = latchDeskBoard(boardQuery.data ?? seedBoard, heldBoard.current)
    if (next) {
      heldBoard.current = next
      saveHeldBoard(next)
    }
    return next ?? heldBoard.current
  }, [boardQuery.data, seedBoard])
  const rolloverKey = TAPE_IDS.map((id) => {
    const q = structure?.tapes[id]
    return `${q?.ticker ?? ''}:${q?.closeAt ?? 0}:${q?.tradingActive === false ? 0 : 1}`
  }).join('|')

  useEffect(() => {
    const wait = nextBoardRolloverWait(structure)
    if (wait == null) return
    const id = window.setTimeout(() => {
      void boardQuery.refetch()
    }, wait)
    return () => window.clearTimeout(id)
  }, [rolloverKey, boardQuery.refetch])

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const board = heldBoard.current
      if (!board) return
      if (TAPE_IDS.some((tape) => board.tapes[tape] && !quoteIsLiveClock(board.tapes[tape], now))) {
        void boardQuery.refetch()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [boardQuery.refetch])

  const liveEventKey = TAPE_IDS.map((id) => structure?.tapes[id]?.eventTicker ?? '').join('|')
  const liveEvents = useMemo(() => {
    const next = holdLiveEvents(boardEventTickers(structure), heldEvents.current)
    heldEvents.current = next
    return next
  }, [liveEventKey])

  const printsHold = useRef<LivePrints | null>(null)
  const printsQuery = useQuery({
    queryKey: ['live-prints', liveEvents, settings.charts, settings.clocks],
    queryFn: async () => {
      try {
        return await getLivePrints({ data: { events: liveEvents, charts: settings.charts, clocks: settings.clocks } })
      } catch {
        return printsHold.current ?? { tapes: { btc: null, ng: null, cu: null, gld: null }, fetchedAt: 0 }
      }
    },
    enabled: Object.values(liveEvents).some(Boolean),
    refetchInterval: LIVE_PRINT_MS,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
    staleTime: 40,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  if (printsQuery.data) printsHold.current = printsQuery.data

  const board = mergeLiveOntoBoard(structure, printsQuery.data ?? printsHold.current) ?? structure

  async function refreshCash() {
    try {
      const fast = await getKalshiBalance()
      applyCashAndSettlements(fast)
      setMsg(fast.hostCreds ? '' : 'Kalshi host keys missing on Windows')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'balance failed')
    }
    try {
      const r = await getKalshiBook()
      applyCashAndSettlements(r)
    } catch {
      try {
        const r = await getKalshiCash()
        applyCashAndSettlements(r)
      } catch {
        /* cash already painted — book optional */
      }
    }
  }

  const cashLatch = balanceLatchMs(book.bets, board, wall)
  const cashQuery = useQuery({
    queryKey: ['kalshi-balance'],
    queryFn: () => getKalshiBalance(),
    refetchInterval: cashLatch || 15_000,
    staleTime: cashLatch ? 0 : 2_000,
    refetchOnMount: 'always',
  })

  const cashHitsQuery = useQuery({
    queryKey: ['kalshi-cash-hits'],
    queryFn: () => getKalshiBook(),
    refetchInterval: cashLatch || BOOK_LATCH_MS,
    staleTime: cashLatch ? 0 : 1_000,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (readTestClockSettle()) return
    if (!cashQuery.data) return
    applyCashAndSettlements(cashQuery.data)
  }, [cashQuery.data])

  useEffect(() => {
    if (readTestClockSettle()) return
    if (!cashHitsQuery.data) return
    applyCashAndSettlements(cashHitsQuery.data)
  }, [cashHitsQuery.data])

  const settledQuery = useQuery({
    queryKey: ['settled-desk'],
    queryFn: () => getSettledDesk(),
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  const settleNeed = clocksNeedingSettle(book.bets, board, wall)
  const settleQuery = useQuery({
    queryKey: ['clock-settle', settleNeed.tickers.join('|')],
    queryFn: async () => {
      const test = readTestClockSettle()
      if (test) return test
      return getClockSettle({ data: { tickers: settleNeed.tickers, minTs: settleNeed.minTs } })
    },
    enabled: settleNeed.tickers.length > 0,
    refetchInterval: settleNeed.latchMs || false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    const settled = settledQuery.data
    if (!settled?.length) return
    const recent = settled.filter((s) => !s.closeAt || s.closeAt >= Date.now() - 24 * 60 * 60 * 1000)
    const ev = eventsFromTickets(tickets, recent)
    if (ev.length) setHits((prev) => saveHits(mergeHitEvents(prev, ev)))
    setBook((prev) => collapseClockBets(settleBook(prev, recent)))
  }, [settledQuery.data, tickets])

  useEffect(() => {
    const payload = settleQuery.data
    if (!payload) return
    setBook((prev) => applyClockSettle(prev, payload))
    if (payload.cash != null || payload.settlements != null || payload.orders != null || payload.fills != null) {
      applyCashAndSettlements(payload)
    }
  }, [settleQuery.dataUpdatedAt])

  useEffect(() => {
    if (readTestClockSettle()) return
    if (!settleNeed.tickers.length) return
    void cashHitsQuery.refetch()
  }, [settleNeed.tickers.join('|')])

  useEffect(() => {
    setBook((prev) =>
      syncTicketsIntoBook(prev, tickets, (t) => {
        const q = heldBoard.current?.tapes[t.tape]
        return {
          clock: q?.clockId || q?.clock || '',
          closeAt: q?.closeAt || 0,
          ask: (t.side === 'down' ? q?.noAsk : q?.yesAsk) ?? 50,
        }
      }),
    )
  }, [tickets])

  function liveDeskOn(tape: TapeId) {
    return cashGates(settings, tape).ok || cashGates(loadSettings(), tape).ok
  }

  function liveDeskFlags(tape: TapeId) {
    const stored = loadSettings().tapes[tape]
    const live = settings.tapes[tape]
    return {
      botOn: stored.botOn === true || live.botOn === true,
      liveOn: stored.liveOn === true || live.liveOn === true,
    }
  }

  function bookPaper(tape: TapeId, side: 'up' | 'down', quote: TapeQuote, note: string) {
    if (!quote.ticker) {
      releaseClaim(sentRef.current, `${tape}:`)
      return
    }
    const ask = side === 'down' ? quote.noAsk : quote.yesAsk
    const ticket = makePaperTicket({
      tape,
      ticker: quote.ticker,
      side,
      contracts: settings.tapes[tape].contracts,
      beat: quote.beat,
      ask,
    })
    if (!ticket) {
      releaseClaim(sentRef.current, `${tape}:${quote.ticker}`)
      return
    }
    markFilled(sentRef.current, `${tape}:${quote.ticker}`, ticket.orderId)
    setTickets((prev) => upsertTicket(prev, ticket))
    setBook((prev) => {
      const booked = bookFill(prev, {
        tape,
        ticker: quote.ticker,
        clock: quote.clockId || quote.clock,
        closeAt: quote.closeAt,
        side,
        count: ticket.contracts,
        ask,
        orderId: ticket.orderId,
      })
      return booked.ok ? collapseClockBets(booked.state) : prev
    })
    setMsg(note)
  }

  function sendPaper(tape: TapeId, side: 'up' | 'down', quote: TapeQuote) {
    if (!tabIsOpen() || !quote.ticker) return
    const halt = isRehabPaper(rehab, tape)
    const liveGate = trueLiveGate({
      quote,
      kalshiLive: printsQuery.data?.tapes[tape]?.live,
    })
    const allow = paperFillAllowed({
      liveCash: liveDeskOn(tape),
      rehabPaper: halt,
      stale: liveGate.stale && quote.tradingActive !== true,
    })
    if (!allow.ok) {
      void sendLive(tape, side, quote)
      return
    }
    bookPaper(tape, side, quote, `${TAPE_META[tape].label} ${allow.reason}`)
  }

  async function sendLive(tape: TapeId, side: 'up' | 'down', quote: TapeQuote) {
    const key = quote.ticker ? `${tape}:${quote.ticker}` : `${tape}:`
    const abortLive = (note: string) => {
      releaseClaim(sentRef.current, key)
      setMsg(note)
    }
    if (!tabIsOpen()) {
      abortLive('Send needs this tab open')
      return
    }
    if (isRehabPaper(rehab, tape)) {
      abortLive(`${TAPE_META[tape].label} live cash halted — paper rehab`)
      return
    }
    const flags = liveDeskFlags(tape)
    const gates = cashGates(settings, tape)
    if (!flags.botOn || !flags.liveOn) {
      abortLive(
        !flags.botOn && !gates.bot
          ? `${TAPE_META[tape].label} PAPER — bot off / not sent`
          : `${TAPE_META[tape].label} PAPER LOCK · Live cash OFF — paper only, not sent to Kalshi`,
      )
      return
    }
    if (!quote.ticker) {
      abortLive(`${TAPE_META[tape].label} Kalshi error — no ticker`)
      return
    }
    if (ticketFor(tickets, tape, quote.ticker) || openDeskFillOnTicker(book, quote.ticker)) {
      markFilled(sentRef.current, key, ticketFor(tickets, tape, quote.ticker)?.orderId || 'open')
      setMsg(`${TAPE_META[tape].label} one ticket this clock`)
      return
    }
    const liveGate = trueLiveGate({
      quote,
      kalshiLive: printsQuery.data?.tapes[tape]?.live,
    })
    if (quote.tradingActive === false || !quoteIsLiveClock(quote)) {
      bookPaper(tape, side, quote, `${TAPE_META[tape].label} ${liveGate.reason || 'STALE — paper only'}`)
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
      abortLive(`${TAPE_META[tape].label} Kalshi error — ${gate.reason}`)
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
          tape,
          botOn: flags.botOn,
          liveOn: flags.liveOn,
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
        ask,
      })
      if (!ticket) {
        abortLive(`${TAPE_META[tape].label} Kalshi returned no order id — no ticket`)
        return
      }
      markFilled(sentRef.current, key, ticket.orderId)
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
      if (booked.ok) setBook(collapseClockBets(booked.state))
      setMsg(`${TAPE_META[tape].label} ${ticketFillStrip(ticket, quote)}`)
      await refreshCash()
    } catch (e) {
      abortLive(e instanceof Error ? e.message : `${TAPE_META[tape].label} Kalshi error — IOC miss`)
    }
  }

  useEffect(() => {
    if (!hostReady || !board || !tabIsOpen() || book.killed) return
    const stored = loadSettings()
    for (const id of TAPE_IDS) {
      const quote = board.tapes[id]
      const recipe = settings.tapes[id]
      const botOn = stored.tapes[id].botOn === true || recipe.botOn === true
      const liveCash = stored.tapes[id].liveOn === true || recipe.liveOn === true
      if (!quote?.ticker || !botOn) continue
      if (quote.tradingActive === false) continue
      const liveGate = trueLiveGate({
        quote,
        kalshiLive: printsQuery.data?.tapes[id]?.live,
      })
      if (ticketFor(tickets, id, quote.ticker)) continue
      if (!inArmWindow(recipe, quote.closeAt)) continue
      const lean = tapeLean({ id, live: quote.live, beat: quote.beat, recipe })
      if (lean === 'sit') continue
      const ask = lean === 'down' ? quote.noAsk : quote.yesAsk
      if (!askInBand(ask, recipe)) continue
      const key = `${id}:${quote.ticker}`
      const paperRehab = isRehabPaper(rehab, id)
      const recent = recentLiveTapeWL(book.bets, id, 12)
      const call = liveBotCall({
        tabOpen: true,
        killed: book.killed,
        botOn,
        liveCash,
        rehabPaper: paperRehab,
        tradingActive: quoteIsLiveClock(quote),
        inArm: true,
        askOk: true,
        lean,
        hitOk: hitFloorGate(recent.w, recent.l).ok,
        fresh: liveGate.ok,
        stale: liveGate.stale,
      })
      if (call === 'sit') continue
      if (claimSend(sentRef.current, key) !== 'send') continue
      if (call === 'paper') {
        sendPaper(id, lean, quote)
        continue
      }
      void sendLive(id, lean, quote)
    }
  }, [hostReady, board, printsQuery.dataUpdatedAt, settings, tickets, book, hits, rehab])

  useEffect(() => {
    if (!hostReady || book.killed) return
    if (!dailyPnlFloorHit(book)) return
    setBook(engageKill(book))
    setSettings(disarmAllBots(loadSettings()))
    setMsg(`floor hit — daily P/L ≤ ${DAILY_PNL_FLOOR_PAPER}. KILL on. Place blocked.`)
  }, [hostReady, book])

  useEffect(() => {
    if (!hostReady || book.killed) return
    const stored = loadSettings()
    const report = analyzeDesk(board ?? null, hits, book.bets, stored.tapes)
    const next = runAutoAnalyst({
      settings: stored,
      report,
      bets: book.bets,
      rehab,
      killed: book.killed,
    })
    if (!next.didChange) return
    setSettings(next.settings)
    setRehab(next.rehab)
    if (next.msg) setMsg(next.msg)
  }, [hostReady, board, book.bets, book.killed, hits, rehab, settings])

  const hitFrom = cash.firstDepositAt ?? 0
  const ttl = last24hBets(book, hits, Date.now(), TAPE_IDS)
  const bets24 = last24hBets(book, hits, Date.now(), settings.betsFilter, hitFrom)
  const cashByBet = useMemo(
    () => cashAfterEachBet(book.bets, cash.cash, cash.deposits),
    [book.bets, cash.cash, cash.deposits],
  )

  return (
    <div className="desk" data-testid="desk" data-desk-tick={DESK_TICK_MS} data-print-ms={LIVE_PRINT_MS} data-settle-latch={settleNeed.latchMs || 0} data-balance-latch={cashLatch || 0} data-book-latch={BOOK_LATCH_MS} data-settings-latch={SETTINGS_LATCH_MS}>
      <header className="desk-head" data-testid="desk-head" data-host-ready={hostReady ? '1' : '0'}>
        <div className="brand-bar">
          <div className="wordmark" data-testid="wordmark">
            <h1 data-testid="desk-title">HUB Predictions</h1>
          </div>
          <div className="rain" data-testid="rain" aria-hidden="true" />
        </div>
        <div className="stat-row scoreboard-row" data-testid="scoreboard">
          <Stat
            label="P&L"
            value={cash.pnl != null ? formatPnl(cash.pnl) : '—'}
            testId="pnl"
            tone={cash.pnl != null && cash.pnl < 0 ? 'down' : cash.pnl != null && cash.pnl > 0 ? 'up' : undefined}
          />
          <Stat
            label="TTL 24H"
            value={`${ttl.pct}% ${ttl.w}W–${ttl.l}L · ${ttl.w + ttl.l >= 4 && ttl.pct < HIT_FLOOR ? `<${HIT_FLOOR}%` : `${HIT_FLOOR}% goal`}`}
            testId="ttl"
          />
          <Stat label="KALSHI CASH" value={formatCash(cash.cash)} testId="kalshi-cash" />
        </div>
      </header>

      <main className="desk-main">
        <div className="tape-grid">
          {TAPE_IDS.map((id) => (
            <TapeRow
              key={id}
              id={id}
              quote={board?.tapes[id] ?? null}
              ticket={displayTicket(tickets, id, board?.tapes[id]?.ticker)}
              booked={book.bets.find((b) => b.orderId === displayTicket(tickets, id, board?.tapes[id]?.ticker)?.orderId)}
              hits={tapeHitCell(id, hits, book.bets, Date.now(), hitFrom)}
              recipe={settings.tapes[id]}
              clock={settings.clocks[id]}
              chart={settings.charts?.[id] ?? DEFAULT_CHART}
              rehabPaper={isRehabPaper(rehab, id)}
              recipeLocked={chasingLosses(book) || book.killed}
              stale={trueLiveGate({ quote: board?.tapes[id], kalshiLive: printsQuery.data?.tapes[id]?.live }).stale}
              botNote={(() => {
                const quote = board?.tapes[id]
                const recipe = settings.tapes[id]
                const lean = tapeLean({
                  id,
                  live: quote?.live ?? null,
                  beat: quote?.beat ?? 0,
                  recipe,
                })
                const ask = lean === 'down' ? quote?.noAsk : quote?.yesAsk
                const cell = tapeHitCell(id, hits, book.bets, Date.now(), hitFrom)
                const liveGate = trueLiveGate({
                  quote,
                  kalshiLive: printsQuery.data?.tapes[id]?.live,
                })
                return tapeBotNote({
                  botOn: recipe.botOn,
                  liveCash: recipe.liveOn,
                  rehabPaper: isRehabPaper(rehab, id),
                  hostCreds,
                  tradingActive: quoteIsLiveClock(quote),
                  inArm: quote?.closeAt ? inArmWindow(recipe, quote.closeAt) : false,
                  askOk: ask != null && askInBand(ask, recipe),
                  lean,
                  hitOk: hitFloorGate(cell.w, cell.l).ok,
                  armFromMin: recipe.armFromMin,
                  armToMin: recipe.armToMin,
                  stale: liveGate.stale,
                })
              })()}
              onClock={(next) => setSettings(setTapeClock(loadSettings(), id, next))}
              onChart={(next) => setSettings(setTapeChart(loadSettings(), id, next))}
              onTape={(patch) => {
                if (book.killed && patch.botOn) {
                  setMsg('KILL on — bots stay off')
                  return
                }
                if (patch.liveOn === true) {
                  const arm = liveArmGateForDesk(book, {
                    cash: cash.cash,
                    deposits: cash.deposits,
                    hasKeys: hostCreds,
                  })
                  if (!arm.ok) {
                    setMsg(arm.reason)
                    return
                  }
                }
                const gate = recipeRetuneGate(book, patch)
                if (!gate.ok) {
                  setMsg(gate.reason)
                  return
                }
                setSettings(patchTape(loadSettings(), id, patch))
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
          cashByBet={cashByBet}
          filter={settings.betsFilter}
          onFilter={(chip) => setSettings(applyBetsFilter(loadSettings(), chip))}
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
          <button
            type="button"
            className="chip-btn tap"
            data-testid="settings-toggle"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? 'Hide Settings' : 'Settings'}
          </button>
        </div>
        {analystOpen ? (
          <AnalystDesk
            board={board ?? null}
            hits={hits}
            settings={settings}
            bets={book.bets}
            events={liveEvents}
            killed={book.killed}
            rehab={rehab}
            onAccept={(id, proposed) => {
              const next = acceptAnalystRecipe(loadSettings(), id, proposed, book)
              if (!next.ok) {
                setMsg(next.reason)
                return
              }
              setSettings(next.settings)
              setMsg(`${TAPE_META[id].label} recipe accepted`)
            }}
          />
        ) : null}
        {financeOpen ? (
          <FinancePanel
            book={book}
            cash={cash}
            board={board ?? null}
            onKill={() => {
              setBook(engageKill(book))
              setSettings(disarmAllBots(settings))
              setMsg('KILL on — bots disarmed, Place blocked')
            }}
            onClearKill={() => {
              setBook(clearKill(book))
              setMsg('KILL cleared')
            }}
          />
        ) : null}

        {book.killed && dailyPnlFloorHit(book) ? (
          <p className="desk-msg" data-testid="floor-hit">
            floor hit — daily P/L ≤ {DAILY_PNL_FLOOR_PAPER}. KILL on. Place blocked.
          </p>
        ) : null}

        {msg ? <p className="desk-msg" data-testid="desk-msg">{msg}</p> : null}

        {settingsOpen ? (
          <SettingsPanel
            settings={settings}
            cashLabel={`Cash ${formatCash(cash.cash)}`}
            recipeLocked={chasingLosses(book) || book.killed}
            onTape={(id, patch) => {
              if (book.killed && patch.botOn) {
                setMsg('KILL on — bots stay off')
                return
              }
              if (patch.liveOn === true) {
                const arm = liveArmGateForDesk(book, {
                  cash: cash.cash,
                  deposits: cash.deposits,
                  hasKeys: hostCreds,
                })
                if (!arm.ok) {
                  setMsg(arm.reason)
                  return
                }
              }
              const gate = recipeRetuneGate(book, patch)
              if (!gate.ok) {
                setMsg(gate.reason)
                return
              }
              setSettings(patchTape(loadSettings(), id, patch))
            }}
            onRefreshCash={() => void refreshCash()}
          />
        ) : null}
      </main>
    </div>
  )
}

function AnalystDesk({
  board,
  hits,
  settings,
  bets,
  events,
  killed,
  rehab,
  onAccept,
}: {
  board: DeskBoard | null
  hits: ReturnType<typeof loadHits>
  settings: DeskSettings
  bets: FinanceState['bets']
  events: Partial<Record<TapeId, string>>
  killed: boolean
  rehab: AnalystAutoState
  onAccept: (id: TapeId, proposed: TapeRecipe) => void
}) {
  const liveSig = TAPE_IDS.map((id) => {
    const q = board?.tapes[id]
    return `${id}:${q?.tradingActive === true ? 1 : 0}:${q?.ticker ?? ''}`
  }).join('|')
  const pathQuery = useQuery({
    queryKey: ['tape-paths', events, liveSig],
    queryFn: () => getTapePaths({ data: { events } }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
  const briefQuery = useQuery({
    queryKey: ['desk-briefs', settings.clocks, liveSig],
    queryFn: () => getDeskBriefs({ data: { clocks: settings.clocks } }),
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    placeholderData: keepPreviousData,
  })
  return (
    <AnalystPanel
      board={board}
      hits={hits}
      settings={settings}
      bets={bets}
      paths={pathQuery.data ?? null}
      briefs={briefQuery.data ?? null}
      killed={killed}
      rehab={rehab}
      onAccept={onAccept}
    />
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
  booked,
  hits,
  recipe,
  clock,
  chart,
  rehabPaper,
  recipeLocked,
  stale,
  botNote,
  onClock,
  onChart,
  onTape,
}: {
  id: TapeId
  quote: TapeQuote | null
  ticket: DeskTicket | undefined
  booked?: { ask?: number; spent?: number; count?: number; kind?: unknown; orderId?: string } | null
  hits: { w: number; l: number }
  recipe: TapeRecipe
  clock: TapeClock
  chart: ChartRange
  rehabPaper: boolean
  recipeLocked: boolean
  stale?: boolean
  botNote: string
  onClock: (clock: TapeClock) => void
  onChart: (chart: ChartRange) => void
  onTape: (patch: Partial<TapeRecipe>) => void
}) {
  const status = ticketStatus(ticket)
  const pct = hitPct(hits)
  const heldQuote = useRef(quote)
  heldQuote.current = holdTapeQuote(quote, heldQuote.current)
  const shownQuote = heldQuote.current
  const live = shownQuote?.live ?? null
  const shownLive = useSmoothedLive(live)
  const beat = shownQuote?.beat ?? 0
  const think = weThinkPair(live, beat, shownQuote?.points ?? [])
  const paper = recipe.botOn && !recipe.liveOn
  const callout = CLOCK_CALLOUT[clock]
  const tone = nowTone(shownLive, beat)
  const testClock = readTestCloseClock()
  const liveOn = (testClock?.tradingActive ?? shownQuote?.tradingActive) === true
  const staleFlag = testClock?.stale ?? stale
  const [draft, setDraft] = useState(recipe.contracts)
  const contractsRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef(0)
  const lastTicker = useRef(quote?.ticker ?? '')
  useEffect(() => {
    setDraft(recipe.contracts)
  }, [recipe.contracts])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current)
      const fromDom = contractsRef.current ? Number(contractsRef.current.value) : draft
      if (!Number.isFinite(fromDom)) return
      const n = clampContracts(fromDom)
      if (n === recipe.contracts) return
      onTape({ contracts: n })
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [draft, recipe.contracts, onTape])
  useEffect(() => {
    const ticker = quote?.ticker ?? ''
    if (lastTicker.current && ticker && lastTicker.current !== ticker && chart !== DEFAULT_CHART) {
      onChart(DEFAULT_CHART)
    }
    lastTicker.current = ticker
  }, [quote?.ticker, chart, onChart])

  function saveContracts(raw?: number) {
    window.clearTimeout(saveTimer.current)
    const fromDom = contractsRef.current ? Number(contractsRef.current.value) : draft
    const n = clampContracts(Number(raw ?? fromDom))
    setDraft(n)
    onTape({ contracts: n })
  }

  function queueContracts(raw: number) {
    const n = clampContracts(raw)
    setDraft(n)
    window.clearTimeout(saveTimer.current)
    saveContracts(n)
  }

  const fillLine = ticket ? ticketFillStrip(ticket, shownQuote, booked) : ''
  const session = tapeSessionHours(id)
  const tradingLive = liveOn
  const hoursLine = tapeHoursLine(id, shownQuote, clock, Date.now(), tradingLive)
  const nextOpenLabel = session.open ? nextClockLabel(Date.now(), clock, shownQuote) : session.nextOpenLabel
  const modeLabel = ticket ? (ticket.orderId.startsWith('deskfill') || booked?.kind === 'paper' ? 'PAPER' : 'LIVE') : 'PAPER'

  return (
    <article className={`tape tape-${id}`} data-testid={`tape-${id}`} data-tape={id} data-ticker={shownQuote?.ticker ?? ''}>
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
                {formatWindowRange(shownQuote?.openAt, shownQuote?.closeAt)}
              </span>
              {staleFlag ? (
                <span className="stale-flag" data-testid={`stale-${id}`}>
                  STALE
                </span>
              ) : liveOn ? (
                <span className="tape-live-flag">
                  <span className="live-dot" /> LIVE
                </span>
              ) : null}
            </p>
            <p className="tape-hours glyph-plate" data-testid={`hours-${id}`}>
              {hoursLine}
            </p>
          </div>
        </div>
        <div className="tape-head-tools">
          <CloseClock
            tape={id}
            closeAt={shownQuote?.closeAt}
            live={tradingLive}
            stale={staleFlag}
            tradingActive={testClock?.tradingActive ?? shownQuote?.tradingActive}
            nextOpenLabel={nextOpenLabel}
          />
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
          <p className="mark-sub">{shownQuote?.clock || '—'}</p>
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
          <span className="hit-k">Hit percent</span>
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
          {ticket ? fillLine : 'No ticket this clock'}
          {ticket ? (
            <span className="ticket-id" data-testid={`ticket-id-${id}`} title={ticket.orderId}>
              {modeLabel}
            </span>
          ) : null}
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
            <span className="tone-up">UP {Number.isFinite(shownQuote?.yesAsk) ? `${shownQuote!.yesAsk}¢` : '—'}</span>
            <span className="tone-down">DOWN {Number.isFinite(shownQuote?.noAsk) ? `${shownQuote!.noAsk}¢` : '—'}</span>
          </p>
        </div>
      </div>

      <RaceChart
        id={id}
        beat={beat}
        live={live}
        displayLive={shownLive}
        points={shownQuote?.points}
        clock={clock}
        chart={chart}
        ticker={shownQuote?.ticker}
        openAt={shownQuote?.openAt}
        closeAt={shownQuote?.closeAt}
        onChart={onChart}
      />

      {paper || ticket ? (
        <p className="tape-banner glyph-plate" data-testid={`banner-${id}`}>
          {ticket ? `${modeLabel} ${status}` : 'PAPER'}
        </p>
      ) : null}
      {botNote ? (
        <p className="settings-note" data-testid={`bot-note-${id}`}>
          {botNote}
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
        <label
          className={`toggle tap glyph-plate ${rehabPaper ? 'toggle-halt' : recipe.liveOn ? 'toggle-hot' : ''}`}
          data-testid={`live-cash-box-${id}`}
          data-halt={rehabPaper ? '1' : '0'}
        >
          <input
            type="checkbox"
            data-testid={`live-cash-${id}`}
            checked={recipe.liveOn}
            onChange={(e) => {
              onTape({ liveOn: e.target.checked })
            }}
          />
          Live cash {rehabPaper ? 'HALT' : recipe.liveOn ? 'ON' : 'OFF'}
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
            onChange={(e) => queueContracts(Number(e.target.value))}
            onInput={(e) => queueContracts(Number((e.target as HTMLInputElement).value))}
            onBlur={() => saveContracts()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveContracts()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </label>
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
  cashByBet,
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
    kind?: 'live' | 'paper' | 'hist'
    orderId?: string
  }>
  cashByBet: Record<string, number | null>
  filter: TapeId[]
  onFilter: (chip: 'all' | TapeId) => void
}) {
  const allOn = isAllBetsFilter(filter)
  return (
    <section className="bets-24h" data-testid="bets-24h" data-filter={filter.join(',')}>
      <p className="hud-label">
        Bets since first deposit · this desk LIVE walks CASH · PAPER and HIST do not
        walk CASH · WINDOW · CLOCK · MODE · CASH · {HIT_FLOOR}% win-ratio goal
      </p>
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
      <div className="bets-log-wrap">
        <div className="bets-log-scroll">
          <div className="bets-log-row bets-log-head" aria-hidden>
            <span>TAPE</span>
            <span>WINDOW</span>
            <span>CLOCK</span>
            <span>SIDE</span>
            <span>RESULT</span>
            <span>MODE</span>
            <span>SPENT</span>
            <span>P&L</span>
            <span data-testid="bets-cash-head">CASH</span>
          </div>
          <ul className="bets-log" data-testid="bets-log">
            {rows.map((b) => {
              const settled = b.status === 'settled' && b.pnl != null
              const result = b.status === 'open' ? 'OPEN' : (b.pnl ?? 0) > 0 ? 'WIN' : (b.pnl ?? 0) < 0 ? 'LOSS' : 'PUSH'
              const rowPnl = settled ? (b.pnl as number) : null
              const mode = betKind(b)
              const windowLabel = formatBetWindow(b.closeAt, betWindowMs(b), b.filledAt)
              const clockLabel = betClockLabel(b)
              const cashAmt = cashByBet[b.betId]
              const cashText = mode === 'live' ? (cashAmt == null ? '—' : formatCash(cashAmt)) : 'N/A'
              const modeClass = mode === 'live' ? 'mode-live' : mode === 'hist' ? 'mode-hist' : 'mode-paper'
              const modeLabel = mode === 'hist' ? 'HIST' : mode === 'live' ? 'LIVE' : 'PAPER'
              return (
                <li key={b.betId} className="bets-log-row" data-kind={mode} data-order-id={b.orderId}>
                  <span>{b.tape.toUpperCase()}</span>
                  <span data-testid="bets-window" className="bets-window" title={windowLabel}>
                    {windowLabel}
                  </span>
                  <span data-testid="bets-clock">{clockLabel}</span>
                  <span>{b.side.toUpperCase()}</span>
                  <span
                    data-testid="bets-result"
                    className={
                      result === 'WIN' ? 'result-win' : result === 'LOSS' ? 'result-loss' : result === 'OPEN' ? 'result-open' : undefined
                    }
                  >
                    {result}
                  </span>
                  <span data-testid="bets-mode" className={modeClass}>
                    {modeLabel}
                  </span>
                  <span>{formatCash(b.spent)}</span>
                  <span
                    data-testid="bets-row-pnl"
                    className={rowPnl == null ? undefined : rowPnl > 0 ? 'tone-up' : rowPnl < 0 ? 'tone-down' : undefined}
                  >
                    {rowPnl == null ? '—' : formatPnl(rowPnl)}
                  </span>
                  <span data-testid="bets-cash">{cashText}</span>
                </li>
              )
            })}
          </ul>
        </div>
        {rows.length ? null : (
          <p className="settings-note" data-testid="bets-empty">
            No fills since first deposit. Paper deskfill and Kalshi HIST show here. Soft FAIL Live POST.
          </p>
        )}
      </div>
    </section>
  )
}

