/**
 * Vercel serverless function equivalent of server/deepgramTokenPlugin.ts
 * (that plugin only runs under the Vite dev/preview server, not in a
 * static production build). Mints a short-lived Deepgram JWT so the
 * browser never sees the long-lived DEEPGRAM_API_KEY.
 *
 * GET/POST /api/deepgram-token → { access_token, expires_in }
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

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim()
  if (!apiKey) {
    res.status(500).json({
      error: 'DEEPGRAM_API_KEY is not set on the Vercel project.',
    })
    return
  }

  try {
    const grant = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 45 }),
    })

    const body = (await grant.json()) as {
      access_token?: string
      expires_in?: number
      err_msg?: string
      error?: string
    }

    if (!grant.ok || !body.access_token) {
      res.status(grant.status || 502).json({
        error:
          body.err_msg ||
          body.error ||
          `Deepgram token grant failed (${grant.status})`,
      })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      access_token: body.access_token,
      expires_in: body.expires_in ?? 30,
    })
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error ? error.message : 'Failed to reach Deepgram auth',
    })
  }
}
