/// <reference types="node" />
/**
 * Boot probe with zero database imports. If this 500s, the isolate itself
 * cannot start. /api/leaderboard and /api/runs import Neon separately.
 */
export default async function handler(
  req: { method?: string; url?: string; query?: Record<string, unknown> },
  res: {
    status: (code: number) => typeof res
    json: (body: unknown) => void
    setHeader: (key: string, value: string) => void
  },
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true })
}
