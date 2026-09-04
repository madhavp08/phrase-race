import { useCallback, useEffect, useRef, useState } from 'react'
import { Leaderboard, ModelBoard, ResultsScreen, TestScreen } from './components'
import {
  GameEngine,
  buildWordList,
  createWordState,
  pickTongueTwisterText,
  tokenizeWords,
} from './core'
import {
  getLeaderboard,
  tryRankScore,
  type LeaderboardEntry,
} from './data/leaderboard'
import { submitRun } from './data/submitRun'
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from './speech'
import type { ModelResult } from './speech'
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
  consistency: 0,
  fastestWordMs: 0,
  slowestWordMs: 0,
  correctChars: 0,
  incorrectChars: 0,
  extraChars: 0,
  missedChars: 0,
  correctWords: 0,
  incorrectWords: 0,
}

function wordsFromPhrase(phrase: string): WordState[] {
  const list = tokenizeWords(phrase)
  const fallback =
    list.length > 0 ? list : tokenizeWords(pickTongueTwisterText())
  return fallback.map((word, index) => ({
    ...createWordState(word),
    status: index === 0 ? 'active' : 'pending',
  }))
}

function previewWords(mode: TestMode, customPhrase: string): WordState[] {
  if (mode === 'custom') return wordsFromPhrase(customPhrase)
  return buildWordList(220).map((word, index) => ({
    ...createWordState(word),
    status: index === 0 ? 'active' : 'pending',
  }))
}

function resolveDuration(
  isCustom: boolean,
  custom: string,
  preset: number,
): number {
  if (!isCustom) return preset
  const parsed = Number.parseInt(custom, 10)
  if (!Number.isFinite(parsed)) return 60
  return Math.min(600, Math.max(5, parsed))
}

