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
  killed,
  onAccept,
  onDeny,
}: {
  board: DeskBoard | null
  hits: HitLatch
  settings: DeskSettings
  bets: AnalystBet[]
  paths: DeskPaths | null
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
      <p className="hud-label">Analyst · each desk vs its recipe</p>
      <p className="settings-note" data-testid="analyst-lock">
        Reads the current bot recipe, your fills vs that recipe, and the 24h / 48h move vs now. Accept writes the
        retune onto that tape for this run. Deny keeps the current recipe. Does not flip Live or live cash.
      </p>
      <div className="analyst-grid">
        {report.tapes.map((t) => {
          const hidden = t.changed && (denied.includes(t.token) || isDeniedRec(t.token))
          return (
            <article key={t.id} className="analyst-row" data-testid={`analyst-${t.id}`}>
              <p className="tape-name">
                {TAPE_META[t.id].label} · {t.pct}% {t.w}W–{t.l}L
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
