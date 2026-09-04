/// <reference types="node" />
import { getDatabaseUrl } from './_lib/db.js'
import { listLeaderboard } from './_lib/store.js'

export default async function handler(
  req: { method?: string },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed', entries: [] })
      return
    }

    if (!getDatabaseUrl()) {
      res.status(503).json({
        error: 'DATABASE_URL is not set.',
        entries: [],
      })
      return
    }

    const entries = await listLeaderboard()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ entries })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to load leaderboard',
      entries: [],
    })
  }
}
