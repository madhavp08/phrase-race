/// <reference types="node" />
import { getDatabaseUrl } from '../_lib/db'
import { getModelSummary } from '../_lib/store'

export default async function handler(
  req: { method?: string },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!getDatabaseUrl()) {
    res.status(503).json({
      error: 'DATABASE_URL is not set.',
      models: [],
    })
    return
  }

  try {
    const models = await getModelSummary()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ models })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to load summary',
      models: [],
    })
  }
}
