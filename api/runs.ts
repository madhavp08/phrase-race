/// <reference types="node" />
import { validateRunPayload } from '../src/core/runPayload'
import { getDatabaseUrl } from './_lib/db'
import { createRun } from './_lib/store'

export default async function handler(
  req: {
    method?: string
    body?: unknown
  },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const parsed = validateRunPayload(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }

  if (!getDatabaseUrl()) {
    res.status(503).json({
      error:
        'DATABASE_URL is not set. Provision Neon and add the connection string to run persistence.',
    })
    return
  }

  try {
    const id = await createRun(parsed.value)
    res.setHeader('Cache-Control', 'no-store')
    res.status(201).json({ id })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to save run',
    })
  }
}
