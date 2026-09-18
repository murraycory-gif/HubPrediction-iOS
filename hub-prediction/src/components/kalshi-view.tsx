import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { getKalshiCash, placeKalshi } from '../lib/btc-data'
import { contractsFromCash } from '../lib/size-cash'
import { cents, dollars } from '../lib/rebase-kalshi'
import type { Board, DeskCall, Point, Quote, Settled } from '../lib/types'
import { WindowChart } from './window-chart'

const KEY_ID = 'hub.kalshi.keyId'
const KEY_PEM = 'hub.kalshi.pem'
const AUTO = 'hub.kalshi.auto'

function readLocal(key: string) {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(key) ?? ''
}

export function KalshiView(props: {
  quote: Quote | null
  board: Board | null
  call: DeskCall
}) {
  const quote = props.quote
  const board = props.board
  const trailRef = useRef<Point[]>([])
  const [trail, setTrail] = useState<Point[]>([])
  const lastAuto = useRef<string>('')

  useEffect(() => {
    if (!quote?.live) return
    const t = quote.fetchedAt || Date.now()
    const arr = trailRef.current
    const last = arr[arr.length - 1]
    if (!last || t - last.t > 800) {
      arr.push({ t, px: quote.live })
      if (arr.length > 400) arr.splice(0, arr.length - 400)
      setTrail([...arr])
    }
  }, [quote?.live, quote?.fetchedAt])

  const past = (quote?.past?.length ? quote.past : board?.past) ?? []
  const points = (board?.points?.length ?? 0) > 2 ? board!.points : (quote?.points ?? [])
  const prior = (board?.prior?.length ? board.prior : quote?.prior) ?? []

  return (
    <div>
      <section className="mt-3 grid grid-cols-2 gap-2 px-4">
        <TapeCard label="UP" value={cents(quote?.yesAsk)} tone="up" />
        <TapeCard label="DOWN" value={cents(quote?.noAsk)} tone="down" />
      </section>
      <p className="mt-2 flex items-center gap-2 px-4 font-mono text-[11px] tracking-wide text-mute">
        <span className="live-dot" aria-hidden />
        Live {quote?.liveSource === 'brti' ? 'BRTI' : 'Coinbase'} {dollars(quote?.live)} vs posted{' '}
        {dollars(quote?.strike)}
        {quote?.tradingActive === false ? ' · Kalshi halted — holding last ¢' : ''}
      </p>
      <WindowChart
        live={quote?.live || 0}
        closeAt={quote?.closeAt || 0}
        openAt={quote?.openAt || 0}
        points={points}
        prior={prior}
        trail={trail}
        lean={props.call.side}
      />
      <Roulette past={past} />
      <AccountPanel quote={quote} call={props.call} lastAuto={lastAuto} />
    </div>
  )
}

function TapeCard({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' }) {
  return (
    <div className={`hud-panel px-3 py-3 ${tone === 'up' ? 'hud-panel-up' : 'hud-panel-down'}`}>
      <p className="hud-label">{label} ask</p>
      <p className={`mt-1 font-mono text-3xl ${tone === 'up' ? 'text-up' : 'text-down'}`}>{value}</p>
    </div>
  )
}

function Roulette({ past }: { past: Settled[] }) {
  const list = Array.isArray(past) ? past.slice(0, 24) : []
  const up = list.filter((p) => p.result === 'up').length
  const down = list.length - up
  const upPct = list.length ? Math.round((up / list.length) * 100) : 0

  return (
    <section className="mt-4 px-4" data-testid="roulette">
      <div className="flex items-baseline justify-between">
        <p className="hud-label">Roulette · last {list.length || '—'} settled</p>
        <p className="font-mono text-[11px] text-mute">
          {list.length ? `${upPct}% UP · ${100 - upPct}% DOWN` : 'warming'}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-8 gap-1.5">
        {list.map((p) => (
          <div
            key={p.ticker || String(p.closeAt)}
            data-testid="roulette-cell"
            title={p.ticker}
            className={`roulette-cell ${p.result === 'up' ? 'roulette-up' : 'roulette-down'}`}
          />
        ))}
        {!list.length
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="roulette-cell bg-chip" />
            ))
          : null}
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-wide text-mute">
        {up} UP / {down} DOWN · newest first
      </p>
    </section>
  )
}

