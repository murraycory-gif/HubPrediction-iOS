import type { DeskSettings, TapeId, TapeRecipe } from '../lib/tapes'
import { TAPE_IDS, TAPE_META, clampContracts } from '../lib/tapes'

export function SettingsPanel(props: {
  settings: DeskSettings
  keyId: string
  pem: string
  onKeyId: (v: string) => void
  onPem: (v: string) => void
  onLiveBets: (on: boolean) => void
  onRequestLive: () => void
  onTape: (id: TapeId, patch: Partial<TapeRecipe>) => void
  onRefreshCash: () => void
  cashLabel: string
  killed: boolean
}) {
  return (
    <section className="settings" data-testid="settings">
      <p className="hud-label">Settings · same desk on phone</p>
      <p className="settings-note">
        Contracts, bots, live cash, and recipes save on this device. Refresh keeps them. Mode defaults Paper.
        Live bets stay OFF unless you confirm LIVE + keys. SizeCash recipe is locked this session. Keys stay
        on this PC/phone — never in git.
      </p>
      <p className="settings-note" data-testid="sizecash-lock">
        SizeCash locked · risk 8% · lock 40% · ¼ Kelly · max 25 · paper floor $50 · live floor max($150, 20%
        dep)
      </p>

      <div className="settings-master">
        <label className={`toggle ${props.settings.liveBets ? 'toggle-hot' : ''}`}>
          <input
            type="checkbox"
            data-testid="live-bets"
            checked={props.settings.liveBets}
            onChange={(e) => {
              if (e.target.checked) props.onRequestLive()
              else props.onLiveBets(false)
            }}
          />
          Live bets {props.settings.liveBets ? 'ON' : 'OFF'}
        </label>
        <button type="button" className="chip-btn" onClick={props.onRefreshCash}>
          Refresh cash
        </button>
        <span className="settings-cash" data-testid="settings-cash">
          {props.cashLabel}
        </span>
      </div>

      <input
        className="field"
        placeholder="Kalshi API Key ID (runtime only)"
        value={props.keyId}
        autoComplete="off"
        data-testid="key-id"
        onChange={(e) => props.onKeyId(e.target.value)}
      />
      <textarea
        className="field field-pem"
        placeholder="PEM private key (runtime only)"
        value={props.pem}
        data-testid="key-pem"
        onChange={(e) => props.onPem(e.target.value)}
      />

      {TAPE_IDS.map((id) => (
        <TapeSettings
          key={id}
          id={id}
          recipe={props.settings.tapes[id]}
          killed={props.killed}
          onChange={(patch) => props.onTape(id, patch)}
        />
      ))}
    </section>
  )
}

function TapeSettings({
  id,
  recipe,
  killed,
  onChange,
}: {
  id: TapeId
  recipe: TapeRecipe
  killed: boolean
  onChange: (patch: Partial<TapeRecipe>) => void
}) {
  const meta = TAPE_META[id]
  return (
    <div className="tape-settings" data-testid={`settings-${id}`}>
      <p className="tape-settings-title">{meta.label} contracts & recipe</p>
      <div className="settings-grid">
        <label>
          Contracts
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            data-testid={`contracts-${id}`}
            value={recipe.contracts}
            onChange={(e) => onChange({ contracts: clampContracts(Number(e.target.value)) })}
          />
        </label>
        <label>
          Arm from (min)
          <input
            className="field"
            type="number"
            inputMode="decimal"
            data-testid={`arm-from-${id}`}
            value={recipe.armFromMin}
            onChange={(e) => onChange({ armFromMin: Number(e.target.value) })}
          />
        </label>
        <label>
          Arm to (min)
          <input
            className="field"
            type="number"
            inputMode="decimal"
            data-testid={`arm-to-${id}`}
            value={recipe.armToMin}
            onChange={(e) => onChange({ armToMin: Number(e.target.value) })}
          />
        </label>
        <label>
          Through $
          <input
            className="field"
            type="number"
            inputMode="decimal"
            step="any"
            data-testid={`through-${id}`}
            value={recipe.through}
            onChange={(e) => onChange({ through: Number(e.target.value) })}
          />
        </label>
        <label>
          ¢ lo
          <input
            className="field"
            type="number"
            inputMode="numeric"
            data-testid={`cent-lo-${id}`}
            value={recipe.centLo}
            onChange={(e) => onChange({ centLo: Number(e.target.value) })}
          />
        </label>
        <label>
          ¢ hi
          <input
            className="field"
            type="number"
            inputMode="numeric"
            data-testid={`cent-hi-${id}`}
            value={recipe.centHi}
            onChange={(e) => onChange({ centHi: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="settings-toggles">
        <label className={`toggle ${recipe.botOn ? 'toggle-on' : ''}`}>
          <input
            type="checkbox"
            data-testid={`bot-${id}`}
            checked={recipe.botOn}
            disabled={killed}
            onChange={(e) => onChange({ botOn: e.target.checked })}
          />
          Bot {recipe.botOn ? 'ON' : 'OFF'}
        </label>
        <label className={`toggle ${recipe.liveOn ? 'toggle-hot' : ''}`}>
          <input
            type="checkbox"
            data-testid={`live-${id}`}
            checked={recipe.liveOn}
            onChange={(e) => onChange({ liveOn: e.target.checked })}
          />
          Live cash {recipe.liveOn ? 'ON' : 'OFF'}
        </label>
      </div>
    </div>
  )
}
