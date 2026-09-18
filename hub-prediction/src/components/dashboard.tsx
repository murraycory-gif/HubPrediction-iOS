import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getDeskBoard, getKalshiCash, placeKalshi } from '../lib/btc-data'
import {
  KEY_ID,
  KEY_PEM,
  TAPE_IDS,
  TAPE_META,
  askInBand,
  extractOrderId,
  formatCash,
  formatLive,
  formatPnl,
  hitPct,
  hydrateSettings,
  inArmWindow,
  loadCash,
  loadHits,
  loadSettings,
  loadTickets,
  makeTicket,
  patchTape,
  pulseTone,
  saveCash,
  setLiveBets,
  tabIsOpen,
  tapeLean,
  ticketStatus,
  ttlFromHits,
  upsertTicket,
  weThink,
  type DeskSettings,
  type DeskTicket,
  type TapeId,
} from '../lib/tapes'
import type { DeskBoard, TapeQuote } from '../lib/types'
import { CloseClock } from './close-clock'
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
  const [settings, setSettings] = useState<DeskSettings>(() => hydrateSettings(null))
  const [tickets, setTickets] = useState<DeskTicket[]>([])
  const [hits, setHits] = useState(() => loadHits())
  const [cash, setCash] = useState(() => loadCash())
  const [keyId, setKeyId] = useState('')
  const [pem, setPem] = useState('')
  const [msg, setMsg] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [ready, setReady] = useState(false)
  const sentRef = useRef<Record<string, string>>({})

  useEffect(() => {
    setSettings(loadSettings())
    setTickets(loadTickets())
    setHits(loadHits())
    setCash(loadCash())
    setKeyId(readLocal(KEY_ID))
    setPem(readLocal(KEY_PEM))
    setReady(true)
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
      const next = saveCash({
        cash: r.cash,
        pnl: cash.pnl,
        deposits: cash.deposits,
        asOf: Date.now(),
      })
      setCash(next)
      setMsg('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'balance failed')
    }
  }

  async function sendLive(tape: TapeId, side: 'up' | 'down', quote: TapeQuote) {
    if (!tabIsOpen()) {
      setMsg('Send needs this tab open')
      return
    }
    if (!settings.liveBets || !settings.tapes[tape].liveOn) {
      setMsg('Live bets OFF — paper only. No ticket.')
      return
    }
    if (!keyId || !pem) {
      setMsg('Paste API Key ID + PEM to send live')
      return
    }
    if (!quote.ticker) return
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
        return
      }
      setTickets((prev) => upsertTicket(prev, ticket))
      setMsg(`${TAPE_META[tape].label} ${side.toUpperCase()} ${ticket.orderId}`)
      await refreshCash()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'order failed')
    }
  }

  useEffect(() => {
    if (!board || !tabIsOpen()) return
    for (const id of TAPE_IDS) {
      const quote = board.tapes[id]
      const recipe = settings.tapes[id]
      if (!quote?.ticker || !recipe.botOn) continue
      if (ticketFor(tickets, id, quote.ticker)) continue
      if (!inArmWindow(recipe, quote.closeAt)) continue
      const lean = tapeLean({ id, live: quote.live, beat: quote.beat, recipe })
      if (lean === 'sit') continue
      const ask = lean === 'down' ? quote.noAsk : quote.yesAsk
      if (!askInBand(ask, recipe)) continue
      const key = `${id}:${quote.ticker}`
      if (sentRef.current[key]) continue
      sentRef.current[key] = 'armed'
      if (settings.liveBets && recipe.liveOn) {
        void sendLive(id, lean, quote)
      }
    }
  }, [board?.fetchedAt, settings, tickets])

  const ttl = ttlFromHits(hits)
  const liveTicket = tickets.find((t) => {
    const q = board?.tapes[t.tape]
    return q?.ticker === t.ticker
  })
  const pulseQuote = liveTicket ? board?.tapes[liveTicket.tape] : board?.tapes.btc
  const pulse = pulseTone(liveTicket, pulseQuote?.live ?? null)

  return (
    <div className="desk">
      <header className="desk-head" data-testid="desk-head">
        <div className="brand-row">
          <h1 data-testid="desk-title">HUB PREDICTIONS</h1>
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
            label="P&L / DEPOSITS"
            value={`${formatPnl(cash.pnl)} from ${formatCash(cash.deposits)}`}
            testId="pnl"
          />
          <Stat label="TTL 24H" value={`${ttl.pct}% ${ttl.w}W–${ttl.l}L`} testId="ttl" />
          <Stat label="KALSHI CASH" value={formatCash(cash.cash)} testId="kalshi-cash" />
        </div>
        <p className="mode-line" data-testid="mode-line">
          {settings.liveBets ? 'LIVE BETS ON' : 'Live bets OFF'} · paper only unless you flip Live · bots{' '}
          {TAPE_IDS.every((id) => !settings.tapes[id].botOn) ? 'OFF' : 'armed'}
        </p>
      </header>

      <main className="desk-main">
        {TAPE_IDS.map((id) => (
          <TapeRow
            key={id}
            id={id}
            quote={board?.tapes[id] ?? null}
            recipe={settings.tapes[id]}
            ticket={ticketFor(tickets, id, board?.tapes[id]?.ticker)}
            hits={hits.tapes[id]}
          />
        ))}

        <PulseCard
          ticket={liveTicket}
          quote={pulseQuote ?? null}
          tone={pulse}
        />

        {msg ? <p className="desk-msg">{msg}</p> : null}

        {settingsOpen && ready ? (
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
            onLiveBets={(on) => setSettings(setLiveBets(settings, on))}
            onTape={(id, patch) => setSettings(patchTape(settings, id, patch))}
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

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="stat" data-testid={testId}>
      <p className="hud-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  )
}

function TapeRow({
  id,
  quote,
  recipe,
  ticket,
  hits,
}: {
  id: TapeId
  quote: TapeQuote | null
  recipe: TapeRecipe
  ticket: DeskTicket | undefined
  hits: { w: number; l: number }
}) {
  const status = ticketStatus(ticket)
  const pct = hitPct(hits)
  const live = quote?.live ?? null
  const beat = quote?.beat ?? 0
  return (
    <article className="tape" data-testid={`tape-${id}`}>
      <div className="tape-top">
        <p className="tape-name">
          {TAPE_META[id].label} · {quote?.clock || '—'}
        </p>
        <CloseClock closeAt={quote?.closeAt} />
      </div>
      <div className="tape-grid">
        <div>
          <p className="hud-label">Hit %</p>
          <p className="tape-hit" data-testid={`hit-${id}`}>
            {pct}%
          </p>
          <p className="tape-wl" data-testid={`wl-${id}`}>
            {hits.w}W–{hits.l}L
          </p>
        </div>
        <div>
          <p className="hud-label">Ticket</p>
          <p className={`tape-status status-${status.toLowerCase()}`} data-testid={`status-${id}`}>
            {status}
          </p>
          <p className="tape-sub">
            {ticket ? `${ticket.contracts} ${ticket.side.toUpperCase()}` : 'ticket none'}
          </p>
        </div>
        <div>
          <p className="hud-label">BEAT / LINE</p>
          <p className="tape-num" data-testid={`beat-${id}`}>
            {formatLive(id, beat || null)}
          </p>
          <p className="tape-sub">
            UP {Number.isFinite(quote?.yesAsk) ? `${quote!.yesAsk}¢` : '—'} / DOWN{' '}
            {Number.isFinite(quote?.noAsk) ? `${quote!.noAsk}¢` : '—'}
          </p>
        </div>
        <div>
          <p className="hud-label">Live $</p>
          <p className="tape-num" data-testid={`live-${id}`}>
            {formatLive(id, live)}
          </p>
          <p className="tape-sub">{quote?.liveSource === 'kalshi-timeseries' ? 'timeseries' : quote?.liveSource === 'kalshi-live' ? 'live_data' : 'waiting print'}</p>
        </div>
      </div>
      <p className="tape-recipe">
        {recipe.contracts} ct · arm {recipe.armFromMin}–{recipe.armToMin}m · through {recipe.through} · {recipe.centLo}–{recipe.centHi}¢
        · bot {recipe.botOn ? 'ON' : 'OFF'} · live {recipe.liveOn ? 'ON' : 'OFF'}
      </p>
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
    () => weThink(quote?.live ?? null, quote?.beat ?? 0, quote?.points ?? []),
    [quote?.live, quote?.beat, quote?.fetchedAt],
  )
  const vs = quote?.live != null && quote.beat ? quote.live - quote.beat : null
  if (tone === 'quiet' || !ticket) {
    return (
      <section className="pulse pulse-quiet" data-testid="pulse">
        <p className="hud-label">Pulse</p>
        <p className="pulse-title">{quote ? TAPE_META[quote.id].pulseName : 'PULSE'}</p>
        <div className="pulse-grid">
          <div>
            <p className="hud-label">LINE TO BEAT</p>
            <p>{quote ? formatLive(quote.id, quote.beat) : '—'}</p>
          </div>
          <div>
            <p className="hud-label">WE THINK</p>
            <p>{quote ? formatLive(quote.id, think) : '—'}</p>
          </div>
          <div>
            <p className="hud-label">VS LINE</p>
            <p>
              {quote && vs != null
                ? `${vs >= 0 ? '+' : ''}${formatLive(quote.id, Math.abs(vs)).replace('$', '')}`
                : '—'}
            </p>
          </div>
        </div>
        <p className="pulse-note">all quiet. Hit % and TTL stay on each tape. No live ticket.</p>
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
          <p className="hud-label">LIVE</p>
          <p>{formatLive(ticket.tape, quote?.live ?? null)}</p>
        </div>
        <div>
          <p className="hud-label">VS LINE</p>
          <p>
            {quote?.live != null
              ? `${quote.live - ticket.beat >= 0 ? '+' : ''}${formatLive(ticket.tape, Math.abs(quote.live - ticket.beat)).replace('$', '')}`
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

