import { describe, expect, it, vi } from 'vitest'
import { createProvider } from './factory'
import { arrayBufferToBase64, pcmDurationMs, pcmSampleCount } from './pcm'
import { fetchDeepgramToken, fetchElevenLabsToken, fetchOpenAIRealtimeToken } from './token'
import type { TranscriptEvent } from './types'

function handlers() {
  return {
    onEvent: vi.fn<(event: TranscriptEvent) => void>(),
    onError: vi.fn<(message: string) => void>(),
    onStateChange: vi.fn(),
  }
}

describe('createProvider', () => {
  it('constructs each adapter with idle state and config metadata', async () => {
    for (const id of ['deepgram', 'openai', 'elevenlabs'] as const) {
      const provider = createProvider(id, handlers())
      expect(provider.id).toBe(id)
      expect(provider.getState()).toBe('idle')
      expect(provider.getConfig().provider).toBe(id)
      expect(provider.model.length).toBeGreaterThan(0)
      provider.sendAudio(new ArrayBuffer(4))
      await provider.close()
      expect(provider.getState()).toBe('idle')
    }
  })
})

describe('pcm helpers', () => {
  it('encodes bytes as base64 and counts samples', () => {
    const bytes = new Uint8Array([0, 0, 0, 0])
    expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa('\0\0\0\0'))
    expect(pcmSampleCount(bytes.buffer)).toBe(2)
    expect(pcmDurationMs(bytes.buffer, 16000)).toBeCloseTo(0.125, 5)
  })
})

describe('token fetchers', () => {
  it('returns access_token from each mint endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return new Response(JSON.stringify({ access_token: `tok-${url}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDeepgramToken()).resolves.toContain('/api/deepgram-token')
    await expect(fetchOpenAIRealtimeToken()).resolves.toContain(
      '/api/openai-realtime-token',
    )
    await expect(fetchElevenLabsToken()).resolves.toContain('/api/elevenlabs-token')

    vi.unstubAllGlobals()
  })

  it('surfaces JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'no key' }), { status: 500 }),
      ),
    )
    await expect(fetchDeepgramToken()).rejects.toThrow('no key')
    vi.unstubAllGlobals()
  })
})
