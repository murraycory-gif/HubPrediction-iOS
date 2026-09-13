import { useEffect, useState } from 'react'

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

export function CloseClock({ closeAt }: { closeAt?: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  if (!closeAt || !Number.isFinite(closeAt)) {
    return (
      <span className="count" data-testid="close-clock">
        --:--
      </span>
    )
  }

  const left = Math.max(0, closeAt - now)
  const mm = Math.floor(left / 60_000)
  const ss = Math.floor((left % 60_000) / 1000)

  return (
    <span className="count" data-testid="close-clock">
      {pad(mm)}:{pad(ss)}
    </span>
  )
}
