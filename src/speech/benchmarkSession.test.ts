import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderHandlers, STTProvider, SpeechConnectionState } from './types'

class FakeProvider implements STTProvider {
  readonly id: string
  readonly name: string
  readonly model: string
  chunks: ArrayBuffer[] = []
  state: SpeechConnectionState = 'idle'
  handlers: ProviderHandlers
  failOnConnect = false
  delayLive = false

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
    if (this.failOnConnect) {
      this.state = 'errored'
      this.handlers.onError?.(`${this.id} failed`)
      throw new Error(`${this.id} failed`)
    }
    this.state = 'connecting'
    this.handlers.onStateChange?.('connecting')
    if (!this.delayLive) {
      this.goLive()
    }
  }

  goLive() {
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
const failConnectIds = new Set<string>()
const delayLiveIds = new Set<string>()

vi.mock('./factory', () => ({
  createProvider: (id: string, handlers: ProviderHandlers) => {
    const fake = new FakeProvider(id, handlers)
    fake.failOnConnect = failConnectIds.has(id)
    fake.delayLive = delayLiveIds.has(id)
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
    failConnectIds.clear()
    delayLiveIds.clear()
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

  it('drives GameEngine from the requested primary, not Deepgram by default', async () => {
    const { BenchmarkSession } = await import('./benchmarkSession')
    const onFinal = vi.fn()
    const session = new BenchmarkSession({
      providers: 'deepgram,openai,elevenlabs',
      primaryId: 'openai',
      onFinal,
    })

    await session.start()
    expect(session.lockedPrimary()).toBe('openai')

    fakes.get('deepgram')?.emit('from-deepgram', true)
    fakes.get('openai')?.emit('from-openai', true)
    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('from-openai')
  })

  it('falls back to a live model when the requested primary fails', async () => {
    failConnectIds.add('openai')
    const { BenchmarkSession } = await import('./benchmarkSession')
    const onFinal = vi.fn()
    const onError = vi.fn()
    const session = new BenchmarkSession({
      providers: 'deepgram,openai',
      primaryId: 'openai',
      onFinal,
      onError,
    })

    await session.start()
    expect(session.lockedPrimary()).toBe('deepgram')
    expect(onError).not.toHaveBeenCalled()

    fakes.get('deepgram')?.emit('fallback', true)
    expect(onFinal).toHaveBeenCalledWith('fallback')
  })

  it('does not error while sockets are still opening after tokens return', async () => {
    delayLiveIds.add('deepgram')
    delayLiveIds.add('openai')
    const { BenchmarkSession } = await import('./benchmarkSession')
    const onError = vi.fn()
    const onState = vi.fn()
    const session = new BenchmarkSession({
      providers: 'deepgram,openai',
      primaryId: 'openai',
      onError,
      onStateChange: onState,
    })

    await session.start()
    expect(session.lockedPrimary()).toBeNull()
    expect(onError).not.toHaveBeenCalled()

    fakes.get('openai')?.goLive()
    expect(session.lockedPrimary()).toBe('openai')
    expect(onError).not.toHaveBeenCalled()
    expect(onState).toHaveBeenCalledWith('live')
    await session.close()
  })

  it('errors only after every adapter has actually failed', async () => {
    failConnectIds.add('deepgram')
    failConnectIds.add('openai')
    const { BenchmarkSession } = await import('./benchmarkSession')
    const onError = vi.fn()
    const session = new BenchmarkSession({
      providers: 'deepgram,openai',
      onError,
    })

    await session.start()
    expect(session.lockedPrimary()).toBeNull()
    expect(onError).toHaveBeenCalled()
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/No speech model connected/i)
    await session.close()
  })
})
