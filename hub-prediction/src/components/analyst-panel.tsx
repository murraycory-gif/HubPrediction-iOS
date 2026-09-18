import { useMemo, useState } from 'react'
import {
  analyzeDesk,
  clockCall,
  denyAnalystRec,
  explainRules,
  isDeniedRec,
  listDeniedRecs,
  loadPaperDrafts,
  makePaperDrafts,
  profitImpact,
  proposalCopy,
  savePaperDrafts,
  type AnalystBet,
  type DeskPaths,
  type PaperDrafts,
} from '../lib/analyst'
import { buildDeskBrief, formatNewsAge, type DeskBriefsPayload } from '../lib/desk-brief'
import { HIT_FLOOR } from '../lib/finance'
import {
  TAPE_META,
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
        Each tape has its own desk chief. Current rules, the proposed change, why, and the dollar math are on the card.
        Accept writes that tape’s recipe for this run. Deny keeps it. Does not flip Live or live cash.
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
          const rules = explainRules(t.id, t.currentRecipe)
          const proposal = hidden
            ? { title: `Denied — keep ${TAPE_META[t.id].label} current rules`, lines: proposalCopy(t).lines }
            : proposalCopy(t)
          const money = profitImpact(t, t.lean === 'down' ? t.noAsk : t.yesAsk)
          return (
            <article key={t.id} className="analyst-row" data-testid={`analyst-${t.id}`}>
              <p className="tape-name">
                {TAPE_META[t.id].label} · {t.pct}% {t.w}W–{t.l}L
              </p>
              <p className="analyst-expert" data-testid={`analyst-expert-${t.id}`}>
                {brief.expert}
              </p>

              <div className="analyst-block" data-testid={`analyst-rules-${t.id}`}>
                <p className="analyst-report-label">Current rules</p>
                <p className="analyst-plain">{rules.arm}</p>
                <p className="analyst-plain">{rules.through}</p>
                <p className="analyst-plain">{rules.cents}</p>
                <p className="analyst-plain">{rules.size}</p>
                <p className="analyst-plain" data-testid={`analyst-hug-${t.id}`}>
                  {clockCall(t.id, t)}
                </p>
              </div>

              <div className="analyst-block" data-testid={`analyst-proposed-${t.id}`}>
                <p className="analyst-report-label">Proposed</p>
                <p className="tape-recipe" data-testid={`analyst-next-${t.id}`}>
                  {proposal.title}
                </p>
                {proposal.lines.map((line) => (
                  <p key={line} className="analyst-plain">
                    {line}
                  </p>
                ))}
              </div>

              <div className="analyst-block" data-testid={`analyst-why-${t.id}`}>
                <p className="analyst-report-label">Why</p>
                {(hidden ? ['You denied this retune. Current rules stay.'] : t.why).map((line) => (
                  <p key={line} className="analyst-plain">
                    {line}
                  </p>
                ))}
              </div>

              <div className="analyst-block analyst-money" data-testid={`analyst-profit-${t.id}`}>
                <p className="analyst-report-label">Profit dollars</p>
                <p className={money.tone === 'up' ? 'swing-good' : 'swing-bad'}>{money.headline}</p>
                <p className="analyst-plain">{money.detail}</p>
              </div>

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
                <p className="analyst-plain" data-testid={`analyst-trend-${t.id}`}>
                  {brief.trend}
                </p>
                <p className="analyst-report-label">News focus</p>
                <p className="analyst-plain" data-testid={`analyst-news-focus-${t.id}`}>
                  {brief.newsFocus}
                </p>
                {brief.news.map((item) => (
                  <p key={`${item.href}-${item.at}`} className="analyst-news analyst-plain">
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
                  className="swing-good analyst-plain"
                  data-testid={`analyst-swing-good-${t.id}`}
                  data-side={brief.swing.side}
                  data-risk={brief.swing.risk}
                >
                  Good: {brief.swing.good}
                </p>
                <p className="swing-bad analyst-plain" data-testid={`analyst-swing-bad-${t.id}`}>
                  Bad: {brief.swing.bad}
                </p>
              </div>
              <p className="analyst-plain" data-testid={`analyst-score-${t.id}`}>
                Book 24h {t.score.pnl24 === 0 && t.score.pnl48 === 0 ? 'no live $ yet' : `${t.score.wins}W–${t.score.losses}L`}
              </p>
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
