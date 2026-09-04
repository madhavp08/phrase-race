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

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = null
    }
  }

  const body =
    parsed && typeof parsed === 'object'
      ? (parsed as DeepgramTokenResponse & { error?: string; token?: string })
      : null
  const token = body?.access_token || body?.token
  if (!response.ok || !token) {
    throw new Error(
      body?.error ||
        (response.status === 504 || response.status === 524
          ? `${label} token timed out on the server`
          : `${label} token failed (${response.status}). Check that the API key is set on Vercel.`),
    )
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
