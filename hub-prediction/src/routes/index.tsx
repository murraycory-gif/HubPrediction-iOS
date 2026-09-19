import { useLayoutEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '../components/dashboard'
import { getDeskBoard } from '../lib/btc-data'

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      return await getDeskBoard({ data: {} })
    } catch {
      return null
    }
  },
  component: Home,
})

function Home() {
  const seed = Route.useLoaderData()
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) {
    return (
      <div className="desk" data-testid="desk">
        <header className="desk-head" data-testid="desk-head" data-host-ready="0">
          <h1 className="desk-title" data-testid="desk-title">
            HUB Predictions
          </h1>
        </header>
      </div>
    )
  }
  return <Dashboard seedBoard={seed ?? null} />
}
