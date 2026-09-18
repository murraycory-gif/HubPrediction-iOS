import { useMemo, useState } from 'react'
import {
  analyzeDesk,
  denyAnalystRec,
  formatDeskPnl,
  formatPathWindow,
  isDeniedRec,
  listDeniedRecs,
  loadPaperDrafts,
  makePaperDrafts,
  savePaperDrafts,
  type AnalystBet,
  type DeskPaths,
  type PaperDrafts,
} from '../lib/analyst'
import { buildDeskBrief, formatNewsAge, type DeskBriefsPayload } from '../lib/desk-brief'
import { HIT_FLOOR } from '../lib/finance'
import {
  TAPE_META,
  formatLive,
  type DeskSettings,
  type HitLatch,
  type TapeId,
  type TapeRecipe,
} from '../lib/tapes'
import type { DeskBoard } from '../lib/types'

export function AnalystPanel({
  board,
  hits,
  settings,
  bets,
  paths,
  briefs,
  killed,
  onAccept,
  onDeny,
}: {
  board: DeskBoard | null
  hits: HitLatch
  settings: DeskSettings
  bets: AnalystBet[]
  paths: DeskPaths | null
  briefs?: DeskBriefsPayload | null
  killed?: boolean
  onAccept: (id: TapeId, recipe: TapeRecipe) => void
  onDeny: (id: TapeId, token: string) => void
}) {
  const report = useMemo(
    () => analyzeDesk(board, hits, bets, settings.tapes, paths),
    [board?.fetchedAt, hits, bets, settings, paths],
  )
  const [drafts, setDrafts] = useState<PaperDrafts | null>(() => loadPaperDrafts())
  const [denied, setDenied] = useState<string[]>(() => listDeniedRecs())
  const [saved, setSaved] = useState('')

  return (
    <section className="analyst" data-testid="analyst">
      <p className="hud-label">Analyst · {HIT_FLOOR}% win-ratio goal</p>
      <p className="settings-note" data-testid="analyst-lock">
        Each tape has its own desk chief. They review upcoming clocks, 24h / 48h trend, news on that desk, and a
        good / bad swing forecast. Recs aim at a {HIT_FLOOR}% win ratio. Accept writes the retune onto that tape for
        this run. Deny keeps the current recipe. Does not flip Live or live cash.
      </p>
      <div className="analyst-grid">
        {report.tapes.map((t) => {
          const hidden = t.changed && (denied.includes(t.token) || isDeniedRec(t.token))
          const brief = buildDeskBrief({
            id: t.id,
            quote: board?.tapes[t.id] ?? null,
            recipe: settings.tapes[t.id],
            path: t.path,
            upcoming: briefs?.upcoming?.[t.id],
            news: briefs?.news?.[t.id],
          })
          return (
            <article key={t.id} className="analyst-row" data-testid={`analyst-${t.id}`}>
              <p className="tape-name">
                {TAPE_META[t.id].label} · {t.pct}% {t.w}W–{t.l}L
              </p>
              <p className="analyst-expert" data-testid={`analyst-expert-${t.id}`}>
                {brief.expert}
              </p>
              <p className="tape-line" data-testid={`analyst-hug-${t.id}`}>
                {hugLine(t.id, t.hug, t.gap, t.through)}
                {t.clockMin != null ? ` · ${t.clockMin.toFixed(1)} min` : ''}
                {t.yesAsk != null ? ` · UP ${t.yesAsk}¢ / DOWN ${t.noAsk}¢` : ''}
              </p>
              <p className="tape-line" data-testid={`analyst-path-${t.id}`}>
                {formatPathWindow(t.id, t.path.hours24, '24h')}
                {' · '}
                {formatPathWindow(t.id, t.path.hours48, '48h')}
              </p>
              <p className="tape-line" data-testid={`analyst-score-${t.id}`}>
                {formatDeskPnl(t.score)}
              </p>
              <p className="tape-recipe" data-testid={`analyst-next-${t.id}`}>
                {hidden ? `DENIED · KEEP ${TAPE_META[t.id].label} current recipe` : t.proposed}
              </p>
              {t.why.slice(1).map((line) => (
                <p key={line} className="pulse-note">
                  {line}
                </p>
              ))}
              <div className="analyst-report" data-testid={`analyst-report-${t.id}`}>
                <p className="analyst-report-label">Upcoming runs</p>
                <div className="analyst-upcoming" data-testid={`analyst-upcoming-${t.id}`}>
                  {brief.upcoming.length ? (
                    brief.upcoming.map((run) => (
                      <span key={run.ticker} className="analyst-run" data-kind={run.kind}>
                        {run.kind === 'live' ? 'LIVE' : 'NEXT'} {run.label}
                      </span>
                    ))
                  ) : (
                    <span className="analyst-run">waiting on Kalshi clocks</span>
                  )}
                </div>
                <p className="analyst-report-label">Trend</p>
                <p className="tape-line" data-testid={`analyst-trend-${t.id}`}>
                  {brief.trend}
                </p>
                <p className="analyst-report-label">News focus</p>
                <p className="tape-line" data-testid={`analyst-news-focus-${t.id}`}>
                  {brief.newsFocus}
                </p>
                {brief.news.map((item) => (
                  <p key={`${item.href}-${item.at}`} className="analyst-news pulse-note">
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                    {item.source ? ` · ${item.source}` : ''}
                    {item.at ? ` · ${formatNewsAge(item.at)}` : ''}
                  </p>
                ))}
                <p className="analyst-report-label">Swings</p>
                <p
                  className="swing-good tape-line"
                  data-testid={`analyst-swing-good-${t.id}`}
                  data-side={brief.swing.side}
                  data-risk={brief.swing.risk}
                >
                  {brief.swing.good}
                </p>
                <p className="swing-bad tape-line" data-testid={`analyst-swing-bad-${t.id}`}>
                  {brief.swing.bad}
                </p>
              </div>
              <div className="analyst-actions">
                <button
                  type="button"
                  className="chip-btn tap rec-accept"
                  data-testid={`analyst-accept-${t.id}`}
                  disabled={killed || hidden || !t.changed}
                  onClick={() => {
                    if (killed || hidden || !t.changed) return
                    onAccept(t.id, t.nextRecipe)
                    setSaved(`${TAPE_META[t.id].label} recipe applied to this run`)
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="chip-btn tap rec-deny"
                  data-testid={`analyst-deny-${t.id}`}
                  disabled={hidden || !t.changed}
                  onClick={() => {
                    const next = denyAnalystRec(t.token)
                    setDenied(next)
                    onDeny(t.id, t.token)
                    setSaved(`${TAPE_META[t.id].label} rec denied — current recipe stays`)
                  }}
                >
                  Deny
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="pulse-note" data-testid="analyst-summary">
        {report.summary}
      </p>
      <div className="settings-toggles">
        <button
          type="button"
          className="chip-btn"
          data-testid="analyst-save-paper"
          onClick={() => {
            const next = savePaperDrafts(makePaperDrafts(report))
            setDrafts(next)
            setSaved('Paper draft saved — Live untouched')
          }}
        >
          Save paper draft
        </button>
        {drafts ? (
          <span className="settings-cash" data-testid="analyst-draft-asof">
            Paper draft {new Date(drafts.asOf).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      {saved ? (
        <p className="desk-msg" data-testid="analyst-saved">
          {saved}
        </p>
      ) : null}
    </section>
  )
}

function hugLine(id: TapeId, hug: 'hug' | 'through' | 'no-print', gap: number | null, through: number) {
  if (hug === 'no-print') return 'no live $'
  const g = gap == null ? '—' : formatLive(id, Math.abs(gap)).replace('$', '')
  const thru = formatLive(id, through).replace('$', '')
  return hug === 'hug' ? `hug ${g} < through ${thru}` : `through ${g} ≥ ${thru}`
}
