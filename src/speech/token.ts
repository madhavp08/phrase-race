import type { DeepgramTokenResponse } from './types'

/** Fetch a short-lived Deepgram JWT from our Vite middleware. */
export async function fetchDeepgramToken(): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/deepgram-token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error(
      'Could not reach /api/deepgram-token. Is npm run dev running?',
    )
  }

  let body: DeepgramTokenResponse & { error?: string }
  try {
    body = (await response.json()) as DeepgramTokenResponse & { error?: string }
  } catch {
    throw new Error('Deepgram token endpoint returned invalid JSON')
  }

  if (!response.ok || !body.access_token) {
    throw new Error(body.error || 'Could not get Deepgram access token')
  }

  return body.access_token
}
