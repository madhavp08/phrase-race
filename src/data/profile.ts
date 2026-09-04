import { getAnonymousId } from './anonymousId'
import { errorFromBody, readResponseBody } from './http'

export interface PublicProfile {
  username: string
  guest: boolean
  runCount: number
  bestWpm: number | null
  bestAccuracy: number | null
  rank: number | null
  modeLabel: string | null
}

export async function fetchProfile(opts: {
  username?: string | null
  anonymousId?: string | null
}): Promise<{ profile: PublicProfile | null; error: string | null }> {
  const params = new URLSearchParams()
  const username = opts.username?.trim()
  const anonymousId = opts.anonymousId?.trim() || getAnonymousId()
  if (username) params.set('username', username)
  if (anonymousId) params.set('anonymousId', anonymousId)
  if (![...params.keys()].length) {
    return { profile: null, error: 'Missing profile lookup' }
  }

  try {
    const response = await fetch(`/api/profile?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
    const { ok, status, json, text } = await readResponseBody(response)
    const body =
      json && typeof json === 'object'
        ? (json as { profile?: PublicProfile | null; error?: unknown })
        : {}
    if (!ok || !body.profile) {
      return {
        profile: null,
        error: errorFromBody(status, json, text, `Profile failed (${status})`),
      }
    }
    return { profile: body.profile, error: null }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error.message : 'Could not load profile',
    }
  }
}
