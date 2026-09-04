/// <reference types="node" />
/**
 * Mints an OpenAI Realtime ephemeral client secret so the browser never
 * sees OPENAI_API_KEY. Session is pinned to gpt-live-transcribe @ 24 kHz
 * (upsampled from PhraseRace's 16 kHz canonical PCM).
 *
 * GET/POST /api/openai-realtime-token → { access_token, expires_in }
 */

const OPENAI_MODEL = 'gpt-live-transcribe'

export default async function handler(
  req: { method?: string },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey || apiKey.includes('your_openai')) {
    res.status(500).json({
      error: 'OPENAI_API_KEY is not set on the Vercel project.',
    })
    return
  }

  try {
    const grant = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: {
                model: OPENAI_MODEL,
                languages: ['en'],
                delay: 'low',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 200,
                silence_duration_ms: 200,
              },
            },
          },
        },
      }),
    })

    const body = (await grant.json()) as {
      value?: string
      expires_at?: number
      client_secret?: { value?: string; expires_at?: number }
      error?: { message?: string }
    }

    const token = body.value || body.client_secret?.value
    const expiresAt = body.expires_at ?? body.client_secret?.expires_at
    if (!grant.ok || !token) {
      res.status(grant.status || 502).json({
        error:
          body.error?.message ||
          `OpenAI client secret grant failed (${grant.status})`,
      })
      return
    }

    const expiresIn = expiresAt
      ? Math.max(1, Math.round(expiresAt - Date.now() / 1000))
      : 60

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      access_token: token,
      expires_in: expiresIn,
    })
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error ? error.message : 'Failed to reach OpenAI auth',
    })
  }
}