function App() {
  const engineRef = useRef(new GameEngine())
  const roundTimerRef = useRef<number | null>(null)
  const tickTimerRef = useRef<number | null>(null)
  const phaseRef = useRef<GamePhase>('idle')
  const startingRef = useRef(false)
  const micReadyRef = useRef(false)
  const abortRef = useRef<() => void>(() => {})
  const timerStartedRef = useRef(false)
  const finishBenchmarkRef = useRef<
    (input: { referenceWords: string[]; elapsedMs: number }) => ModelResult[]
  >(() => [])

  const [phase, setPhase] = useState<GamePhase>('idle')
  const [mode, setMode] = useState<TestMode>('time')
  const [durationSec, setDurationSec] = useState(30)
  const [isCustomDuration, setIsCustomDuration] = useState(false)
  const [customDuration, setCustomDuration] = useState('90')
  const [customPhrase, setCustomPhrase] = useState(() =>
    pickTongueTwisterText(),
  )
  const [words, setWords] = useState<WordState[]>(() =>
    previewWords('time', ''),
  )
  const [wordIndex, setWordIndex] = useState(0)
  const [attempts, setAttempts] = useState<PhraseAttempt[]>([])
  const [stats, setStats] = useState<RoundStats>(emptyStats)
  const [timeLeftSec, setTimeLeftSec] = useState(30)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [startError, setStartError] = useState<string | null>(null)
  const [supported] = useState(() => isSpeechRecognitionSupported())
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [board, setBoard] = useState<LeaderboardEntry[]>(() => getLeaderboard())
  const [lastRank, setLastRank] = useState<number | null>(null)
  const [heardLog, setHeardLog] = useState<string[]>([])
  const [modelResults, setModelResults] = useState<ModelResult[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
  const roundWallStartedRef = useRef(0)

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
    timerStartedRef.current = false
  }, [])

  const goHome = useCallback(() => {
    clearTimers()
    abortRef.current()
    engineRef.current.reset()
    phaseRef.current = 'idle'
    setPhase('idle')
    setStartError(null)
    setLeaderboardOpen(false)
    setHeardLog([])
    setModelResults([])
    setSaveError(null)
    setModelsOpen(false)
    setWords(previewWords(mode, customPhrase))
    setWordIndex(0)
    setAttempts([])
    setStats(emptyStats)
    setTimeLeftSec(activeDuration)
    setElapsedSec(0)
  }, [activeDuration, clearTimers, customPhrase, mode])

  const finishRound = useCallback(() => {
    const playing = engineRef.current.getState()
    const referenceWords = playing.words.map((word) => word.expected)
    const elapsedMs =
      mode === 'time' && activeDuration > 0
        ? activeDuration * 1000
        : playing.startedAt
          ? performance.now() - playing.startedAt
          : 0
    const harvested = finishBenchmarkRef.current({
      referenceWords,
      elapsedMs,
    })
    setModelResults(harvested)

    clearTimers()
    const finished = engineRef.current.finishRound()
    const finalStats = engineRef.current.getStats()
    syncFromEngine()
    setStats(finalStats)

    const elapsedForRank = Math.max(1, Math.round(finished.elapsedMs / 1000))
    const result = tryRankScore(
      finalStats.netWpm,
      finalStats.accuracy,
      mode,
      mode === 'time' ? activeDuration : elapsedForRank,
    )
    setBoard(result.board)
    setLastRank(result.rank)

    phaseRef.current = 'finished'
    setPhase('finished')

    if (harvested.length > 0) {
      void submitRun({
        startedAt: roundWallStartedRef.current || Date.now(),
        testType: mode === 'custom' ? 'stress' : 'standard',
        durationSec: mode === 'time' ? activeDuration : elapsedForRank,
        referenceWords,
        promptSetId:
          mode === 'custom' ? 'tongue-twisters-v1' : 'english-400-stream-220',
        outcome: 'completed',
        stats: finalStats,
        models: harvested,
      }).then((saved) => {
        if ('error' in saved) setSaveError(saved.error)
        else setSaveError(null)
      })
    }
  }, [activeDuration, clearTimers, mode, syncFromEngine])

  const prepareIdle = useCallback(
    (nextMode: TestMode, seconds: number, phrase: string) => {
      setWords(previewWords(nextMode, phrase))
      setWordIndex(0)
      setAttempts([])
      setStats(emptyStats)
      setTimeLeftSec(seconds)
      setElapsedSec(0)
    },
    [],
  )

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
      setHeardLog((log) => [...log, transcript])
      const state = engineRef.current.applyFinal(transcript)
      syncFromEngine()
      if (state.phase === 'finished') finishRound()
    },
    [finishRound, syncFromEngine],
  )

  const {
    liveHypothesis,
    error: speechError,
    setError: setSpeechError,
    connectionState,
    requestPermission,
    abort,
    finishBenchmark,
    enabledProviders,
    liveProviders,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    onLiveHypothesis: handleLiveHypothesis,
    enabled: phase === 'playing',
  })

  useEffect(() => {
    abortRef.current = abort
  }, [abort])

  useEffect(() => {
    finishBenchmarkRef.current = finishBenchmark
  }, [finishBenchmark])

  useEffect(() => {
    if (
      phase !== 'playing' ||
      connectionState !== 'live' ||
      timerStartedRef.current
    ) {
      return
    }
    timerStartedRef.current = true

    const startedAt = performance.now()

    if (mode === 'time') {
      const durationMs = activeDuration * 1000
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
  }, [phase, connectionState, mode, activeDuration, finishRound])

  const startRound = useCallback(async () => {
    if (startingRef.current) return
    startingRef.current = true
    setStartError(null)
    setSpeechError(null)
    setLeaderboardOpen(false)

    try {
      if (!micReadyRef.current) {
        const allowed = await requestPermission()
        if (!allowed) {
          setStartError('Microphone permission was denied.')
          return
        }
        micReadyRef.current = true
      }

      clearTimers()
      abort()

      const seconds = activeDuration
      // Start with exactly the prompts already visible on screen. Generating
      // another shuffled list here makes the test change when Tab is pressed.
      const promptWords = words.map((word) => word.expected)

      engineRef.current = new GameEngine()
      engineRef.current.startRound(
        mode === 'time' ? seconds * 1000 : 0,
        mode,
        promptWords.length,
        promptWords,
      )
      syncFromEngine()
      phaseRef.current = 'playing'
      setPhase('playing')
      setTimeLeftSec(seconds)
      setElapsedSec(0)
      setLastRank(null)
      setHeardLog([])
      setModelResults([])
      setSaveError(null)
      roundWallStartedRef.current = Date.now()
      // Timer itself starts once Deepgram is actually live — see the
      // `connectionState` effect below — so connection lag doesn't burn
      // into the round duration.
    } finally {
      startingRef.current = false
    }
  }, [
    abort,
    activeDuration,
    clearTimers,
    mode,
    requestPermission,
    setSpeechError,
    syncFromEngine,
    words,
  ])

  const shufflePhrase = useCallback(() => {
    const next = pickTongueTwisterText()
    setCustomPhrase(next)
    if (phase === 'idle') {
      prepareIdle('custom', activeDuration, next)
    }
  }, [activeDuration, phase, prepareIdle])

  useEffect(() => {
    if (phase === 'idle') {
      prepareIdle(mode, activeDuration, customPhrase)
    }
  }, [activeDuration, customPhrase, mode, phase, prepareIdle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && leaderboardOpen) {
        event.preventDefault()
        setLeaderboardOpen(false)
        return
      }

      const target = event.target as HTMLElement | null
      const typingInField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (event.key === 'Tab') {
        if (typingInField) return
        event.preventDefault()
        // Idle → start; playing/results → home (Monkeytype-style loop).
        if (phaseRef.current === 'idle') {
          void startRound()
        } else {
          goHome()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goHome, leaderboardOpen, startRound])

  useEffect(() => {
    return () => {
      clearTimers()
      abort()
    }
  }, [abort, clearTimers])

  return (
    <div className="app">
      <header className={`top-header ${phase === 'playing' ? 'dimmed' : ''}`}>
        <div className="header-left">
          <button
            type="button"
            className="logo"
            onClick={goHome}
            title="Home"
          >
            <span className="logo-text">
              phrase<span className="logo-accent">race</span>
            </span>
          </button>
          <nav className="header-nav" aria-label="Main">
            <button type="button" className="nav-btn" onClick={goHome}>
              home
            </button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                setBoard(getLeaderboard())
                setLeaderboardOpen(true)
              }}
            >
              board
            </button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => setModelsOpen(true)}
            >
              models
            </button>
          </nav>
        </div>
      </header>

      <main className="content">
        {phase === 'finished' ? (
          <ResultsScreen
            stats={stats}
            attempts={attempts}
            durationSec={mode === 'time' ? activeDuration : elapsedSec}
            mode={mode}
            rank={lastRank}
            modelResults={modelResults}
            saveError={saveError}
            onPlayAgain={goHome}
            onOpenLeaderboard={() => {
              setBoard(getLeaderboard())
              setLeaderboardOpen(true)
            }}
            onOpenModels={() => setModelsOpen(true)}
          />
        ) : (
          <TestScreen
            words={words}
            wordIndex={wordIndex}
            mode={mode}
            durationSec={durationSec}
            customDuration={customDuration}
            isCustomDuration={isCustomDuration}
            customPhrase={customPhrase}
            timeLeftSec={timeLeftSec}
            elapsedSec={elapsedSec}
            wpm={stats.netWpm}
            accuracy={stats.accuracy}
            playing={phase === 'playing'}
            connectionState={connectionState}
            supported={supported}
            error={startError ?? speechError}
            heardLog={heardLog}
            liveHypothesis={liveHypothesis}
            liveProviderCount={liveProviders.length}
            enabledProviderCount={enabledProviders.length}
            onModeChange={(next) => {
              setMode(next)
              if (next === 'custom' && !customPhrase.trim()) {
                setCustomPhrase(pickTongueTwisterText())
              }
            }}
            onDurationChange={(sec) => {
              setIsCustomDuration(false)
              setDurationSec(sec)
            }}
            onCustomDurationChange={setCustomDuration}
            onSelectCustomDuration={() => setIsCustomDuration(true)}
            onCustomPhraseChange={setCustomPhrase}
            onShufflePhrase={shufflePhrase}
            onStart={() => void startRound()}
            onGoHome={goHome}
          />
        )}
      </main>

      <Leaderboard
        open={leaderboardOpen}
        board={board}
        highlightRank={lastRank}
        onClose={() => setLeaderboardOpen(false)}
      />
      <ModelBoard open={modelsOpen} onClose={() => setModelsOpen(false)} />
    </div>
  )
}

export default App
