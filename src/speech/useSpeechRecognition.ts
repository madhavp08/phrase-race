import { useCallback, useEffect, useRef, useState } from 'react'
import { parseEnabledProviders } from './constants'
import { BenchmarkSession } from './benchmarkSession'
import { isMicrophoneSupported, requestMicrophonePermission } from './mic'
import type { FinishBenchmarkInput } from './benchmarkSession'
import type { ModelResult, SpeechConnectionState } from './types'

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void
  onLiveHypothesis?: (hypothesis: string) => void
  enabled: boolean
}

/**
 * React facade over the multi-model benchmark session.
 * Gameplay still consumes only the primary (Deepgram) live/final stream.
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
  const [enabledProviders, setEnabledProviders] = useState<string[]>(() =>
    parseEnabledProviders(),
  )
  const [liveProviders, setLiveProviders] = useState<string[]>([])

  const sessionRef = useRef<BenchmarkSession | null>(null)
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
    void sessionRef.current?.close()
    sessionRef.current = null
    setListening(false)
    setLiveHypothesis('')
    setConnectionState('idle')
    setLiveProviders([])
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      setError('Microphone access is not supported in this browser.')
      return
    }

    if (sessionRef.current) {
      void sessionRef.current.close()
      sessionRef.current = null
    }

    setError(null)
    setLiveHypothesis('')

    const session = new BenchmarkSession({
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
        setLiveProviders(session.liveIds())
      },
    })

    sessionRef.current = session
    setEnabledProviders(parseEnabledProviders())
    void session.start().then(() => {
      setEnabledProviders(session.enabledIds())
      setLiveProviders(session.liveIds())
    })
  }, [supported])

  const finishBenchmark = useCallback((input: FinishBenchmarkInput): ModelResult[] => {
    const session = sessionRef.current
    if (!session) return []
    const results = session.finish(input)
    sessionRef.current = null
    return results
  }, [])

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
    enabledProviders,
    liveProviders,
    start,
    abort,
    requestPermission,
    finishBenchmark,
  }
}

export { isMicrophoneSupported as isSpeechRecognitionSupported }
export { requestMicrophonePermission }
