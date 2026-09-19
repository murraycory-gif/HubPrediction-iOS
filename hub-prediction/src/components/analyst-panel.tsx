import { useLayoutEffect, useMemo, useState } from 'react'
import {
  analyzeDesk,
  clockCall,
  explainRules,
  isRehabPaper,
  loadPaperDrafts,
  makePaperDrafts,
  profitImpact,
  proposalCopy,
  REHAB_PAPER_RUNS,
  rehabCopy,
  savePaperDrafts,
  type AnalystAutoState,
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
} from '../lib/tapes'
import type { DeskBoard } from '../lib/types'

export function AnalystPanel({
  board,
  hits,
  settings,
  bets,
  paths,
  briefs,
  rehab,
  killed,
}: {
  board: DeskBoard | null
  hits: HitLatch
  settings: DeskSettings
  bets: AnalystBet[]
  paths: DeskPaths | null
  briefs?: DeskBriefsPayload | null
  rehab: AnalystAutoState
  killed?: boolean
}) {
  const report = useMemo(
    () => analyzeDesk(board, hits, bets, settings.tapes, paths),
    [board?.fetchedAt, hits, bets, settings, paths],
  )
  const [drafts, setDrafts] = useState<PaperDrafts | null>(() => loadPaperDrafts())
  const [saved, setSaved] = useState('')
  const [hydrated, setHydrated] = useState(false)
  useLayoutEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <section className="analyst" data-testid="analyst">
      <p className="hud-label">Analyst · {HIT_FLOOR}% win-ratio goal · drafts</p>
      <p className="settings-note" data-testid="analyst-lock">
        Each tape has its own desk chief. Analyst proposes paper drafts only. Soft FAIL Accept. Soft FAIL
        auto Live recipe rewrite. Chief auto-size under floors/kill. More than two losses halt that desk for
        paper rehab — Live cash stays as you left it. Paper-test {REHAB_PAPER_RUNS} consistent runs.
      </p>
      <div className="analyst-grid">
        {report.tapes.map((t) => {
          const brief = buildDeskBrief({
            id: t.id,
            quote: board?.tapes[t.id] ?? null,
            recipe: settings.tapes[t.id],
            path: t.path,
            upcoming: briefs?.upcoming?.[t.id],
            news: briefs?.news?.[t.id],
            now: hydrated ? undefined : 0,
          })
          const rules = explainRules(t.id, t.currentRecipe)
          const proposal = proposalCopy(t)
          const money = profitImpact(t, t.lean === 'down' ? t.noAsk : t.yesAsk)
          const rehabNote = rehabCopy(rehab, t.id, bets)
          const paper = isRehabPaper(rehab, t.id)
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
                  {t.changed ? 'Proposed only — Soft FAIL Accept' : proposal.title}
                </p>
                {proposal.lines.map((line) => (
                  <p key={line} className="analyst-plain">
                    {line}
                  </p>
                ))}
              </div>

              <div className="analyst-block" data-testid={`analyst-why-${t.id}`}>
                <p className="analyst-report-label">Why</p>
                {t.why.map((line) => (
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
                <p className="analyst-report-label">Hour</p>
                <p className="analyst-plain" data-testid={`analyst-hour-${t.id}`}>
                  {brief.hourTrend}
                </p>
                <p className="analyst-report-label">Same-clock prior</p>
                <p className="analyst-plain" data-testid={`analyst-clock-prior-${t.id}`}>
                  {brief.sameClock}
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
              <p
                className={paper ? 'swing-bad analyst-plain' : 'analyst-plain'}
                data-testid={`analyst-auto-${t.id}`}
              >
                {killed
                  ? 'KILL on — recipe lock. Soft FAIL Accept.'
                  : rehabNote ||
                    (t.changed
                      ? `Draft only. Soft FAIL Accept. Chief auto-size toward ${HIT_FLOOR}%.`
                      : `Matching the ${HIT_FLOOR}% book. No draft.`)}
              </p>
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
