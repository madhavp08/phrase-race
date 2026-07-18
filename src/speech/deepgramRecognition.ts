import { fetchDeepgramToken } from './deepgramToken'

export interface DeepgramRecognitionHandlers {
  onLive?: (hypothesis: string) => void
  onFinal: (transcript: string) => void
  onError?: (message: string) => void
  /** Fired when the socket ends unexpectedly so the hook can reconnect. */
  onEnd?: () => void
  onListeningChange?: (listening: boolean) => void
}

export interface DeepgramSession {
  stop: () => void
}

const KEEP_ALIVE_MS = 8_000
const RECORDER_TIMESLICE_MS = 100

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

export function isDeepgramSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebSocket !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    !!pickMimeType()
  )
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
  return true
}

function buildListenUrl(): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en',
    interim_results: 'true',
    punctuate: 'false',
    smart_format: 'false',
    endpointing: '100',
  })
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`
}

interface DeepgramResultsMessage {
  type?: string
  is_final?: boolean
  channel?: {
    alternatives?: Array<{ transcript?: string }>
  }
}

/**
 * Opens a Deepgram Listen WebSocket, streams mic audio, and maps
 * interim/final transcripts onto the same handlers the game already uses.
 */
export async function startDeepgramRecognition(
  handlers: DeepgramRecognitionHandlers,
): Promise<DeepgramSession> {
  if (!isDeepgramSpeechSupported()) {
    throw new Error(
      'Live speech requires a browser with microphone + MediaRecorder support.',
    )
  }

  const mimeType = pickMimeType()
  if (!mimeType) {
    throw new Error('No supported audio format for MediaRecorder.')
  }

  const accessToken = await fetchDeepgramToken()
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  })

  let socket: WebSocket | null = null
  let mediaRecorder: MediaRecorder | null = null
  let keepAliveTimer: number | null = null
  let stopped = false

  const cleanup = () => {
    if (keepAliveTimer !== null) {
      window.clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
      } catch {
        // ignore
      }
    }
    mediaRecorder = null

    stream.getTracks().forEach((track) => track.stop())

    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'CloseStream' }))
          socket.close()
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      } catch {
        // ignore
      }
      socket = null
    }

    handlers.onListeningChange?.(false)
  }

  const fail = (message: string) => {
    if (stopped) return
    stopped = true
    cleanup()
    handlers.onError?.(message)
  }

  const endUnexpectedly = () => {
    if (stopped) return
    stopped = true
    cleanup()
    handlers.onEnd?.()
  }

  try {
    socket = new WebSocket(buildListenUrl(), ['token', accessToken])
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('Could not open Deepgram WebSocket.')
  }

  socket.binaryType = 'arraybuffer'

  socket.onopen = () => {
    if (stopped || !socket) return

    keepAliveTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'KeepAlive' }))
      }
    }, KEEP_ALIVE_MS)

    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType })
    } catch {
      fail('Could not start microphone recording.')
      return
    }

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (
        event.data.size > 0 &&
        socket?.readyState === WebSocket.OPEN &&
        !stopped
      ) {
        socket.send(event.data)
      }
    })

    mediaRecorder.start(RECORDER_TIMESLICE_MS)
    handlers.onListeningChange?.(true)
  }

  socket.onmessage = (event) => {
    if (stopped || typeof event.data !== 'string') return

    let message: DeepgramResultsMessage
    try {
      message = JSON.parse(event.data) as DeepgramResultsMessage
    } catch {
      return
    }

    if (message.type && message.type !== 'Results') return

    const transcript = message.channel?.alternatives?.[0]?.transcript?.trim()
    if (!transcript) return

    if (message.is_final) {
      handlers.onLive?.('')
      handlers.onFinal(transcript)
    } else {
      handlers.onLive?.(transcript)
    }
  }

  socket.onerror = (event) => {
    console.error('[deepgram] socket error', event, 'readyState:', socket?.readyState)
    // Prefer onclose for reconnect; only surface a hard error if auth fails early.
    if (socket?.readyState === WebSocket.CONNECTING) {
      fail('Deepgram connection error. Check your network and API key.')
    }
  }

  socket.onclose = (event) => {
    console.error(
      '[deepgram] socket closed — code:', event.code,
      'reason:', event.reason || '(none)',
      'wasClean:', event.wasClean,
    )
    if (stopped) return
    // Auth / policy failures — do not spin reconnect forever.
    if (event.code === 1008 || event.code === 4001 || event.code === 4003) {
      fail(
        event.reason ||
          `Deepgram rejected the connection (code ${event.code}). Check your API key.`,
      )
      return
    }
    if (event.code === 1000) {
      stopped = true
      cleanup()
      return
    }
    endUnexpectedly()
  }

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      cleanup()
    },
  }
}
