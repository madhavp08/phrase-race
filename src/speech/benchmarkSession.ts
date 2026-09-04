import { fanOutAudio, ShadowEvaluator } from '../core/shadowEval'
import {
  CONNECT_WATCHDOG_MS,
  parseEnabledProviders,
  type ProviderId,
} from './constants'
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
  /** Live caret / GameEngine stream. Falls back to the first enabled id. */
  primaryId?: string
}

/**
 * Owns the single 16 kHz capture, fans identical PCM to every adapter,
 * drives GameEngine from one locked live stream, and scores every model
 * in a shadow evaluator.
 */
export class BenchmarkSession {
  private handlers: SpeechHandlers
  private providerFilter?: string
  private optionPrimaryId?: string
  private requestedPrimaryId = ''
  private lockedPrimaryId: string | null = null
  private requestedFailed = false
  private wantLive = false
  private capture: MicCapture | null = null
  private streaming = false
  private providers: STTProvider[] = []
  private evaluators = new Map<string, ShadowEvaluator>()
  private lastChunkAt = 0
  private samplesSent = 0
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null
  private connectErrors: string[] = []

  constructor(options: BenchmarkSessionOptions) {
    this.handlers = options
    this.providerFilter = options.providers
    this.optionPrimaryId = options.primaryId
  }

  getPrimaryState(): SpeechConnectionState {
    if (this.lockedPrimaryId) {
      return (
        this.providers.find((provider) => provider.id === this.lockedPrimaryId)
          ?.getState() ?? 'idle'
      )
    }
    return this.wantLive ? 'connecting' : 'idle'
  }

  lockedPrimary(): string | null {
    return this.lockedPrimaryId
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
    this.lockedPrimaryId = null
    this.requestedFailed = false
    this.providers = []
    this.evaluators.clear()
    this.connectErrors = []
    this.clearConnectWatchdog()

    const ids = parseEnabledProviders(this.providerFilter)
    this.requestedPrimaryId =
      this.optionPrimaryId && ids.includes(this.optionPrimaryId as ProviderId)
        ? this.optionPrimaryId
        : (ids[0] ?? '')

    for (const id of ids) {
      const provider = createProvider(id, {
        onEvent: (event) => {
          this.evaluators.get(id)?.consume(event)
          if (id !== this.lockedPrimaryId) return
          if (event.isFinal) this.handlers.onFinal?.(event.text)
          else this.handlers.onLive?.(event.text)
        },
        onError: (message) => {
          this.evaluators.get(id)?.fail(message)
          this.noteConnectError(id, message)
          if (id === this.requestedPrimaryId) this.requestedFailed = true
          if (this.lockedPrimaryId === id) this.handlers.onError?.(message)
          else this.maybeLockPrimary()
        },
        onStateChange: (state) => {
          if (state === 'live') this.evaluators.get(id)?.setLive()
          if (!this.lockedPrimaryId) this.maybeLockPrimary()
          if (this.lockedPrimaryId === id) {
            this.handlers.onStateChange?.(state)
            if (state === 'live') this.startFanout()
          } else if (!this.lockedPrimaryId && id === this.requestedPrimaryId) {
            this.handlers.onStateChange?.(state)
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
          this.noteConnectError(provider.id, message)
          if (provider.id === this.requestedPrimaryId) {
            this.requestedFailed = true
          }
          if (this.lockedPrimaryId === provider.id) {
            this.handlers.onError?.(message)
          }
        }
      }),
    )

    this.maybeLockPrimary()
    if (!this.lockedPrimaryId && this.wantLive) {
      if (this.anyStillConnecting()) {
        this.scheduleConnectWatchdog()
      } else {
        this.failNoModel()
      }
    }
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
    this.clearConnectWatchdog()
    this.capture?.stop()
    this.capture = null
    await Promise.all(this.providers.map((provider) => provider.close()))
  }

  private maybeLockPrimary() {
    if (this.lockedPrimaryId || !this.wantLive) return

    const requested = this.providers.find(
      (provider) => provider.id === this.requestedPrimaryId,
    )
    if (requested?.getState() === 'live') {
      this.lockPrimary(requested.id)
      return
    }

    const waitingOnRequested =
      !this.requestedFailed &&
      requested &&
      (requested.getState() === 'connecting' ||
        requested.getState() === 'idle' ||
        requested.getState() === 'reconnecting')
    if (waitingOnRequested) return

    const live = this.providers.find((provider) => provider.getState() === 'live')
    if (live) this.lockPrimary(live.id)
  }

  private lockPrimary(id: string) {
    this.lockedPrimaryId = id
    this.clearConnectWatchdog()
    this.startFanout()
    this.handlers.onStateChange?.('live')
  }

  private anyStillConnecting(): boolean {
    return this.providers.some((provider) => {
      const state = provider.getState()
      return state === 'connecting' || state === 'reconnecting'
    })
  }

  private scheduleConnectWatchdog() {
    this.clearConnectWatchdog()
    this.connectWatchdog = setTimeout(() => {
      this.connectWatchdog = null
      if (this.lockedPrimaryId || !this.wantLive) return
      this.maybeLockPrimary()
      if (!this.lockedPrimaryId && this.wantLive) this.failNoModel()
    }, CONNECT_WATCHDOG_MS)
  }

  private clearConnectWatchdog() {
    if (this.connectWatchdog == null) return
    clearTimeout(this.connectWatchdog)
    this.connectWatchdog = null
  }

  private noteConnectError(id: string, message: string) {
    const line = `${id}: ${message}`
    if (!this.connectErrors.includes(line)) this.connectErrors.push(line)
  }

  private failNoModel() {
    this.clearConnectWatchdog()
    const detail = this.connectErrors[0]
    this.handlers.onError?.(
      detail
        ? `No speech model connected. ${detail}`
        : 'No speech model connected. Tokens may still be opening a socket — try again, and confirm the STT API keys on Vercel.',
    )
    this.handlers.onStateChange?.('errored')
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