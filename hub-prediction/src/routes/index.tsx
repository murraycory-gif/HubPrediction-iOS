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
  return <Dashboard seedBoard={seed ?? null} />
}
