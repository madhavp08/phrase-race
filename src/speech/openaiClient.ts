import {
  MAX_RECONNECT_ATTEMPTS,
  OPENAI_INPUT_HZ,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from './constants'
import { FinalDeduper } from './finalDedup'
import { TARGET_SAMPLE_RATE } from './mic'
import { arrayBufferToBase64, resamplePcm16 } from './pcm'
import { fetchOpenAIRealtimeToken } from './token'
import type {
  ProviderHandlers,
  STTProvider,
  SpeechConnectionState,
} from './types'

export const OPENAI_TRANSCRIBE_MODEL = 'gpt-live-transcribe'
export const OPENAI_DELAY = 'low'

export function buildOpenAIRealtimeUrl(): string {
  return 'wss://api.openai.com/v1/realtime?intent=transcription'
}

/** Browser WS cannot set Authorization headers; ephemeral key goes in a subprotocol. */
export function buildOpenAIAuthProtocols(accessToken: string): string[] {
  return ['realtime', `openai-insecure-api-key.${accessToken}`]
}

export function buildOpenAISessionUpdate(): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: OPENAI_INPUT_HZ },
          transcription: {
            model: OPENAI_TRANSCRIBE_MODEL,
            languages: ['en'],
            delay: OPENAI_DELAY,
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 200,
            silence_duration_ms: 200,
          },
        },
      },
    },
  }
}

export class OpenAISpeechSession implements STTProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  readonly model = OPENAI_TRANSCRIBE_MODEL

  private handlers: ProviderHandlers
  private wantLive = false
  private state: SpeechConnectionState = 'idle'
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private sessionId = 0
  private opening = false
  private sessionReady = false
  private pending: ArrayBuffer[] = []
  private interim = ''
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
      delay: OPENAI_DELAY,
      canonicalHz: TARGET_SAMPLE_RATE,
      inputHz: OPENAI_INPUT_HZ,
      turnDetection: 'server_vad',
      silenceDurationMs: 200,
    }
  }

  async connect(): Promise<void> {
    this.wantLive = true
    this.reconnectAttempts = 0
    await this.openSession()
  }

  sendAudio(chunk: ArrayBuffer): void {
    const pcm24 = resamplePcm16(chunk, TARGET_SAMPLE_RATE, OPENAI_INPUT_HZ)
    if (!this.sessionReady || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pending.push(pcm24)
      if (this.pending.length > 80) this.pending.shift()
      return
    }
    this.sendPcm24(pcm24)
  }

  async close(): Promise<void> {
    this.wantLive = false
    this.opening = false
    this.clearReconnectTimer()
    this.teardownSession('idle')
  }

  private sendPcm24(pcm24: ArrayBuffer) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    try {
      this.socket.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: arrayBufferToBase64(pcm24),
        }),
      )
    } catch {
      // ignore
    }
  }

  private flushPending() {
    const queued = this.pending
    this.pending = []
    for (const pcm of queued) this.sendPcm24(pcm)
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
    this.sessionReady = false
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    this.teardownSocketOnly()

    try {
      const token = await fetchOpenAIRealtimeToken()
      if (!this.wantLive || id !== this.sessionId) return

      const socket = new WebSocket(
        buildOpenAIRealtimeUrl(),
        buildOpenAIAuthProtocols(token),
      )
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
        try {
          socket.send(JSON.stringify(buildOpenAISessionUpdate()))
        } catch {
          // ignore
        }
        this.reconnectAttempts = 0
        this.opening = false
        this.markReady()
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
        this.sessionReady = false
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
        error instanceof Error ? error.message : 'Failed to connect to OpenAI'
      this.handlers.onError?.(message)
      this.setState('errored')
      if (this.wantLive) this.scheduleReconnect()
    }
  }

  private markReady() {
    this.sessionReady = true
    this.flushPending()
    this.setState('live')
  }

  private handleMessage(data: unknown) {
    if (typeof data !== 'string') return
    try {
      const parsed = JSON.parse(data) as {
        type?: string
        delta?: string
        transcript?: string
        error?: { message?: string }
      }
      const type = parsed.type ?? ''

      if (type === 'session.updated' || type === 'session.created') {
        this.markReady()
        return
      }

      if (type === 'error') {
        this.handlers.onError?.(parsed.error?.message || 'OpenAI stream error')
        return
      }

      if (type === 'conversation.item.input_audio_transcription.delta') {
        const delta = parsed.delta ?? ''
        if (!delta) return
        this.interim += delta
        this.emit(this.interim, false)
        return
      }

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const text = (parsed.transcript || this.interim).trim()
        this.interim = ''
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
          ? `OpenAI connection lost (${closeCode ?? '?'}): ${reason}`
          : 'OpenAI connection lost.',
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
    this.interim = ''

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
    this.sessionReady = false
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
    this.pending = []
    this.interim = ''
    this.finals.reset()
    this.setState(next)
  }
}
