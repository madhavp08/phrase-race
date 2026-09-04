import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDeepgramToken } from './token'

describe('fetchAccessToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads a JSON error instead of crashing on HTML 504', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>timeout</html>', { status: 504 })),
    )
    await expect(fetchDeepgramToken()).rejects.toThrow(/timed out/i)
  })

  it('returns the access token from a healthy grant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: 'jwt-1', expires_in: 30 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    await expect(fetchDeepgramToken()).resolves.toBe('jwt-1')
  })
})
