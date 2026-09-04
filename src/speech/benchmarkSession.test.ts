import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderHandlers, STTProvider, SpeechConnectionState } from './types'

class FakeProvider implements STTProvider {
  readonly id: string
  readonly name: string
  readonly model: string
  chunks: ArrayBuffer[] = []
  state: SpeechConnectionState = 'idle'
  handlers: ProviderHandlers

  constructor(id: string, handlers: ProviderHandlers) {
    this.id = id
    this.name = id
    this.model = `${id}-model`
    this.handlers = handlers
  }

  getState() {
    return this.state
  }

  getConfig() {
    return { provider: this.id }
  }

  async connect() {
    this.state = 'live'
    this.handlers.onStateChange?.('live')
  }

  sendAudio(chunk: ArrayBuffer) {
    this.chunks.push(chunk)
  }

  async close() {
    this.state = 'idle'
  }

  fail(message: string) {
    this.handlers.onError?.(message)
  }

  emit(text: string, isFinal: boolean) {
    this.handlers.onEvent({
      provider: this.id,
      model: this.model,
      text,
      isFinal,
      receivedAt: 1_000,
    })
  }
}

const fakes = new Map<string, FakeProvider>()
let onChunk: ((pcm: ArrayBuffer) => void) | null = null
const stopMic = vi.fn()

vi.mock('./factory', () => ({
  createProvider: (id: string, handlers: ProviderHandlers) => {
    const fake = new FakeProvider(id, handlers)
    fakes.set(id, fake)
    return fake
  },
}))

vi.mock('./mic', async () => {
  const actual = await vi.importActual<typeof import('./mic')>('./mic')
  return {
    ...actual,
    createMicCapture: async () => ({
      start: (handler: (pcm: ArrayBuffer) => void) => {
        onChunk = handler
      },
      stop: stopMic,
    }),
  }
})

describe('BenchmarkSession', () => {
  beforeEach(() => {
    fakes.clear()
    onChunk = null
    stopMic.mockClear()
  })

  it('fans identical PCM to every adapter and scores them', async () => {
    const { BenchmarkSession } = await import('./benchmarkSession')
    const onFinal = vi.fn()
    const session = new BenchmarkSession({
      providers: 'deepgram,openai,elevenlabs',
      onFinal,
      onLive: vi.fn(),
    })

    await session.start()
    expect(fakes.size).toBe(3)

    const chunk = new Uint8Array([1, 2, 3, 4]).buffer
    onChunk?.(chunk)
    for (const fake of fakes.values()) {
      expect(fake.chunks).toHaveLength(1)
    }

    fakes.get('deepgram')?.emit('hello', true)
    expect(onFinal).toHaveBeenCalledWith('hello')

    fakes.get('openai')?.fail('quota')
    const results = session.finish({
      referenceWords: ['hello'],
      elapsedMs: 60_000,
    })
    expect(results).toHaveLength(3)
    expect(results.find((row) => row.provider === 'deepgram')?.status).toBe(
      'valid',
    )
    expect(results.find((row) => row.provider === 'openai')?.status).toBe(
      'provider_failure',
    )
    expect(stopMic).toHaveBeenCalled()
  })
})
