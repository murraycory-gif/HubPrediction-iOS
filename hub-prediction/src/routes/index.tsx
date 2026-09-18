import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '../components/dashboard'
import { peekDesk } from '../lib/btc-data'

export const Route = createFileRoute('/')({
  loader: async () => peekDesk(),
  component: Home,
})

function Home() {
  const seed = Route.useLoaderData()
  return <Dashboard seedBoard={seed ?? null} />
}
