import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
} from './recognition'

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
  const [supported] = useState(() => isSpeechRecognitionSupported())

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  const onLiveRef = useRef(onLiveHypothesis)
  const wantListenRef = useRef(false)
  const enabledRef = useRef(enabled)
  const restartTimerRef = useRef<number | null>(null)

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
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
    } catch {
      // ignore
    }
    recognitionRef.current = null
  }, [clearRestartTimer])

  const bindAndStart = useCallback(() => {
    const recognition = createSpeechRecognition({
      onLive: (hypothesis) => {
        setLiveHypothesis(hypothesis)
        onLiveRef.current?.(hypothesis)
      },
      onFinal: (transcript) => {
        onFinalRef.current(transcript)
      },
      onError: (message) => {
        setError(message)
        setListening(false)
      },
      onEnd: () => {
        setListening(false)
        if (!wantListenRef.current || !enabledRef.current) return
        clearRestartTimer()
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantListenRef.current || !enabledRef.current) return
          try {
            recognitionRef.current = null
            bindAndStart()
          } catch {
            // retry on next cycle
          }
        }, 50)
      },
    })

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [clearRestartTimer])

  const abort = useCallback(() => {
    wantListenRef.current = false
    tearDown()
    setListening(false)
    setLiveHypothesis('')
  }, [tearDown])

  const start = useCallback(() => {
    if (!supported) {
      setError('Web Speech API is not supported. Please use Chrome.')
      return
    }

    setError(null)
    setLiveHypothesis('')
    tearDown()
    wantListenRef.current = true

    try {
      bindAndStart()
    } catch {
      clearRestartTimer()
      restartTimerRef.current = window.setTimeout(() => {
        if (!wantListenRef.current || !enabledRef.current) return
        try {
          bindAndStart()
        } catch {
          // give up
        }
      }, 80)
    }
  }, [bindAndStart, clearRestartTimer, supported, tearDown])

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
