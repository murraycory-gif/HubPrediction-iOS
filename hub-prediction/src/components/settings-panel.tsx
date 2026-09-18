import { useEffect, useState } from 'react'
import type { DeskSettings, TapeId, TapeRecipe } from '../lib/tapes'
import { TAPE_IDS, TAPE_META, clampContracts } from '../lib/tapes'

export function SettingsPanel(props: {
  settings: DeskSettings
  keyId: string
  pem: string
  onKeyId: (v: string) => void
  onPem: (v: string) => void
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
        Contracts, bots, live cash, and recipes save on this device. Refresh keeps them. Live bets stay OFF
        unless you confirm Live. Keys stay on this PC/phone — never in git.
        {props.recipeLocked ? ' Recipe lock on — Soft FAIL chase retune after a loss / KILL.' : ''}
      </p>

      <div className="settings-master">
        <label className={`toggle ${props.settings.liveBets ? 'toggle-hot' : ''}`}>
          <input
            type="checkbox"
            data-testid="live-bets"
            checked={props.settings.liveBets}
            onChange={(e) => props.onLiveBets(e.target.checked)}
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
          recipeLocked={props.recipeLocked === true}
          onChange={(patch) => props.onTape(id, patch)}
        />
      ))}
    </section>
  )
}

function TapeSettings({
  id,
  recipe,
  recipeLocked,
  onChange,
}: {
  id: TapeId
  recipe: TapeRecipe
  recipeLocked: boolean
  onChange: (patch: Partial<TapeRecipe>) => void
}) {
  const meta = TAPE_META[id]
  const [draft, setDraft] = useState(recipe.contracts)
  useEffect(() => {
    setDraft(recipe.contracts)
  }, [recipe.contracts])

  function saveContracts(raw: number = draft) {
    const n = clampContracts(Number(raw))
    setDraft(n)
    onChange({ contracts: n })
  }

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
            value={draft}
            disabled={recipeLocked}
            onChange={(e) => {
              const n = clampContracts(Number(e.target.value))
              setDraft(n)
              onChange({ contracts: n })
            }}
            onBlur={() => saveContracts()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveContracts()
            }}
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
            disabled
            readOnly
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
            disabled
            readOnly
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
            disabled
            readOnly
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
            disabled
            readOnly
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
            disabled
            readOnly
          />
        </label>
      </div>
      <div className="settings-toggles">
        <label className={`toggle ${recipe.botOn ? 'toggle-on' : ''}`}>
          <input
            type="checkbox"
            data-testid={`bot-${id}`}
            checked={recipe.botOn}
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
        <button
          type="button"
          className="chip-btn"
          data-testid={`save-${id}`}
          disabled={recipeLocked}
          onClick={() => saveContracts()}
        >
          Save
        </button>
      </div>
    </div>
  )
}
