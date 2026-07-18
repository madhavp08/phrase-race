import { useCallback, useEffect, useRef, useState } from 'react'
import { ResultsScreen, TestScreen } from './components'
import {
  GameEngine,
  buildWordList,
  createWordState,
  pickTongueTwister,
} from './core'
import { isSpeechRecognitionSupported } from './speech/recognition'
import { useSpeechRecognition } from './speech/useSpeechRecognition'
import type {
  GamePhase,
  PhraseAttempt,
  RoundStats,
  TestMode,
  WordState,
} from './types'
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

function previewWords(mode: TestMode): WordState[] {
  const list = mode === 'phrase' ? pickTongueTwister() : buildWordList(220)
  return list.map((word, index) => ({
    ...createWordState(word),
    status: index === 0 ? 'active' : 'pending',
  }))
}

function resolveDuration(isCustom: boolean, custom: string, preset: number): number {
  if (!isCustom) return preset
  const parsed = Number.parseInt(custom, 10)
  if (!Number.isFinite(parsed)) return 60
  return Math.min(600, Math.max(5, parsed))
}

function App() {
  const engineRef = useRef(new GameEngine())
  const roundTimerRef = useRef<number | null>(null)
  const tickTimerRef = useRef<number | null>(null)
  const tabArmedRef = useRef(false)
  const phaseRef = useRef<GamePhase>('idle')

  const [phase, setPhase] = useState<GamePhase>('idle')
  const [mode, setMode] = useState<TestMode>('time')
  const [durationSec, setDurationSec] = useState(60)
  const [isCustomDuration, setIsCustomDuration] = useState(false)
  const [customDuration, setCustomDuration] = useState('90')
  const [words, setWords] = useState<WordState[]>(() => previewWords('time'))
  const [wordIndex, setWordIndex] = useState(0)
  const [attempts, setAttempts] = useState<PhraseAttempt[]>([])
  const [stats, setStats] = useState<RoundStats>(emptyStats)
  const [timeLeftSec, setTimeLeftSec] = useState(60)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [startError, setStartError] = useState<string | null>(null)
  const [supported] = useState(() => isSpeechRecognitionSupported())

  const activeDuration = resolveDuration(
    isCustomDuration,
    customDuration,
    durationSec,
  )

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
    phaseRef.current = 'finished'
    setPhase('finished')
  }, [clearTimers, syncFromEngine])

  const prepareIdle = useCallback(
    (nextMode: TestMode, seconds: number) => {
      setWords(previewWords(nextMode))
      setWordIndex(0)
      setAttempts([])
      setStats(emptyStats)
      setTimeLeftSec(seconds)
      setElapsedSec(0)
    },
    [],
  )

  // Use refs so speech callbacks never go stale mid-utterance.
  const handleLiveHypothesis = useCallback(
    (hypothesis: string) => {
      if (phaseRef.current !== 'playing') return
      const state = engineRef.current.applyLive(hypothesis)
      syncFromEngine()
      if (state.phase === 'finished') finishRound()
    },
    [finishRound, syncFromEngine],
  )

  const handleFinalTranscript = useCallback(
    (transcript: string) => {
      if (phaseRef.current !== 'playing') return
      const state = engineRef.current.applyFinal(transcript)
      syncFromEngine()
      if (state.phase === 'finished') finishRound()
    },
    [finishRound, syncFromEngine],
  )

  const {
    listening,
    error: speechError,
    setError: setSpeechError,
    requestPermission,
    abort,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    onLiveHypothesis: handleLiveHypothesis,
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

    const seconds = activeDuration
    engineRef.current = new GameEngine()
    engineRef.current.startRound(
      mode === 'time' ? seconds * 1000 : 0,
      mode,
    )
    syncFromEngine()
    phaseRef.current = 'playing'
    setPhase('playing')
    setTimeLeftSec(seconds)
    setElapsedSec(0)

    const startedAt = performance.now()

    if (mode === 'time') {
      const durationMs = seconds * 1000
      roundTimerRef.current = window.setTimeout(() => {
        finishRound()
      }, durationMs)

      tickTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        setTimeLeftSec(Math.max(0, Math.ceil((durationMs - elapsed) / 1000)))
        setElapsedSec(Math.floor(elapsed / 1000))
        setStats(engineRef.current.getStats())
      }, 100)
    } else {
      tickTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        setElapsedSec(Math.floor(elapsed / 1000))
        setStats(engineRef.current.getStats())
      }, 100)
    }
  }, [
    abort,
    activeDuration,
    clearTimers,
    finishRound,
    mode,
    requestPermission,
    setSpeechError,
    syncFromEngine,
  ])

  const restart = useCallback(() => {
    clearTimers()
    abort()
    phaseRef.current = 'idle'
    setPhase('idle')
    setStartError(null)
    setSpeechError(null)
    prepareIdle(mode, activeDuration)
  }, [
    abort,
    activeDuration,
    clearTimers,
    mode,
    prepareIdle,
    setSpeechError,
  ])

  useEffect(() => {
    if (phase === 'idle') {
      prepareIdle(mode, activeDuration)
    }
  }, [activeDuration, mode, phase, prepareIdle])

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
          <span className="logo-mark" aria-hidden="true">
            <span className="logo-wave" />
            <span className="logo-wave" />
            <span className="logo-wave" />
          </span>
          <span className="logo-text">
            phrase<span className="logo-accent">race</span>
          </span>
        </div>
        <p className="logo-sub">speak the stream</p>
      </header>

      <main className="content">
        {phase === 'finished' ? (
          <ResultsScreen
            stats={stats}
            attempts={attempts}
            durationSec={mode === 'time' ? activeDuration : elapsedSec}
            mode={mode}
            onPlayAgain={restart}
          />
        ) : (
          <TestScreen
            words={words}
            wordIndex={wordIndex}
            mode={mode}
            durationSec={durationSec}
            customDuration={customDuration}
            isCustomDuration={isCustomDuration}
            timeLeftSec={timeLeftSec}
            elapsedSec={elapsedSec}
            wpm={stats.netWpm}
            accuracy={stats.accuracy}
            playing={phase === 'playing'}
            focused={phase === 'playing'}
            listening={listening}
            supported={supported}
            error={startError ?? speechError}
            onModeChange={setMode}
            onDurationChange={(sec) => {
              setIsCustomDuration(false)
              setDurationSec(sec)
            }}
            onCustomDurationChange={setCustomDuration}
            onSelectCustom={() => setIsCustomDuration(true)}
            onStart={startRound}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  )
}

export default App
