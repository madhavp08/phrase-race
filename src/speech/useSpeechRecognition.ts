import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isDeepgramSpeechSupported,
  requestMicrophonePermission,
  startDeepgramRecognition,
  type DeepgramSession,
} from './deepgramRecognition'

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void
  onLiveHypothesis?: (hypothesis: string) => void
  enabled: boolean
}

export function useSpeechRecognition({
  onFinalTranscript,
  onLiveHypothesis,
  enabled,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false)
  const [liveHypothesis, setLiveHypothesis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported] = useState(() => isDeepgramSpeechSupported())

  const sessionRef = useRef<DeepgramSession | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  const onLiveRef = useRef(onLiveHypothesis)
  const wantListenRef = useRef(false)
  const enabledRef = useRef(enabled)
  const startGenerationRef = useRef(0)
  const restartTimerRef = useRef<number | null>(null)
  const failureCountRef = useRef(0)

  useEffect(() => {
    onFinalRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    onLiveRef.current = onLiveHypothesis
  }, [onLiveHypothesis])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const tearDown = useCallback(() => {
    clearRestartTimer()
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
    setLiveHypothesis('')
  }, [clearRestartTimer])

  const abort = useCallback(() => {
    wantListenRef.current = false
    startGenerationRef.current += 1
    tearDown()
  }, [tearDown])

  const bindAndStart = useCallback(() => {
    const generation = ++startGenerationRef.current

    void (async () => {
      try {
        const session = await startDeepgramRecognition({
          onLive: (hypothesis) => {
            if (
              !wantListenRef.current ||
              generation !== startGenerationRef.current
            ) {
              return
            }
            setLiveHypothesis(hypothesis)
            onLiveRef.current?.(hypothesis)
          },
          onFinal: (transcript) => {
            if (
              !wantListenRef.current ||
              generation !== startGenerationRef.current
            ) {
              return
            }
            onFinalRef.current(transcript)
          },
          onError: (message) => {
            if (generation !== startGenerationRef.current) return
            setError(message)
            setListening(false)
            sessionRef.current = null
          },
          onEnd: () => {
            if (generation !== startGenerationRef.current) return
            setListening(false)
            sessionRef.current = null
            if (!wantListenRef.current || !enabledRef.current) return
            failureCountRef.current += 1
            if (failureCountRef.current >= 4) {
              setError(
                'Deepgram keeps dropping the connection. Check the browser console for the close code/reason.',
              )
              return
            }
            clearRestartTimer()
            restartTimerRef.current = window.setTimeout(() => {
              if (!wantListenRef.current || !enabledRef.current) return
              bindAndStart()
            }, 80)
          },
          onListeningChange: (isListening) => {
            if (generation !== startGenerationRef.current) return
            setListening(isListening)
            if (isListening) failureCountRef.current = 0
          },
        })

        if (
          !wantListenRef.current ||
          generation !== startGenerationRef.current ||
          !enabledRef.current
        ) {
          session.stop()
          return
        }

        sessionRef.current = session
      } catch (err) {
        if (generation !== startGenerationRef.current) return
        const message =
          err instanceof Error
            ? err.message
            : 'Could not start Deepgram speech recognition.'
        setError(message)
        setListening(false)
      }
    })()
  }, [clearRestartTimer])

  const start = useCallback(() => {
    if (!supported) {
      setError(
        'Live speech requires a browser with microphone and MediaRecorder support.',
      )
      return
    }

    setError(null)
    setLiveHypothesis('')
    tearDown()
    wantListenRef.current = true
    failureCountRef.current = 0
    bindAndStart()
  }, [bindAndStart, supported, tearDown])

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
    start,
    abort,
    requestPermission,
  }
}
