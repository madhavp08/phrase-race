import { useCallback, useEffect, useRef, useState } from 'react'
import { ResultsScreen, TestScreen } from './components'
import { GameEngine, buildWordList, createWordState } from './core'
import { isSpeechRecognitionSupported } from './speech/recognition'
import { useSpeechRecognition } from './speech/useSpeechRecognition'
import type { GamePhase, PhraseAttempt, RoundStats, WordState } from './types'
import './App.css'

const emptyStats: RoundStats = {
  rawWpm: 0,
  netWpm: 0,
  accuracy: 0,
  bestStreak: 0,
  averageResponseTimeMs: 0,
  correctChars: 0,
  incorrectChars: 0,
  correctWords: 0,
  incorrectWords: 0,
}

function previewWordList(): WordState[] {
  return buildWordList(220).map((word, index) => ({
    ...createWordState(word),
    status: index === 0 ? 'active' : 'pending',
  }))
}

function App() {
  const engineRef = useRef(new GameEngine())
  const roundTimerRef = useRef<number | null>(null)
  const tickTimerRef = useRef<number | null>(null)
  const tabArmedRef = useRef(false)

  const [phase, setPhase] = useState<GamePhase>('idle')
  const [durationSec, setDurationSec] = useState(60)
  const [words, setWords] = useState<WordState[]>(() => previewWordList())
  const [wordIndex, setWordIndex] = useState(0)
  const [attempts, setAttempts] = useState<PhraseAttempt[]>([])
  const [stats, setStats] = useState<RoundStats>(emptyStats)
  const [timeLeftSec, setTimeLeftSec] = useState(60)
  const [startError, setStartError] = useState<string | null>(null)
  const [supported] = useState(() => isSpeechRecognitionSupported())

  const syncFromEngine = useCallback(() => {
    const state = engineRef.current.getState()
    setWords(state.words)
    setWordIndex(state.wordIndex)
    setAttempts(state.attempts)
    setStats(engineRef.current.getStats())
  }, [])

  const clearTimers = useCallback(() => {
    if (roundTimerRef.current !== null) {
      window.clearTimeout(roundTimerRef.current)
      roundTimerRef.current = null
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current)
      tickTimerRef.current = null
    }
  }, [])

  const finishRound = useCallback(() => {
    clearTimers()
    engineRef.current.finishRound()
    syncFromEngine()
    setPhase('finished')
  }, [clearTimers, syncFromEngine])

  const prepareIdle = useCallback((seconds: number) => {
    setWords(previewWordList())
    setWordIndex(0)
    setAttempts([])
    setStats(emptyStats)
    setTimeLeftSec(seconds)
  }, [])

  const handleFinalTranscript = useCallback(
    (transcript: string) => {
      if (phase !== 'playing') return
      const state = engineRef.current.applySpeech(transcript, '')
      syncFromEngine()
      if (state.phase === 'finished') finishRound()
    },
    [finishRound, phase, syncFromEngine],
  )

  const handleInterimTranscript = useCallback(
    (transcript: string) => {
      if (phase !== 'playing') return
      engineRef.current.applySpeech('', transcript)
      syncFromEngine()
    },
    [phase, syncFromEngine],
  )

  const {
    listening,
    error: speechError,
    setError: setSpeechError,
    requestPermission,
    abort,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
    enabled: phase === 'playing',
  })

  const startRound = useCallback(async () => {
    setStartError(null)
    setSpeechError(null)

    const allowed = await requestPermission()
    if (!allowed) {
      setStartError('Microphone permission was denied.')
      return
    }

    clearTimers()
    abort()

    engineRef.current = new GameEngine()
    engineRef.current.startRound(durationSec * 1000)
    syncFromEngine()
    setPhase('playing')
    setTimeLeftSec(durationSec)

    const startedAt = performance.now()
    const durationMs = durationSec * 1000

    roundTimerRef.current = window.setTimeout(() => {
      finishRound()
    }, durationMs)

    tickTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      setTimeLeftSec(Math.max(0, Math.ceil((durationMs - elapsed) / 1000)))
      setStats(engineRef.current.getStats())
    }, 200)
  }, [
    abort,
    clearTimers,
    durationSec,
    finishRound,
    requestPermission,
    setSpeechError,
    syncFromEngine,
  ])

  const restart = useCallback(() => {
    clearTimers()
    abort()
    setPhase('idle')
    setStartError(null)
    setSpeechError(null)
    prepareIdle(durationSec)
  }, [abort, clearTimers, durationSec, prepareIdle, setSpeechError])

  useEffect(() => {
    if (phase === 'idle') {
      prepareIdle(durationSec)
    }
  }, [durationSec, phase, prepareIdle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        tabArmedRef.current = true
      }
      if (event.key === 'Enter' && tabArmedRef.current) {
        event.preventDefault()
        tabArmedRef.current = false
        restart()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Tab') tabArmedRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [restart])

  useEffect(() => {
    return () => {
      clearTimers()
      abort()
    }
  }, [abort, clearTimers])

  return (
    <div className="app">
      <header className={`top-header ${phase === 'playing' ? 'dimmed' : ''}`}>
        <div className="logo">
          <span className="logo-icon" aria-hidden="true">
            ◆
          </span>
          <span className="logo-text">phraserace</span>
        </div>
        <p className="logo-sub">speech</p>
      </header>

      <main className="content">
        {phase === 'finished' ? (
          <ResultsScreen
            stats={stats}
            attempts={attempts}
            durationSec={durationSec}
            onPlayAgain={restart}
          />
        ) : (
          <TestScreen
            words={words}
            wordIndex={wordIndex}
            durationSec={durationSec}
            timeLeftSec={timeLeftSec}
            wpm={stats.netWpm}
            accuracy={stats.accuracy}
            playing={phase === 'playing'}
            focused={phase === 'playing'}
            listening={listening}
            supported={supported}
            error={startError ?? speechError}
            onDurationChange={setDurationSec}
            onStart={startRound}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  )
}

export default App
