import {
  TARGET_SAMPLE_RATE,
  createMicCapture,
  type MicCapture,
} from './mic'
import { fetchDeepgramToken } from './token'
import { TranscriptAssembler } from './transcriptAssembler'
import type { SpeechConnectionState, SpeechHandlers } from './types'

const KEEP_ALIVE_MS = 3_000
const RECONNECT_BASE_MS = 350
const RECONNECT_MAX_MS = 3_000
const MAX_RECONNECT_ATTEMPTS = 8

/**
 * Deepgram live listen params for short English phrases / word racing.
 *
 * Uses linear16 @ 16kHz (explicit encoding) — more reliable than WebM chunks.
 * smart_format handles punctuation; do not also set punctuate=true.
 */
export function buildDeepgramListenUrl(): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: String(TARGET_SAMPLE_RATE),
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    // Snappier finals for short spoken words.
    endpointing: '100',
    // Emit UtteranceEnd so we can flush trailing interim text.
    utterance_end_ms: '1000',
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

export class DeepgramSpeechSession {
  private handlers: SpeechHandlers
  private wantLive = false
  private state: SpeechConnectionState = 'idle'
  private socket: WebSocket | null = null
  private mic: MicCapture | null = null
  private assembler: TranscriptAssembler | null = null
  private keepAliveTimer: number | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private sessionId = 0
  private opening = false

  constructor(handlers: SpeechHandlers) {
    this.handlers = handlers
  }

  getState() {
    return this.state
  }

  async start() {
    this.wantLive = true
    this.reconnectAttempts = 0
    await this.openSession()
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

  private async openSession() {
    if (!this.wantLive || this.opening) return
    this.opening = true

    const id = ++this.sessionId
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    this.teardownSocketAndMicOnly()

    try {
      // Pre-warm mic BEFORE the socket so we can send audio immediately on open
      // (Deepgram closes connections that stay silent ~10s).
      const [token, mic] = await Promise.all([
        fetchDeepgramToken(),
        createMicCapture(),
      ])

      if (!this.wantLive || id !== this.sessionId) {
        mic.stop()
        return
      }

      this.mic = mic
      this.assembler = new TranscriptAssembler({
        onLive: (hypothesis) => this.handlers.onLive?.(hypothesis),
        onFinal: (transcript) => this.handlers.onFinal?.(transcript),
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

        // Send audio in the same turn as open — no await gap.
        this.mic?.start((chunk) => {
          if (
            !this.wantLive ||
            id !== this.sessionId ||
            !this.socket ||
            this.socket.readyState !== WebSocket.OPEN
          ) {
            return
          }
          try {
            this.socket.send(chunk)
          } catch {
            // ignore send failures; reconnect path handles close
          }
        })

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

        // 1000 = normal close after CloseStream
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

      // Surface Deepgram error payloads instead of silently ignoring.
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
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** attempt,
    )
    this.reconnectAttempts += 1
    this.setState('reconnecting')

    // Fresh session — never reuse a broken socket (Deepgram guidance).
    this.teardownSocketAndMicOnly()
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

  private teardownSocketAndMicOnly() {
    this.clearKeepAlive()

    if (this.mic) {
      this.mic.stop()
      this.mic = null
    }

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
    this.teardownSocketAndMicOnly()
    this.assembler?.reset()
    this.assembler = null
    this.setState(next)
  }
}
