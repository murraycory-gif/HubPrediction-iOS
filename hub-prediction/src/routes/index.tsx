import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '../components/dashboard'
import { peekLastQuote } from '../lib/btc-data'

export const Route = createFileRoute('/')({
  loader: async () => peekLastQuote(),
  component: Home,
})

function Home() {
  const seed = Route.useLoaderData()
  return <Dashboard seedQuote={seed?.quote ?? null} seedDash={seed?.dash ?? null} />
}
