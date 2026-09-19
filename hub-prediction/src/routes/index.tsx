import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '../components/dashboard'
import { getDeskBoard, peekDesk } from '../lib/btc-data'

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      const peek = await peekDesk()
      if (peek) return peek
      return await Promise.race([
        getDeskBoard({ data: {} }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 600)),
      ])
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
