import { useCallback, useEffect, useRef, useState } from 'react'
import { DeepgramSpeechSession } from './deepgramClient'
import { isMicrophoneSupported, requestMicrophonePermission } from './mic'
import type { SpeechConnectionState } from './types'

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void
  onLiveHypothesis?: (hypothesis: string) => void
  enabled: boolean
}

/**
 * React facade over Deepgram Nova-3 streaming.
 * Keeps the same consumer API the game already uses.
 */
export function useSpeechRecognition({
  onFinalTranscript,
  onLiveHypothesis,
  enabled,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false)
  const [liveHypothesis, setLiveHypothesis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] =
    useState<SpeechConnectionState>('idle')
  const [supported] = useState(() => isMicrophoneSupported())

  const sessionRef = useRef<DeepgramSpeechSession | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  const onLiveRef = useRef(onLiveHypothesis)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    onFinalRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    onLiveRef.current = onLiveHypothesis
  }, [onLiveHypothesis])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const abort = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
    setLiveHypothesis('')
    setConnectionState('idle')
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      setError('Microphone access is not supported in this browser.')
      return
    }

    // Prevent duplicate sessions from StrictMode / rapid toggles.
    if (sessionRef.current) {
      sessionRef.current.stop()
      sessionRef.current = null
    }

    setError(null)
    setLiveHypothesis('')

    const session = new DeepgramSpeechSession({
      onLive: (hypothesis) => {
        if (!enabledRef.current) return
        setLiveHypothesis(hypothesis)
        onLiveRef.current?.(hypothesis)
      },
      onFinal: (transcript) => {
        if (!enabledRef.current) return
        onFinalRef.current(transcript)
      },
      onError: (message) => {
        setError(message)
      },
      onStateChange: (state) => {
        setConnectionState(state)
        setListening(
          state === 'live' ||
            state === 'connecting' ||
            state === 'reconnecting',
        )
      },
    })

    sessionRef.current = session
    void session.start()
  }, [supported])

  const requestPermission = useCallback(async () => {
    try {
      await requestMicrophonePermission()
      setError(null)
      return true
    } catch {
      setError('Microphone permission was denied.')
      return false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      abort()
      return
    }
    start()
    return () => {
      abort()
    }
  }, [enabled, start, abort])

  return {
    supported,
    listening,
    liveHypothesis,
    error,
    setError,
    connectionState,
    start,
    abort,
    requestPermission,
  }
}

export { isMicrophoneSupported as isSpeechRecognitionSupported }
export { requestMicrophonePermission }
