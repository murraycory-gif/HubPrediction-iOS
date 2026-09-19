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

let deskClient = false

function Home() {
  const seed = Route.useLoaderData()
  const [, bump] = useState(0)
  useLayoutEffect(() => {
    if (!deskClient) {
      deskClient = true
      bump(1)
    }
  }, [])
  if (!deskClient) {
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
