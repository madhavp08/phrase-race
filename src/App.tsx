import { useCallback, useEffect, useRef, useState } from 'react'
import { Leaderboard, ResultsScreen, TestScreen } from './components'
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

function wordsFromPhrase(phrase: string): WordState[] {
  const list = tokenizeWords(phrase)
  const fallback = list.length > 0 ? list : tokenizeWords(pickTongueTwisterText())
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

  const [phase, setPhase] = useState<GamePhase>('idle')
  const [mode, setMode] = useState<TestMode>('time')
  const [durationSec, setDurationSec] = useState(30)
  const [isCustomDuration, setIsCustomDuration] = useState(false)
  const [customDuration, setCustomDuration] = useState('90')
  const [customPhrase, setCustomPhrase] = useState(() => pickTongueTwisterText())
  const [words, setWords] = useState<WordState[]>(() =>
    previewWords('time', pickTongueTwisterText()),
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
  }, [activeDuration, clearTimers, mode, syncFromEngine])

  const prepareIdle = useCallback(
    (nextMode: TestMode, seconds: number, phrase: string) => {
      setWords(previewWords(nextMode, phrase))
      setWordIndex(0)
      setAttempts([])
      setStats(emptyStats)
      setTimeLeftSec(seconds)
      setElapsedSec(0)
      setLastRank(null)
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
      const customWords =
        mode === 'custom' ? tokenizeWords(customPhrase) : undefined

      engineRef.current = new GameEngine()
      engineRef.current.startRound(
        mode === 'time' ? seconds * 1000 : 0,
        mode,
        220,
        customWords,
      )
      syncFromEngine()
      phaseRef.current = 'playing'
      setPhase('playing')
      setTimeLeftSec(seconds)
      setElapsedSec(0)
      setLastRank(null)

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
    } finally {
      startingRef.current = false
    }
  }, [
    abort,
    activeDuration,
    clearTimers,
    customPhrase,
    finishRound,
    mode,
    requestPermission,
    setSpeechError,
    syncFromEngine,
  ])

  /** Instant loop: never dump back to a click-to-start gate. */
  const nextTest = useCallback(() => {
    void startRound()
  }, [startRound])

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

      if (event.key !== 'Tab') return
      // Don't steal tab from phrase input / custom time field.
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      void nextTest()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaderboardOpen, nextTest])

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
          <div className="logo">
            <span className="logo-mark" aria-hidden="true">
              <span className="logo-wave" />
              <span className="logo-wave" />
              <span className="logo-wave" />
            </span>
            <div className="logo-stack">
              <span className="logo-tag">speak see</span>
              <span className="logo-text">
                phrase<span className="logo-accent">race</span>
              </span>
            </div>
          </div>
          <nav className="header-nav" aria-label="Main">
            <button
              type="button"
              className="nav-ico"
              title="Leaderboard"
              onClick={() => {
                setBoard(getLeaderboard())
                setLeaderboardOpen(true)
              }}
            >
              ♛
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
            onPlayAgain={nextTest}
            onOpenLeaderboard={() => {
              setBoard(getLeaderboard())
              setLeaderboardOpen(true)
            }}
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
            focused={phase === 'playing'}
            listening={listening}
            supported={supported}
            error={startError ?? speechError}
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
            onStart={nextTest}
            onRestart={nextTest}
          />
        )}
      </main>

      <Leaderboard
        open={leaderboardOpen}
        board={board}
        highlightRank={lastRank}
        onClose={() => setLeaderboardOpen(false)}
      />
    </div>
  )
}

export default App
