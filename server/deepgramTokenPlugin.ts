import type { Plugin } from 'vite'

/**
 * Dev/preview middleware: mints a short-lived Deepgram JWT so the browser
 * never sees the long-lived DEEPGRAM_API_KEY.
 *
 * POST/GET /api/deepgram-token → { access_token, expires_in }
 */
export function deepgramTokenPlugin(): Plugin {
  const attach = (server: {
    middlewares: {
      use: (
        path: string,
        handler: (
          req: { method?: string },
          res: {
            statusCode: number
            setHeader: (k: string, v: string) => void
            end: (body?: string) => void
          },
        ) => void,
      ) => void
    }
  }) => {
    server.middlewares.use('/api/deepgram-token', async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      const apiKey = process.env.DEEPGRAM_API_KEY?.trim()
      if (!apiKey || apiKey.includes('your_deepgram')) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error:
              'DEEPGRAM_API_KEY is not set. Add your real key to .env and restart npm run dev.',
          }),
        )
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
          res.statusCode = grant.status || 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error:
                body.err_msg ||
                body.error ||
                `Deepgram token grant failed (${grant.status})`,
            }),
          )
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            access_token: body.access_token,
            expires_in: body.expires_in ?? 30,
          }),
        )
      } catch (error) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to reach Deepgram auth',
          }),
        )
      }
    })
  }

  return {
    name: 'deepgram-token-plugin',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
