import type { DeskSettings, TapeId, TapeRecipe } from '../lib/tapes'
import { TAPE_IDS, TAPE_META } from '../lib/tapes'

export function SettingsPanel(props: {
  settings: DeskSettings
  onLiveBets: (on: boolean) => void
  onTape: (id: TapeId, patch: Partial<TapeRecipe>) => void
  onRefreshCash: () => void
  cashLabel: string
  recipeLocked?: boolean
}) {
  return (
    <section className="settings" data-testid="settings">
      <p className="hud-label">Settings · same desk on phone</p>
      <p className="settings-note">
        Bot, live cash, and contracts sit on each tape card. Factory gold is the default. Accept an Analyst
        retune to apply a new recipe to that tape for this run. For paper test: Bot ON, Live cash OFF, master
        Live OFF. Kalshi keys live on the Windows host. Soft FAIL paste PEM. Soft FAIL Live POST. Soft FAIL
        flipping Live from Analyst. Win-ratio goal is 83%.
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