function AccountPanel({
  quote,
  call,
  lastAuto,
}: {
  quote: Quote | null
  call: DeskCall
  lastAuto: MutableRefObject<string>
}) {
  const [keyId, setKeyId] = useState('')
  const [pem, setPem] = useState('')
  const [cash, setCash] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setKeyId(readLocal(KEY_ID))
    setPem(readLocal(KEY_PEM))
    setAuto(readLocal(AUTO) === '1')
  }, [])

  const ask = call.side === 'down' ? quote?.noAsk ?? 0 : quote?.yesAsk ?? 0
  const size = useMemo(
    () => contractsFromCash(cash ?? 0, ask, call.pWin),
    [cash, ask, call.pWin],
  )

  async function refreshCash(nextKey = keyId, nextPem = pem) {
    if (!nextKey || !nextPem) return
    try {
      const r = await getKalshiCash({ data: { keyId: nextKey, pem: nextPem } })
      setCash(r.cash)
      setMsg('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'balance failed')
    }
  }

  function persist(nextKey: string, nextPem: string) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_ID, nextKey)
    localStorage.setItem(KEY_PEM, nextPem)
  }

  async function buy(side: 'up' | 'down') {
    if (!quote?.ticker || !keyId || !pem) {
      setMsg('Paste API Key ID + PEM first')
      return
    }
    const count = Math.max(1, size)
    setBusy(true)
    try {
      await placeKalshi({
        data: {
          keyId,
          pem,
          ticker: quote.ticker,
          side,
          count,
          yesAsk: quote.yesAsk,
          noAsk: quote.noAsk,
        },
      })
      setMsg(`Placed ${count} ${side === 'up' ? 'UP' : 'DOWN'}`)
      await refreshCash()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'order failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!auto || !call.willBuy || !quote?.ticker || size < 1 || quote.tradingActive === false) return
    if (lastAuto.current === quote.ticker) return
    lastAuto.current = quote.ticker
    void buy(call.side === 'down' ? 'down' : 'up')
  }, [auto, call.willBuy, call.side, quote?.ticker, size])

  return (
    <section className="mt-5 px-4" data-testid="account">
      <p className="hud-label">Kalshi account</p>
      <div className="mt-2 space-y-2">
        <input
          className="field px-3 py-3 font-mono text-sm"
          placeholder="API Key ID"
          value={keyId}
          autoComplete="off"
          onChange={(e) => {
            setKeyId(e.target.value)
            persist(e.target.value, pem)
          }}
        />
        <textarea
          className="field h-24 px-3 py-3 font-mono text-[11px]"
          placeholder="PEM private key"
          value={pem}
          onChange={(e) => {
            setPem(e.target.value)
            persist(keyId, e.target.value)
          }}
        />
        <div className="flex gap-2">
          <button type="button" className="chip-btn flex-1" onClick={() => refreshCash()}>
            Show cash
          </button>
          <label className="chip-btn flex items-center gap-2 px-3">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked)
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem(AUTO, e.target.checked ? '1' : '0')
                }
              }}
            />
            Auto
          </label>
        </div>
      </div>
      <p className="mt-2 font-mono text-[12px] text-mute">
        Cash {cash == null ? '—' : dollars(cash)} · size {size} contract{size === 1 ? '' : 's'} · pWin{' '}
        {Math.round(call.pWin * 100)}%
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || quote?.tradingActive === false}
          onClick={() => buy('up')}
          className="buy-up disabled:opacity-50"
        >
          Buy UP
        </button>
        <button
          type="button"
          disabled={busy || quote?.tradingActive === false}
          onClick={() => buy('down')}
          className="buy-down disabled:opacity-50"
        >
          Buy DOWN
        </button>
      </div>
      {msg ? <p className="mt-2 font-mono text-[12px] text-mute">{msg}</p> : null}
      <IosInstallTip />
    </section>
  )
}

function IosInstallTip() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as { standalone?: boolean }).standalone)
    const dismissed = readLocal('hub.install.dismissed') === '1'
    setShow(ios && !standalone && !dismissed)
  }, [])
  if (!show) return null
  return (
    <p className="hud-panel mt-3 px-3 py-3 font-mono text-[11px] text-mute">
      iPhone app: Safari Share → Add to Home Screen.{' '}
      <button
        type="button"
        className="text-up"
        onClick={() => {
          if (typeof localStorage !== 'undefined') localStorage.setItem('hub.install.dismissed', '1')
          setShow(false)
        }}
      >
        Got it
      </button>
    </p>
  )
}
