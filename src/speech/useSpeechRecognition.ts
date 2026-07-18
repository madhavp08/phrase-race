import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
} from './recognition'

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void
  onInterimTranscript?: (transcript: string) => void
  enabled: boolean
}

export function useSpeechRecognition({
  onFinalTranscript,
  onInterimTranscript,
  enabled,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported] = useState(() => isSpeechRecognitionSupported())

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  const onInterimRef = useRef(onInterimTranscript)
  const restartRef = useRef(false)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    onFinalRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    onInterimRef.current = onInterimTranscript
  }, [onInterimTranscript])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const abort = useCallback(() => {
    restartRef.current = false
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.abort()
    } catch {
      // Already aborted.
    }
    setListening(false)
    setInterimTranscript('')
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      setError('Web Speech API is not supported. Please use Chrome.')
      return
    }

    setError(null)
    setInterimTranscript('')
    restartRef.current = true

    if (!recognitionRef.current) {
      recognitionRef.current = createSpeechRecognition({
        onInterim: (transcript) => {
          setInterimTranscript(transcript)
          onInterimRef.current?.(transcript)
        },
        onFinal: (transcript) => {
          setInterimTranscript('')
          onFinalRef.current(transcript)
        },
        onError: (message) => {
          setError(message)
          setListening(false)
        },
        onEnd: () => {
          setListening(false)
          if (restartRef.current && enabledRef.current && recognitionRef.current) {
            window.setTimeout(() => {
              if (!restartRef.current || !enabledRef.current) return
              try {
                recognitionRef.current?.start()
                setListening(true)
              } catch {
                // start() can throw if already started.
              }
            }, 80)
          }
        },
      })
    }

    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      // Ignore InvalidStateError when already started.
    }
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

  useEffect(() => {
    return () => {
      abort()
      recognitionRef.current = null
    }
  }, [abort])

  return {
    supported,
    listening,
    interimTranscript,
    error,
    setError,
    start,
    abort,
    requestPermission,
  }
}
