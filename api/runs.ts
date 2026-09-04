/// <reference types="node" />
import { getDatabaseUrl } from './_lib/db.js'
import { AccountConflictError } from './_lib/errors.js'
import { validateRunPayload } from './_lib/runPayload.js'
import { createRun } from './_lib/store.js'

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
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const parsed = validateRunPayload(coerceBody(req.body))
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

    const result = await createRun(parsed.value)
    res.setHeader('Cache-Control', 'no-store')
    res.status(201).json(result)
  } catch (error) {
    console.error('[api/runs]', error)
    if (
      error instanceof AccountConflictError ||
      (error instanceof Error && error.name === 'AccountConflictError')
    ) {
      const code =
        error instanceof AccountConflictError ? error.code : 'username_taken'
      res.status(409).json({ error: error.message, code })
      return
    }
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to save run',
    })
  }
}

function coerceBody(body: unknown): unknown {
  if (typeof body === 'string') return body
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return body.toString('utf8')
  }
  return body
}
