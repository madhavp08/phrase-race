/// <reference types="node" />
import { getDatabaseUrl } from './_lib/db.js'
import { getPublicProfile } from './_lib/store.js'

export default async function handler(
  req: {
    method?: string
    url?: string
    query?: Record<string, unknown>
  },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    if (!getDatabaseUrl()) {
      res.status(503).json({
        error: 'DATABASE_URL is not set.',
        profile: null,
      })
      return
    }

    const { anonymousId, username } = readParams(req)
    if (!anonymousId && !username) {
      res.status(400).json({
        error: 'username or anonymousId is required',
        profile: null,
      })
      return
    }

    const profile = await getPublicProfile({ anonymousId, username })
    res.setHeader('Cache-Control', 'no-store')
    if (!profile) {
      res.status(404).json({ error: 'Profile not found', profile: null })
      return
    }
    res.status(200).json({ profile })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to load profile',
      profile: null,
    })
  }
}

function first(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim()
  }
  return null
}

function readParams(req: {
  url?: string
  query?: Record<string, unknown>
}): { anonymousId: string | null; username: string | null } {
  const query = req.query ?? {}
  let anonymousId = first(query.anonymousId)
  let username = first(query.username)
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost')
      anonymousId = anonymousId ?? first(parsed.searchParams.get('anonymousId'))
      username = username ?? first(parsed.searchParams.get('username'))
    } catch {
      /* ignore malformed url */
    }
  }
  return { anonymousId, username }
}
