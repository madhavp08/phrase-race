import { fanOutAudio, ShadowEvaluator } from '../core/shadowEval'
import { parseEnabledProviders, PRIMARY_PROVIDER_ID } from './constants'
import { createProvider } from './factory'
import { createMicCapture, type MicCapture } from './mic'
import type {
  ModelResult,
  SpeechConnectionState,
  SpeechHandlers,
  STTProvider,
} from './types'

export interface FinishBenchmarkInput {
  referenceWords: string[]
  elapsedMs: number
}

export interface BenchmarkSessionOptions extends SpeechHandlers {
  providers?: string
}

/**
 * Owns the single 16 kHz capture, fans identical PCM to every adapter,
 * drives GameEngine from the Deepgram (primary) stream only, and scores
 * every model in a shadow evaluator.
 */
export class BenchmarkSession {
  private handlers: SpeechHandlers
  private providerFilter?: string
  private wantLive = false
  private capture: MicCapture | null = null
  private streaming = false
  private providers: STTProvider[] = []
  private evaluators = new Map<string, ShadowEvaluator>()
  private lastChunkAt = 0
  private samplesSent = 0

  constructor(options: BenchmarkSessionOptions) {
    this.handlers = options
    this.providerFilter = options.providers
  }

  getPrimaryState(): SpeechConnectionState {
    return (
      this.providers.find((provider) => provider.id === PRIMARY_PROVIDER_ID)
        ?.getState() ?? 'idle'
    )
  }

  enabledIds(): string[] {
    return this.providers.map((provider) => provider.id)
  }

  liveIds(): string[] {
    return this.providers
      .filter((provider) => provider.getState() === 'live')
      .map((provider) => provider.id)
  }

  async start(): Promise<void> {
    this.wantLive = true
    this.streaming = false
    this.samplesSent = 0
    this.providers = []
    this.evaluators.clear()

    const ids = parseEnabledProviders(this.providerFilter)
    for (const id of ids) {
      const provider = createProvider(id, {
        onEvent: (event) => {
          this.evaluators.get(id)?.consume(event)
          if (id !== PRIMARY_PROVIDER_ID) return
          if (event.isFinal) this.handlers.onFinal?.(event.text)
          else this.handlers.onLive?.(event.text)
        },
        onError: (message) => {
          this.evaluators.get(id)?.fail(message)
          if (id === PRIMARY_PROVIDER_ID) this.handlers.onError?.(message)
        },
        onStateChange: (state) => {
          if (state === 'live') this.evaluators.get(id)?.setLive()
          if (id === PRIMARY_PROVIDER_ID) {
            this.handlers.onStateChange?.(state)
            if (state === 'live') this.startFanout()
          }
        },
      })

      this.evaluators.set(
        id,
        new ShadowEvaluator({
          provider: provider.id,
          model: provider.model,
          name: provider.name,
          config: provider.getConfig(),
        }),
      )
      this.providers.push(provider)
    }

    this.capture = await createMicCapture()
    if (!this.wantLive) {
      this.capture.stop()
      this.capture = null
      return
    }

    await Promise.all(
      this.providers.map(async (provider) => {
        try {
          await provider.connect()
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `${provider.id} failed`
          this.evaluators.get(provider.id)?.fail(message)
          if (provider.id === PRIMARY_PROVIDER_ID) {
            this.handlers.onError?.(message)
          }
        }
      }),
    )
  }

  finish(input: FinishBenchmarkInput): ModelResult[] {
    const results = this.providers.map((provider) => {
      const evaluator = this.evaluators.get(provider.id)
      if (!evaluator) {
        return {
          provider: provider.id,
          model: provider.model,
          name: provider.name,
          transcript: '',
          characterAccuracy: 0,
          cer: 0,
          wer: 0,
          modelNetWpm: 0,
          medianWordLatencyMs: 0,
          p95WordLatencyMs: 0,
          wordResults: [],
          status: 'provider_failure' as const,
          config: provider.getConfig(),
        }
      }
      return evaluator.finalize(input.referenceWords, input.elapsedMs)
    })
    void this.close()
    return results
  }

  async close(): Promise<void> {
    this.wantLive = false
    this.streaming = false
    this.capture?.stop()
    this.capture = null
    await Promise.all(this.providers.map((provider) => provider.close()))
  }

  private startFanout() {
    if (this.streaming || !this.capture || !this.wantLive) return
    this.streaming = true
    this.capture.start((pcm) => {
      if (!this.wantLive) return
      this.lastChunkAt = performance.now()
      this.samplesSent += Math.floor(pcm.byteLength / 2)
      for (const evaluator of this.evaluators.values()) {
        evaluator.setAudioClock(this.lastChunkAt)
      }
      fanOutAudio(pcm, this.providers)
    })
  }
}
