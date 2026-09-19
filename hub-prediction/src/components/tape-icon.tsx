import type { TapeId } from '../lib/tapes'

const FILL: Record<TapeId, string> = {
  btc: '#f7931a',
  ng: '#3d8bfd',
  cu: '#b87333',
  gld: '#d4af37',
  wti: '#2f6b4f',
  slv: '#c0c7d1',
}

export function TapeIcon({ id }: { id: TapeId }) {
  return (
    <span className={`tape-icon tape-icon-${id}`} data-testid={`icon-${id}`} aria-hidden>
      <svg viewBox="0 0 32 32" width="36" height="36">
        <circle cx="16" cy="16" r="16" fill={FILL[id]} />
        {id === 'btc' ? (
          <text x="16" y="21" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0a100e">
            ₿
          </text>
        ) : (
          <text x="16" y="21" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0a100e">
            {id === 'ng' ? 'NG' : id === 'cu' ? 'CU' : id === 'wti' ? 'WTI' : id === 'slv' ? 'AG' : 'AU'}
          </text>
        )}
      </svg>
    </span>
  )
}
