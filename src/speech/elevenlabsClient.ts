import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from './constants'
import { FinalDeduper } from './finalDedup'
import { TARGET_SAMPLE_RATE } from './mic'
import { arrayBufferToBase64 } from './pcm'
import { fetchElevenLabsToken } from './token'
import type {
  ProviderHandlers,
  STTProvider,
  SpeechConnectionState,
} from './types'

export const ELEVENLABS_MODEL = 'scribe_v2_realtime'
export const ELEVENLABS_COMMIT_STRATEGY = 'vad'

export function buildElevenLabsRealtimeUrl(token: string): string {
  const params = new URLSearchParams({
    model_id: ELEVENLABS_MODEL,
    token,
    commit_strategy: ELEVENLABS_COMMIT_STRATEGY,
    audio_format: 'pcm_16000',
  })
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`
}

export class ElevenLabsSpeechSession implements STTProvider {
  readonly id = 'elevenlabs'
  readonly name = 'ElevenLabs Scribe'
  readonly model = ELEVENLABS_MODEL

  private handlers: ProviderHandlers
  private wantLive = false
  private state: SpeechConnectionState = 'idle'
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private sessionId = 0
  private opening = false
  private finals = new FinalDeduper()

  constructor(handlers: ProviderHandlers) {
    this.handlers = handlers
  }

  getState() {
    return this.state
  }

  getConfig(): Record<string, unknown> {
    return {
      provider: this.id,
      model: this.model,
      commitStrategy: ELEVENLABS_COMMIT_STRATEGY,
      sampleRate: TARGET_SAMPLE_RATE,
      audioFormat: 'pcm_16000',
    }
  }

  async connect(): Promise<void> {
    this.wantLive = true
    this.reconnectAttempts = 0
    await this.openSession()
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.wantLive || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      this.socket.send(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: arrayBufferToBase64(chunk),
          commit: false,
          sample_rate: TARGET_SAMPLE_RATE,
        }),
      )
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    this.wantLive = false
    this.opening = false
    this.clearReconnectTimer()
    this.teardownSession('idle')
  }

  private setState(state: SpeechConnectionState) {
    if (this.state === state) return
    this.state = state
    this.handlers.onStateChange?.(state)
  }

  private emit(text: string, isFinal: boolean) {
    this.handlers.onEvent({
      provider: this.id,
      model: this.model,
      text,
      isFinal,
      receivedAt: performance.now(),
    })
  }

  private async openSession() {
    if (!this.wantLive || this.opening) return
    this.opening = true
    const id = ++this.sessionId
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    this.teardownSocketOnly()

    try {
      const token = await fetchElevenLabsToken()
      if (!this.wantLive || id !== this.sessionId) return

      const socket = new WebSocket(buildElevenLabsRealtimeUrl(token))
      this.socket = socket

      socket.onopen = () => {
        if (!this.wantLive || id !== this.sessionId) {
          try {
            socket.close()
          } catch {
            // ignore
          }
          return
        }
        this.reconnectAttempts = 0
        this.opening = false
        this.setState('live')
      }

      socket.onmessage = (event) => {
        if (id !== this.sessionId) return
        this.handleMessage(event.data)
      }

      socket.onerror = () => {
        // onclose
      }

      socket.onclose = (event) => {
        if (id !== this.sessionId) return
        this.opening = false
        if (!this.wantLive) {
          this.setState('idle')
          return
        }
        this.scheduleReconnect(event.code, event.reason)
      }
    } catch (error) {
      this.opening = false
      if (!this.wantLive || id !== this.sessionId) return
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to connect to ElevenLabs'
      this.handlers.onError?.(message)
      this.setState('errored')
      if (this.wantLive) this.scheduleReconnect()
    }
  }

  private handleMessage(data: unknown) {
    if (typeof data !== 'string') return
    try {
      const parsed = JSON.parse(data) as {
        message_type?: string
        type?: string
        text?: string
        transcript?: string
        error?: string
      }
      const type = parsed.message_type || parsed.type || ''
      const text = (parsed.text || parsed.transcript || '').trim()

      if (type === 'session_started' || type === 'session.started') {
        this.setState('live')
        return
      }

      if (type === 'error' || type === 'auth_error') {
        this.handlers.onError?.(parsed.error || 'ElevenLabs stream error')
        return
      }

      if (
        type === 'partial_transcript' ||
        type === 'partial_transcript_with_timestamps'
      ) {
        this.emit(text, false)
        return
      }

      if (
        type === 'committed_transcript' ||
        type === 'committed_transcript_with_timestamps'
      ) {
        if (this.finals.accept(text)) this.emit(text, true)
        else this.emit('', false)
      }
    } catch {
      // ignore
    }
  }

  private scheduleReconnect(closeCode?: number, reason?: string) {
    if (!this.wantLive) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.handlers.onError?.(
        reason
          ? `ElevenLabs connection lost (${closeCode ?? '?'}): ${reason}`
          : 'ElevenLabs connection lost.',
      )
      this.wantLive = false
      this.teardownSession('errored')
      return
    }

    this.clearReconnectTimer()
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
    )
    this.reconnectAttempts += 1
    this.setState('reconnecting')
    this.teardownSocketOnly()
    this.finals.reset()

    this.reconnectTimer = window.setTimeout(() => {
      void this.openSession()
    }, delay)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private teardownSocketOnly() {
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      try {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close(1000, 'client_stop')
        }
      } catch {
        // ignore
      }
    }
  }

  private teardownSession(next: SpeechConnectionState) {
    this.clearReconnectTimer()
    this.teardownSocketOnly()
    this.finals.reset()
    this.setState(next)
  }
}
