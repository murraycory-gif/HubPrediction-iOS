import { useMemo, useState } from 'react'
import {
  analyzeDesk,
  loadPaperDrafts,
  makePaperDrafts,
  savePaperDrafts,
  type PaperDrafts,
} from '../lib/analyst'
import { TAPE_META, formatLive, type HitLatch, type TapeId } from '../lib/tapes'
import type { DeskBoard } from '../lib/types'

export function AnalystPanel({ board, hits }: { board: DeskBoard | null; hits: HitLatch }) {
  const report = useMemo(() => analyzeDesk(board, hits), [board?.fetchedAt, hits])
  const [drafts, setDrafts] = useState<PaperDrafts | null>(() => loadPaperDrafts())
  const [saved, setSaved] = useState('')

  return (
    <section className="analyst" data-testid="analyst">
      <p className="hud-label">Analyst · paper notes only</p>
      <p className="settings-note" data-testid="analyst-lock">
        Starts from the gold lock. Does not flip Live. Does not write contract / through / window onto the live
        desk.
      </p>
      <div className="analyst-grid">
        {report.tapes.map((t) => (
          <article key={t.id} className="analyst-row" data-testid={`analyst-${t.id}`}>
            <p className="tape-name">
              {TAPE_META[t.id].label} · {t.pct}% {t.w}W–{t.l}L
            </p>
            <p className="tape-line" data-testid={`analyst-hug-${t.id}`}>
              {hugLine(t.id, t.hug, t.gap, t.through)}
              {t.clockMin != null ? ` · ${t.clockMin.toFixed(1)} min` : ''}
              {t.yesAsk != null ? ` · UP ${t.yesAsk}¢ / DOWN ${t.noAsk}¢` : ''}
            </p>
            <p className="tape-recipe" data-testid={`analyst-next-${t.id}`}>
              {t.proposed}
            </p>
          </article>
        ))}
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
            setSaved('Paper draft saved — live recipes untouched')
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
