import { TARGET_SAMPLE_RATE } from './mic'
import { fetchDeepgramToken } from './token'
import { TranscriptAssembler } from './transcriptAssembler'
import {
  KEEP_ALIVE_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from './constants'
import type {
  ProviderHandlers,
  STTProvider,
  SpeechConnectionState,
} from './types'

export const DEEPGRAM_MODEL = 'nova-3'
export const DEEPGRAM_ENDPOINTING_MS = 100
export const DEEPGRAM_UTTERANCE_END_MS = 1000

/**
 * Deepgram live listen params for short English phrases / word racing.
 *
 * Uses linear16 @ 16kHz (explicit encoding) — more reliable than WebM chunks.
 * smart_format handles punctuation; do not also set punctuate=true.
 */
export function buildDeepgramListenUrl(): string {
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: String(TARGET_SAMPLE_RATE),
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: String(DEEPGRAM_ENDPOINTING_MS),
    utterance_end_ms: String(DEEPGRAM_UTTERANCE_END_MS),
    filler_words: 'false',
    numerals: 'false',
  })

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`
}

/**
 * Browser-safe WS auth via Sec-WebSocket-Protocol.
 * Must be TWO tokens — a single "Bearer <jwt>" string is invalid (spaces
 * are not allowed in subprotocol names).
 *
 * Deepgram: temporary JWTs use ["bearer", jwt]; API keys use ["token", key].
 */
export function buildAuthProtocols(accessToken: string): string[] {
  return ['bearer', accessToken]
}

export class DeepgramSpeechSession implements STTProvider {
  readonly id = 'deepgram'
  readonly name = 'Deepgram Nova-3'
  readonly model = DEEPGRAM_MODEL

  private handlers: ProviderHandlers
  private wantLive = false
  private state: SpeechConnectionState = 'idle'
  private socket: WebSocket | null = null
  private assembler: TranscriptAssembler | null = null
  private keepAliveTimer: number | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private sessionId = 0
  private opening = false

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
      encoding: 'linear16',
      sampleRate: TARGET_SAMPLE_RATE,
      language: 'en-US',
      endpointingMs: DEEPGRAM_ENDPOINTING_MS,
      utteranceEndMs: DEEPGRAM_UTTERANCE_END_MS,
      interimResults: true,
    }
  }

  async connect(): Promise<void> {
    this.wantLive = true
    this.reconnectAttempts = 0
    await this.openSession()
  }

  /** @deprecated use connect() — kept so existing call sites stay obvious */
  async start() {
    await this.connect()
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.wantLive || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      this.socket.send(chunk)
    } catch {
      // reconnect path handles close
    }
  }

  async close(): Promise<void> {
    this.stop()
  }

  stop() {
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
      const token = await fetchDeepgramToken()

      if (!this.wantLive || id !== this.sessionId) {
        return
      }

      this.assembler = new TranscriptAssembler({
        onLive: (hypothesis) => this.emit(hypothesis, false),
        onFinal: (transcript) => this.emit(transcript, true),
      })

      const url = buildDeepgramListenUrl()
      const socket = new WebSocket(url, buildAuthProtocols(token))
      socket.binaryType = 'arraybuffer'
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

        this.startKeepAlive()
        this.reconnectAttempts = 0
        this.opening = false
        this.setState('live')
      }

      socket.onmessage = (event) => {
        if (id !== this.sessionId) return
        this.handleSocketMessage(event.data)
      }

      socket.onerror = () => {
        // Surfaces via onclose
      }

      socket.onclose = (event) => {
        if (id !== this.sessionId) return
        this.clearKeepAlive()
        this.opening = false

        if (!this.wantLive) {
          this.setState('idle')
          return
        }

        if (event.code === 1000 && !this.wantLive) {
          this.setState('idle')
          return
        }

        this.scheduleReconnect(event.code, event.reason)
      }
    } catch (error) {
      this.opening = false
      if (!this.wantLive || id !== this.sessionId) return
      const message =
        error instanceof Error ? error.message : 'Failed to connect to Deepgram'
      this.handlers.onError?.(message)
      this.setState('errored')
      if (this.wantLive) this.scheduleReconnect()
    }
  }

  private handleSocketMessage(data: unknown) {
    if (typeof data !== 'string') return
    try {
      const parsed: unknown = JSON.parse(data)

      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        (parsed as { type: string }).type === 'Error'
      ) {
        const err = parsed as { message?: string; description?: string }
        this.handlers.onError?.(
          err.message || err.description || 'Deepgram stream error',
        )
        return
      }

      this.assembler?.handleMessage(parsed)
    } catch {
      // ignore malformed frames
    }
  }

  private startKeepAlive() {
    this.clearKeepAlive()
    this.keepAliveTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
      try {
        this.socket.send(JSON.stringify({ type: 'KeepAlive' }))
      } catch {
        // ignore
      }
    }, KEEP_ALIVE_MS)
  }

  private clearKeepAlive() {
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private scheduleReconnect(closeCode?: number, reason?: string) {
    if (!this.wantLive) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.handlers.onError?.(
        reason
          ? `Speech connection lost (${closeCode ?? '?'}): ${reason}`
          : 'Speech connection lost. Press tab to return home and try again.',
      )
      this.wantLive = false
      this.teardownSession('errored')
      return
    }

    this.clearReconnectTimer()
    const attempt = this.reconnectAttempts
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt)
    this.reconnectAttempts += 1
    this.setState('reconnecting')

    this.teardownSocketOnly()
    this.assembler?.reset()

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
    this.clearKeepAlive()

    if (this.socket) {
      const socket = this.socket
      this.socket = null
      try {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'CloseStream' }))
          } catch {
            // ignore
          }
        }
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
    this.assembler?.reset()
    this.assembler = null
    this.setState(next)
  }
}
