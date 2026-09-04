/// <reference types="node" />
/**
 * Mints an ElevenLabs single-use realtime_scribe token so the browser
 * never sees ELEVENLABS_API_KEY.
 *
 * GET/POST /api/elevenlabs-token → { access_token, expires_in }
 */

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

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim()
  if (!apiKey || apiKey.includes('your_eleven')) {
    res.status(500).json({
      error: 'ELEVENLABS_API_KEY is not set on the Vercel project.',
    })
    return
  }

  try {
    const grant = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          Accept: 'application/json',
        },
      },
    )

    const body = (await grant.json()) as {
      token?: string
      detail?: { message?: string } | string
      error?: string
    }

    if (!grant.ok || !body.token) {
      const detail =
        typeof body.detail === 'string'
          ? body.detail
          : body.detail?.message || body.error
      res.status(grant.status || 502).json({
        error: detail || `ElevenLabs token grant failed (${grant.status})`,
      })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      access_token: body.token,
      expires_in: 15 * 60,
    })
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to reach ElevenLabs auth',
    })
  }
}
