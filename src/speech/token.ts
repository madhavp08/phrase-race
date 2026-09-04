import type { DeepgramTokenResponse } from './types'

async function fetchAccessToken(
  path: string,
  label: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error(
      `Could not reach ${path}. Run npm run dev locally, or deploy with the matching serverless function and API key set.`,
    )
  }

  let body: DeepgramTokenResponse & { error?: string; token?: string }
  try {
    body = (await response.json()) as DeepgramTokenResponse & {
      error?: string
      token?: string
    }
  } catch {
    throw new Error(`${label} token endpoint returned invalid JSON`)
  }

  const token = body.access_token || body.token
  if (!response.ok || !token) {
    throw new Error(body.error || `Could not get ${label} access token`)
  }

  return token
}

/** Fetch a short-lived Deepgram JWT from our Vite / Vercel endpoint. */
export async function fetchDeepgramToken(): Promise<string> {
  return fetchAccessToken('/api/deepgram-token', 'Deepgram')
}

export async function fetchOpenAIRealtimeToken(): Promise<string> {
  return fetchAccessToken('/api/openai-realtime-token', 'OpenAI')
}

export async function fetchElevenLabsToken(): Promise<string> {
  return fetchAccessToken('/api/elevenlabs-token', 'ElevenLabs')
}
