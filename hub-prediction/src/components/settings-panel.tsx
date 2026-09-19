import { HIT_FLOOR } from '../lib/finance'
import type { DeskSettings, TapeId, TapeRecipe } from '../lib/tapes'
import { TAPE_IDS, TAPE_META } from '../lib/tapes'

export function SettingsPanel(props: {
  settings: DeskSettings
  onTape: (id: TapeId, patch: Partial<TapeRecipe>) => void
  onRefreshCash: () => void
  cashLabel: string
  recipeLocked?: boolean
}) {
  return (
    <section className="settings" data-testid="settings">
      <p className="hud-label">Settings · same desk on phone</p>
      <p className="settings-note">
        Bot, live cash, and contracts sit on each tape card. Factory gold is the default. Analyst auto-updates
        each tape toward {HIT_FLOOR}%. Three losses in a row halt that desk’s live cash and paper-test 12 runs. For a
        manual paper test: Bot ON, Live cash OFF. Live cash ON + Bot ON + host keys posts to Kalshi. Soft
        FAIL paste PEM. Soft FAIL Live POST without Bot + Live cash + keys. Soft FAIL flipping Live cash from
        Analyst.
        {props.recipeLocked ? ' KILL / chase lock still blocks silent Settings retunes.' : ''}
      </p>

      <div className="settings-master">
        <button type="button" className="chip-btn glyph-plate" onClick={props.onRefreshCash}>
          Refresh cash
        </button>
        <span className="settings-cash" data-testid="settings-cash">
          {props.cashLabel}
        </span>
      </div>

      {TAPE_IDS.map((id) => (
        <TapeRecipeLock key={id} id={id} recipe={props.settings.tapes[id]} />
      ))}
    </section>
  )
}

function TapeRecipeLock({ id, recipe }: { id: TapeId; recipe: TapeRecipe }) {
  const meta = TAPE_META[id]
  return (
    <div className="tape-settings" data-testid={`settings-${id}`}>
      <p className="tape-settings-title">{meta.label} active recipe</p>
      <div className="settings-grid">
        <label>
          Arm from (min)
          <input className="field" type="number" data-testid={`arm-from-${id}`} value={recipe.armFromMin} disabled readOnly />
        </label>
        <label>
          Arm to (min)
          <input className="field" type="number" data-testid={`arm-to-${id}`} value={recipe.armToMin} disabled readOnly />
        </label>
        <label>
          Through $
          <input className="field" type="number" data-testid={`through-${id}`} value={recipe.through} disabled readOnly />
        </label>
        <label>
          ¢ lo
          <input className="field" type="number" data-testid={`cent-lo-${id}`} value={recipe.centLo} disabled readOnly />
        </label>
        <label>
          ¢ hi
          <input className="field" type="number" data-testid={`cent-hi-${id}`} value={recipe.centHi} disabled readOnly />
        </label>
      </div>
    </div>
  )
}
