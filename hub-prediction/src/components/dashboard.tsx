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
  readTestLiveQuote,
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
  confirmedPlaceOrderId,
  placeOrderStatus,
  tapeAllowsLive,
  formatCash,
  isPaperOrderId,
  isRealOrderId,
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
  clearKill,
  engageKill,
  chasingLosses,
  isAllBetsFilter,
  HIT_FLOOR,
  last24hBets,
  latchDeskBets24,
  statsFromDeskBets24,
  tapeHitCell,
  tapeBotNote,
  liveBotCall,
  paperFillAllowed,
  isLiveBet,
  liveSendGate,
  liveArmGateForDesk,
  askAllowedByGold,
  ASK_CAP,
  CLOCK_MAX_SPEND,
  emptyFinance,
  loadFinance,
  recipeRetuneGate,
  hitFloorGate,
  recentLiveTapeWL,
  settleBook,
  syncTicketsIntoBook,
  dailyPnlFloorHit,
  dailyProfitLockHit,
  DAILY_PNL_FLOOR_PAPER,
  DAILY_PROFIT_LOCK,
  type FinanceState,
} from '../lib/finance'
import { analyzeDesk, isRehabPaper, loadAutoState, runAutoAnalyst, type AnalystAutoState } from '../lib/analyst'
import { buildTapeIntel } from '../lib/desk-brief'
import { AnalystPanel } from './analyst-panel'
import { CloseClock } from './close-clock'
import { readTestCloseClock } from '../lib/close-clock'
import { FinancePanel } from './finance-panel'
import { formatBetWindow, formatWindowRange } from '../lib/chicago-time'
import { applyKalshiBook, BOOK_LATCH_MS, type KalshiBookPayload } from '../lib/kalshi-book'
import {
  loadChief,
  readTestTapeQuote,
  runDeskChief,
  saveChief,
  tapeLiveArmGate,
  type ChiefRunInput,
  type ChiefState,
} from '../lib/desk-chief'
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
  const [chief, setChief] = useState<ChiefState>(() => loadChief())
  const [rehab, setRehab] = useState<AnalystAutoState>(() => loadAutoState())
  const sentRef = useRef<Record<string, SendClaim>>({})
  const clientOrderRef = useRef<Record<string, string>>({})
  const lastLocalWrite = useRef(0)
  const wall = useDeskTick()

  useEffect(() => {
    const w = window as Window & {
      __HUB_LIVE_ASK?: {
        askAllowedByGold: typeof askAllowedByGold
        liveSendGate: typeof liveSendGate
        emptyFinance: typeof emptyFinance
        ASK_CAP: number
      }
    }
    w.__HUB_LIVE_ASK = { askAllowedByGold, liveSendGate, emptyFinance, ASK_CAP }
    return () => {
      delete w.__HUB_LIVE_ASK
    }
  }, [])

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
    if (
      (r.settlements != null || r.fills != null || r.positions != null || r.orders != null) &&
      (window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 !== true
    ) {
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
    const writeHost = (patch: { settings?: unknown; tickets?: unknown; finance?: unknown; hits?: unknown; chief?: unknown }) => {
      if (patch.settings) lastLocalWrite.current = Date.now()
      writeChain = writeChain.catch(() => undefined).then(() => saveDeskState({ data: patch }).then(() => undefined))
      return writeChain
    }
    setHostDeskWriter(writeHost)
    const markReady = () => setHostReady(true)
    markReady()
    const readyTimer = window.setTimeout(markReady, 4000)
    const flushHost = async () => {
      setHostDeskWriter(writeHost)
      const local = loadSettings()
      try {
        await writeHost({
          settings: settingsReadyToPush(local) ? local : undefined,
          tickets: loadTickets(),
          finance: loadFinance(),
          chief: loadChief(),
        })
      } catch {
        /* host write miss — Soft FAIL blocking the desk */
      }
    }
    void getDeskState({ data: { t: Date.now() } })
      .then((host) => {
        try {
          if (host && applyHostDeskState(host)) {
            setSettings(loadSettings())
            setChief(loadChief())
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
        } catch {
          /* host apply miss */
        }
        window.clearTimeout(readyTimer)
        markReady()
        void flushHost()
      })
      .catch(() => {
        window.clearTimeout(readyTimer)
        markReady()
        void flushHost()
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
    return () => {
      window.clearTimeout(readyTimer)
      setHostDeskWriter(null)
    }
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
        setChief(loadChief())
        if ((window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 === true) return
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
        return printsHold.current ?? { tapes: { btc: null, ng: null, cu: null, gld: null, wti: null, slv: null }, fetchedAt: 0 }
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
    if ((window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 === true) return
    setBook((prev) => collapseClockBets(settleBook(prev, recent)))
  }, [settledQuery.data, tickets])

  useEffect(() => {
    const payload = settleQuery.data
    if (!payload) return
    if ((window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 === true) return
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
    if ((window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 === true) return
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
    if (liveDeskOn(tape) && !isRehabPaper(rehab, tape)) {
      releaseClaim(sentRef.current, `${tape}:${quote.ticker}`)
      setMsg(`${TAPE_META[tape].label} Live cash ON — paper fill blocked`)
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
    if (liveDeskOn(tape) && !halt) {
      void sendLive(tape, side, quote)
      return
    }
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
    if (!tapeAllowsLive(tape)) {
      abortLive(`${TAPE_META[tape].label} paper desk — Soft FAIL Live`)
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
    const existing = ticketFor(tickets, tape, quote.ticker)
    const liveOpen = book.bets.some((b) => b.ticker === quote.ticker && b.status === 'open' && isLiveBet(b))
    if ((existing && isRealOrderId(existing.orderId)) || liveOpen) {
      markFilled(sentRef.current, key, existing?.orderId || 'open')
      setMsg(`${TAPE_META[tape].label} one ticket this clock`)
      return
    }
    if (quote.tradingActive === false || !quoteIsLiveClock(quote)) {
      abortLive(`${TAPE_META[tape].label} STALE — paper only — not sent`)
      return
    }
    const ask = side === 'down' ? quote.noAsk : quote.yesAsk
    let count = settings.tapes[tape].contracts
    let spent = ticketCost(count, ask)
    if (spent > CLOCK_MAX_SPEND) {
      count = Math.max(1, Math.floor(CLOCK_MAX_SPEND / Math.max(0.01, ask / 100)))
      spent = ticketCost(count, ask)
    }
    const gate = liveSendGate(book, {
      tape,
      ticker: quote.ticker,
      ask,
      cash: cash.cash,
      deposits: cash.deposits,
      spent,
      liveOn: true,
    })
    if (!gate.ok) {
      abortLive(`${TAPE_META[tape].label} Kalshi error — ${gate.reason}`)
      return
    }
    const clientOrderId = (clientOrderRef.current[key] ||=
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `hub-${tape}-${Date.now()}`)
    try {
      const hook = (window as Window & { __HUB_PLACE?: (p: unknown) => Promise<unknown> }).__HUB_PLACE
      const raw = hook
        ? await hook({
            ticker: quote.ticker,
            side,
            count,
            yesAsk: quote.yesAsk,
            noAsk: quote.noAsk,
            tape,
            botOn: flags.botOn,
            liveOn: flags.liveOn,
            clientOrderId,
          })
        : await placeKalshi({
            data: {
              ticker: quote.ticker,
              side,
              count,
              yesAsk: quote.yesAsk,
              noAsk: quote.noAsk,
              tape,
              botOn: flags.botOn,
              liveOn: flags.liveOn,
              clientOrderId,
            },
          })
      const life = placeOrderStatus(raw)
      if (life === 'resting') {
        abortLive(`${TAPE_META[tape].label} RESTING — BUY NO sits, 0 fill`)
        return
      }
      if (life !== 'filled') {
        abortLive(
          life === 'canceled'
            ? `${TAPE_META[tape].label} Kalshi canceled 0-fill — not bought`
            : `${TAPE_META[tape].label} Kalshi returned no order id — no ticket`,
        )
        return
      }
      const orderId = confirmedPlaceOrderId(raw)
      const ticket = makeTicket({
        tape,
        ticker: quote.ticker,
        side,
        orderId,
        contracts: count,
        beat: quote.beat,
        ask,
      })
      if (!ticket || !isRealOrderId(ticket.orderId) || isPaperOrderId(ticket.orderId)) {
        abortLive(`${TAPE_META[tape].label} Kalshi canceled 0-fill — not bought`)
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
      else abortLive(`${TAPE_META[tape].label} ${booked.reason}`)
      if (booked.ok) setMsg(`${TAPE_META[tape].label} ${ticketFillStrip(ticket, quote)}`)
      await refreshCash()
    } catch (e) {
      abortLive(e instanceof Error ? e.message : `${TAPE_META[tape].label} Kalshi error — IOC miss`)
    }
  }

  useEffect(() => {
    const w = window as Window & {
      __HUB_TEST_SEND?: (tape: TapeId, side: 'up' | 'down', quote: TapeQuote) => Promise<void>
    }
    w.__HUB_TEST_SEND = (tape, side, quote) => sendLive(tape, side, quote)
    return () => {
      delete w.__HUB_TEST_SEND
    }
  })

  function chiefQuotes(): NonNullable<ChiefRunInput['quotes']> {
    const out: NonNullable<ChiefRunInput['quotes']> = {}
    for (const id of TAPE_IDS) {
      const test = readTestTapeQuote(id)
      const q = board?.tapes[id]
      const liveGate = trueLiveGate({
        quote: q,
        kalshiLive: printsQuery.data?.tapes[id]?.live,
      })
      out[id] = test ?? (q
        ? { tradingActive: q.tradingActive, stale: liveGate.stale, yesAsk: q.yesAsk, noAsk: q.noAsk }
        : null)
    }
    return out
  }

  function tickChief(over?: Partial<ChiefRunInput>, opts?: { force?: boolean }) {
    const stored = loadSettings()
    const result = runDeskChief({
      settings: hydrateSettings(over?.settings ?? stored),
      book: over?.book ?? loadFinance(),
      cash: over?.cash ?? cash.cash,
      deposits: over?.deposits ?? cash.deposits,
      quotes: over?.quotes ?? chiefQuotes(),
      halt: over?.halt ?? Object.fromEntries(TAPE_IDS.map((id) => [id, isRehabPaper(rehab, id)])) as Record<TapeId, boolean>,
      typicalAsk: over?.typicalAsk,
      intel:
        over?.intel ?? {
          btc: buildTapeIntel({
            id: 'btc',
            points: board?.tapes.btc?.points,
            closeAt: board?.tapes.btc?.closeAt,
          }),
        },
      now: over?.now,
      prev: over?.prev ?? loadChief(),
    })
    setChief(saveChief(result.state))
    const toggledAt = Number(stored.togglesAt) || 0
    if (!opts?.force && (Date.now() - toggledAt < 2000 || Date.now() - lastLocalWrite.current < 2000)) {
      return result
    }
    for (const a of result.paperApplies) {
      const cur = loadSettings()
      if (a.contracts && cur.tapes[a.tape].contracts !== a.contracts) {
        setSettings(patchTape(cur, a.tape, { contracts: a.contracts }))
      }
      if (a.clock && cur.tapes[a.tape].liveOn !== true && loadSettings().clocks[a.tape] !== a.clock) {
        setSettings(setTapeClock(loadSettings(), a.tape, a.clock))
      }
    }
    return result
  }

  useEffect(() => {
    if (!hostReady) return
    tickChief()
    const id = window.setInterval(() => {
      tickChief()
    }, 4000)
    return () => window.clearInterval(id)
  }, [hostReady, book, cash.cash, cash.deposits, board, rehab])

  useEffect(() => {
    const w = window as Window & {
      __HUB_TEST_CHIEF?: {
        run: (over?: Partial<ChiefRunInput>) => ReturnType<typeof runDeskChief>
        snapshot: () => ChiefState
      }
      __HUB_APPLY_BOOK?: (payload: KalshiBookPayload) => void
      __HUB_TEST_BETS?: {
        replace: (bets: FinanceState['bets']) => void
        inject: (bets: FinanceState['bets']) => void
        add: (bet: FinanceState['bets'][number]) => void
      }
    }
    w.__HUB_TEST_CHIEF = {
      run: (over) => tickChief(over, { force: true }),
      snapshot: () => loadChief(),
    }
    w.__HUB_APPLY_BOOK = (payload) => {
      setBook((prev) => applyKalshiBook(prev, payload))
    }
    w.__HUB_TEST_BETS = {
      replace: (bets) => {
        ;(window as Window & { __HUB_RESET_BETS24?: boolean }).__HUB_RESET_BETS24 = true
        setBook((prev) => ({ ...prev, bets }))
      },
      inject: (bets) => {
        setBook((prev) => ({ ...prev, bets: [...prev.bets, ...bets] }))
      },
      add: (bet) => {
        setBook((prev) => ({ ...prev, bets: [...prev.bets, bet] }))
      },
    }
    return () => {
      delete w.__HUB_TEST_CHIEF
      delete w.__HUB_APPLY_BOOK
      delete w.__HUB_TEST_BETS
    }
  })

  useEffect(() => {
    if (!hostReady || !tabIsOpen() || book.killed) return
    const stored = loadSettings()
    for (const id of TAPE_IDS) {
      const quote = readTestLiveQuote(id) ?? board?.tapes[id]
      const recipe = settings.tapes[id]
      const botOn = stored.tapes[id].botOn === true || recipe.botOn === true
      const liveCash = stored.tapes[id].liveOn === true || recipe.liveOn === true
      if (!quote?.ticker || !botOn) continue
      if (quote.tradingActive === false) continue
      const liveGate = trueLiveGate({
        quote,
        kalshiLive: printsQuery.data?.tapes[id]?.live,
      })
      const have = ticketFor(tickets, id, quote.ticker)
      if (have && isRealOrderId(have.orderId)) continue
      if (!inArmWindow(recipe, quote.closeAt)) continue
      const lean = tapeLean({ id, live: quote.live, beat: quote.beat, recipe })
      if (lean === 'sit') continue
      const ask = lean === 'down' ? quote.noAsk : quote.yesAsk
      if (liveCash) {
        if (!askAllowedByGold(id, ask)) continue
      } else if (!askInBand(ask, recipe)) {
        continue
      }
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
    if (next.msg && !/Accept to apply/.test(next.msg)) setMsg(next.msg)
  }, [hostReady, board, book.bets, book.killed, hits, rehab, settings])

  const desk24 = last24hBets(book, hits, Date.now(), TAPE_IDS)
  const desk24Ref = useRef(desk24)
  const reset24 =
    typeof window !== 'undefined' && (window as Window & { __HUB_RESET_BETS24?: boolean }).__HUB_RESET_BETS24 === true
  if (reset24) {
    desk24Ref.current = desk24
    delete (window as Window & { __HUB_RESET_BETS24?: boolean }).__HUB_RESET_BETS24
  } else {
    desk24Ref.current = latchDeskBets24(desk24Ref.current, desk24)
  }
  const ttl = desk24Ref.current
  const stripRows = isAllBetsFilter(settings.betsFilter)
    ? ttl.rows
    : ttl.rows.filter((b) => settings.betsFilter.includes(b.tape))
  const bets24 = { rows: stripRows, ...statsFromDeskBets24(stripRows) }
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
              hits={tapeHitCell(id, hits, book.bets, Date.now())}
              recipe={settings.tapes[id]}
              clock={settings.clocks[id]}
              chart={settings.charts?.[id] ?? DEFAULT_CHART}
              rehabPaper={isRehabPaper(rehab, id)}
              recipeLocked={chasingLosses(book) || book.killed}
              hostReady={hostReady}
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
                const cell = tapeHitCell(id, hits, book.bets, Date.now())
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
                  askOk:
                    ask != null &&
                    (recipe.liveOn ? askAllowedByGold(id, ask) : askInBand(ask, recipe)),
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
                if (patch.liveOn === true && !tapeAllowsLive(id)) {
                  setMsg(`${TAPE_META[id].label} paper desk — Soft FAIL Live`)
                  return
                }
                if (patch.liveOn === true) {
                  const quote = readTestTapeQuote(id) ?? board?.tapes[id]
                  const tapeGate = tapeLiveArmGate(id, quote)
                  if (!tapeGate.ok) {
                    setMsg(tapeGate.reason)
                    return
                  }
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
          pnl={bets24.pnl}
          open={bets24.open}
          pct={bets24.pct}
          rows={bets24.rows}
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
          />
        ) : null}
        {financeOpen ? (
          <FinancePanel
            book={book}
            cash={cash}
            board={board ?? null}
            chief={chief}
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

        {chief.lockIn || dailyProfitLockHit(book) ? (
          <p className="desk-msg" data-testid="lock-in">
            lock-in sit — daily P/L ≥ ${DAILY_PROFIT_LOCK}. Live place sat. Live cash stays.
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
              if (patch.liveOn === true && !tapeAllowsLive(id)) {
                setMsg(`${TAPE_META[id].label} paper desk — Soft FAIL Live`)
                return
              }
              if (patch.liveOn === true) {
                const quote = readTestTapeQuote(id) ?? board?.tapes[id]
                const tapeGate = tapeLiveArmGate(id, quote)
                if (!tapeGate.ok) {
                  setMsg(tapeGate.reason)
                  return
                }
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
}: {
  board: DeskBoard | null
  hits: ReturnType<typeof loadHits>
  settings: DeskSettings
  bets: FinanceState['bets']
  events: Partial<Record<TapeId, string>>
  killed: boolean
  rehab: AnalystAutoState
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
  hostReady,
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
  hostReady?: boolean
  onClock: (clock: TapeClock) => void
  onChart: (chart: ChartRange) => void
  onTape: (patch: Partial<TapeRecipe>) => void
}) {
  const liveFill =
    Boolean(ticket && isRealOrderId(ticket.orderId) && !isPaperOrderId(ticket.orderId) && booked?.kind === 'live')
  const paperFill = Boolean(
    ticket && (isPaperOrderId(ticket.orderId) || booked?.kind === 'paper') && !recipe.liveOn,
  )
  const shownTicket = liveFill || paperFill ? ticket : undefined
  const status = ticketStatus(liveFill ? ticket : undefined)
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
  const typedRef = useRef(false)
  const lastTicker = useRef(quote?.ticker ?? '')
  useLayoutEffect(() => {
    if (!typedRef.current) setDraft(recipe.contracts)
  }, [recipe.contracts])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current)
      if (hostReady !== true || !typedRef.current) return
      const fromDom = contractsRef.current ? Number(contractsRef.current.value) : draft
      if (!Number.isFinite(fromDom)) return
      const n = clampContracts(fromDom)
      if (n === recipe.contracts) return
      if (n === 1 && recipe.contracts > 1 && !typedRef.current) return
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
  }, [draft, recipe.contracts, onTape, hostReady])
  useEffect(() => {
    const ticker = quote?.ticker ?? ''
    if (lastTicker.current && ticker && lastTicker.current !== ticker && chart !== DEFAULT_CHART) {
      onChart(DEFAULT_CHART)
    }
    lastTicker.current = ticker
  }, [quote?.ticker, chart, onChart])

  function saveContracts(raw?: number) {
    window.clearTimeout(saveTimer.current)
    if (hostReady !== true) return
    if (!typedRef.current) {
      setDraft(recipe.contracts)
      return
    }
    const fromDom = contractsRef.current ? Number(contractsRef.current.value) : draft
    const n = clampContracts(Number(raw ?? fromDom))
    if (n === recipe.contracts) {
      setDraft(n)
      return
    }
    if (n === 1 && recipe.contracts > 1 && !typedRef.current) return
    setDraft(n)
    onTape({ contracts: n })
  }

  function queueContracts(raw: number) {
    typedRef.current = true
    const n = clampContracts(raw)
    setDraft(n)
    if (hostReady !== true) return
    window.clearTimeout(saveTimer.current)
    saveContracts(n)
  }

  const fillLine = shownTicket ? ticketFillStrip(shownTicket, shownQuote, booked) : ''
  const session = tapeSessionHours(id)
  const tradingLive = liveOn
  const hoursLine = tapeHoursLine(id, shownQuote, clock, Date.now(), tradingLive)
  const nextOpenLabel = session.open ? nextClockLabel(Date.now(), clock, shownQuote) : session.nextOpenLabel
  const modeLabel = liveFill ? 'LIVE' : paperFill ? 'PAPER' : booked?.kind === 'hist' ? 'HIST' : 'PAPER'

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
            openMarkets={shownQuote?.openMarkets}
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
          <p className="tape-num" data-testid={`beat-value-${id}`} suppressHydrationWarning>
            {formatLive(id, beat || null)}
          </p>
          <p className="mark-sub">{shownQuote?.clock || '—'}</p>
        </div>
        <div className="mark-now live-read glyph-plate" data-testid={`live-plate-${id}`}>
          <p className="mark-label">NOW</p>
          <p className={`tape-num${tone ? ` tone-${tone}` : ''}`} data-testid={`live-${id}`} suppressHydrationWarning>
            {formatLive(id, shownLive)}
          </p>
          <p className={`mark-sub now-delta${tone ? ` tone-${tone}` : ''}`} data-testid={`now-delta-${id}`} suppressHydrationWarning>
            {formatNowDelta(id, shownLive, beat)}
          </p>
        </div>
      </div>

      <div className="tape-row">
        <div className="hit-chip" data-testid={`hit-${id}`}>
          <span className="hit-k">Hit · {HIT_FLOOR}% goal</span>
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
          {shownTicket ? fillLine : 'No ticket this clock'}
          {shownTicket ? (
            <span className="ticket-id" data-testid={`ticket-id-${id}`} title={shownTicket.orderId}>
              {modeLabel}
            </span>
          ) : null}
        </p>
      </div>

      <div className="tape-reads">
        <div>
          <p className="hud-label">WE THINK</p>
          <p className="tape-think" data-testid={`we-think-${id}`} suppressHydrationWarning>
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

      {paper || shownTicket ? (
        <p className="tape-banner glyph-plate" data-testid={`banner-${id}`}>
          {shownTicket ? `${modeLabel} ${status}` : 'PAPER'}
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
          onClick={() => {
            if (!tapeAllowsLive(id)) onTape({ liveOn: true })
          }}
        >
          <input
            type="checkbox"
            data-testid={`live-cash-${id}`}
            checked={recipe.liveOn}
            disabled={!tapeAllowsLive(id) || recipeLocked}
            onChange={(e) => {
              onTape({ liveOn: e.target.checked })
            }}
          />
          Live cash {rehabPaper ? 'HALT' : !tapeAllowsLive(id) ? 'PAPER' : recipe.liveOn ? 'ON' : 'OFF'}
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
        Last 24 hours · desk paper + live · Soft FAIL hist · LIVE walks CASH · PAPER
        CASH N/A · WINDOW · CLOCK · MODE · CASH · {HIT_FLOOR}% win-ratio goal
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

