import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Leaderboard,
  ModelBoard,
  ProfileChip,
  RegisterModal,
  ResultsScreen,
  TestScreen,
} from './components'
import {
  GameEngine,
  buildSentenceStream,
  createWordState,
  pickLivePrimary,
  pickRoundJudge,
  pickTongueTwisterText,
  statsFromJudge,
  tokenizeWords,
} from './core'
import { SENTENCE_PROMPT_SET_ID } from './data/sentences'
import type { AccountFields } from './core/account'
import { pacedWordIndex, timedPromptWordCount } from './core/readingPace'
import { readSavedAccount, writeSavedAccount } from './data/accountStorage'
import { getAnonymousId } from './data/anonymousId'
import {
  fetchLeaderboard,
  markYou,
  modeLabel,
  type LeaderboardEntry,
} from './data/leaderboard'
import { submitRun, type SubmitRunInput } from './data/submitRun'
import { fetchProfile, type PublicProfile } from './data/profile'
import {
  isSpeechRecognitionSupported,
  parseEnabledProviders,
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
    ...createWordState(word, index === fallback.length - 1),
    status: index === 0 ? 'active' : 'pending',
  }))
}

function previewWords(
  mode: TestMode,
  customPhrase: string,
  durationSec = 30,
): WordState[] {
  if (mode === 'custom') return wordsFromPhrase(customPhrase)
  return buildSentenceStream(timedPromptWordCount(durationSec)).map(
    (token, index) => ({
      ...createWordState(token.word, token.sentenceEnd),
      status: index === 0 ? 'active' : 'pending',
    }),
  )
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
  const pendingRunRef = useRef<SubmitRunInput | null>(null)
  const persistedRef = useRef(false)
  const persistInFlightRef = useRef(false)

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
  const [paceIndex, setPaceIndex] = useState(0)
  const [attempts, setAttempts] = useState<PhraseAttempt[]>([])
  const [stats, setStats] = useState<RoundStats>(emptyStats)
  const [timeLeftSec, setTimeLeftSec] = useState(30)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [startError, setStartError] = useState<string | null>(null)
  const [supported] = useState(() => isSpeechRecognitionSupported())
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [board, setBoard] = useState<LeaderboardEntry[]>([])
  const [boardError, setBoardError] = useState<string | null>(null)
  const [lastRank, setLastRank] = useState<number | null>(null)
  const [heardLog, setHeardLog] = useState<string[]>([])
  const [modelResults, setModelResults] = useState<ModelResult[]>([])
  const [judgeName, setJudgeName] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSubmitting, setRegisterSubmitting] = useState(false)
  const [savedAccount, setSavedAccount] = useState<AccountFields | null>(() =>
    readSavedAccount(),
  )
  const [youName, setYouName] = useState<string | null>(
    () => readSavedAccount()?.username ?? null,
  )
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [livePrimaryId, setLivePrimaryId] = useState(() =>
    pickLivePrimary(parseEnabledProviders(), []),
  )
  const roundWallStartedRef = useRef(0)

  const activeDuration = resolveDuration(
    isCustomDuration,
    customDuration,
    durationSec,
  )

  const refreshProfile = useCallback(async (username?: string | null) => {
    const saved = username ?? readSavedAccount()?.username
    if (!saved) {
      setProfile(null)
      setProfileError(null)
      return
    }
    const result = await fetchProfile({
      username: saved,
      anonymousId: getAnonymousId(),
    })
    setProfile(result.profile)
    setProfileError(result.error)
  }, [])

  const refreshBoard = useCallback(async (username?: string | null) => {
    const you = username ?? youName ?? readSavedAccount()?.username
    const result = await fetchLeaderboard()
    setBoardError(result.error ?? null)
    setBoard(markYou(result.entries, you))
  }, [youName])

  const persistPendingRun = useCallback(
    async (account?: AccountFields): Promise<boolean> => {
      const pending = pendingRunRef.current
      if (!pending || persistedRef.current) return true
      if (persistInFlightRef.current) return false
      persistInFlightRef.current = true
      try {
        const saved = await submitRun({ ...pending, account })
        if ('error' in saved) {
          setSaveError(saved.error)
          setRegisterError(saved.error)
          return false
        }
        persistedRef.current = true
        setSaveError(null)
        setRegisterError(null)
        if (saved.rank != null) setLastRank(saved.rank)
        if (account) {
          writeSavedAccount(account)
          setSavedAccount(account)
          await refreshProfile(account.username)
        }
        if (saved.username) {
          setYouName(saved.username)
          await refreshBoard(saved.username)
          if (!account) await refreshProfile(saved.username)
        }
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not save this run'
        setSaveError(message)
        setRegisterError(message)
        return false
      } finally {
        persistInFlightRef.current = false
      }
    },
    [refreshBoard, refreshProfile],
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
    if (
      phaseRef.current === 'finished' &&
      !persistedRef.current &&
      pendingRunRef.current
    ) {
      void persistPendingRun()
    }
    clearTimers()
    abortRef.current()
    engineRef.current.reset()
    phaseRef.current = 'idle'
    setPhase('idle')
    setStartError(null)
    setLeaderboardOpen(false)
    setRegisterOpen(false)
    setRegisterError(null)
    setHeardLog([])
    setModelResults([])
    setJudgeName(null)
    setSaveError(null)
    setModelsOpen(false)
    setWords(previewWords(mode, customPhrase, activeDuration))
    setWordIndex(0)
    setPaceIndex(0)
    setAttempts([])
    setStats(emptyStats)
    setTimeLeftSec(activeDuration)
    setElapsedSec(0)
  }, [activeDuration, clearTimers, customPhrase, mode, persistPendingRun])

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
    const engineStats = engineRef.current.getStats()
    const judge = pickRoundJudge(harvested)
    const finalStats = judge ? statsFromJudge(engineStats, judge) : engineStats
    syncFromEngine()
    setStats(finalStats)
    setJudgeName(judge?.name ?? null)

    const elapsedForRank = Math.max(1, Math.round(finished.elapsedMs / 1000))
    const durationForRun = mode === 'time' ? activeDuration : elapsedForRank

    pendingRunRef.current =
      harvested.length > 0
        ? {
            startedAt: roundWallStartedRef.current || Date.now(),
            testType: mode === 'custom' ? 'stress' : 'standard',
            durationSec: durationForRun,
            referenceWords,
            promptSetId:
              mode === 'custom' ? 'tongue-twisters-v1' : SENTENCE_PROMPT_SET_ID,
            outcome: 'completed',
            stats: finalStats,
            models: harvested,
            judgeProvider: judge?.provider,
            modeLabel: modeLabel(mode, durationForRun),
          }
        : null
    persistedRef.current = false
    setRegisterError(null)
    setRegisterOpen(harvested.length > 0)

    phaseRef.current = 'finished'
    setPhase('finished')
  }, [activeDuration, clearTimers, mode, syncFromEngine])

  const prepareIdle = useCallback(
    (nextMode: TestMode, seconds: number, phrase: string) => {
      setWords(previewWords(nextMode, phrase, seconds))
      setWordIndex(0)
      setPaceIndex(0)
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
    primaryId: livePrimaryId,
  })

  useEffect(() => {
    abortRef.current = abort
  }, [abort])

  useEffect(() => {
    finishBenchmarkRef.current = finishBenchmark
  }, [finishBenchmark])

  useEffect(() => {
    if (phase !== 'idle') return
    let cancelled = false
    void fetch('/api/models/summary', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = (await response.json()) as {
          models?: Parameters<typeof pickLivePrimary>[1]
        }
        if (cancelled) return
        setLivePrimaryId(
          pickLivePrimary(parseEnabledProviders(), body.models ?? []),
        )
      })
      .catch(() => {
        if (cancelled) return
        setLivePrimaryId(pickLivePrimary(parseEnabledProviders(), []))
      })
    return () => {
      cancelled = true
    }
  }, [phase])

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
        setPaceIndex(
          pacedWordIndex(elapsed, engineRef.current.getState().words.length),
        )
        setStats(engineRef.current.getStats())
      }, 50)
    } else {
      tickTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        setElapsedSec(Math.floor(elapsed / 1000))
        setPaceIndex(
          pacedWordIndex(elapsed, engineRef.current.getState().words.length),
        )
        setStats(engineRef.current.getStats())
      }, 50)
    }
  }, [phase, connectionState, mode, activeDuration, finishRound])

  const startRound = useCallback(async () => {
    if (startingRef.current) return
    startingRef.current = true
    setStartError(null)
    setSpeechError(null)
    setLeaderboardOpen(false)
    setRegisterOpen(false)

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
      const promptWords = words.map((word) => ({
        word: word.expected,
        sentenceEnd: Boolean(word.sentenceEnd),
      }))

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
      setPaceIndex(0)
      setLastRank(null)
      setHeardLog([])
      setModelResults([])
      setJudgeName(null)
      setSaveError(null)
      pendingRunRef.current = null
      persistedRef.current = false
      roundWallStartedRef.current = Date.now()
      // Timer starts once the locked primary model is live so connection
      // lag does not burn into the round duration.
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

  const openLeaderboard = useCallback(() => {
    setLeaderboardOpen(true)
    void refreshBoard(youName)
  }, [refreshBoard, youName])

  const handleRegister = useCallback(
    async (account: AccountFields) => {
      setRegisterSubmitting(true)
      try {
        const ok = await persistPendingRun(account)
        if (ok) setRegisterOpen(false)
      } finally {
        setRegisterSubmitting(false)
      }
    },
    [persistPendingRun],
  )

  const handleSkipRegister = useCallback(async () => {
    setRegisterSubmitting(true)
    try {
      const ok = await persistPendingRun()
      if (ok) setRegisterOpen(false)
    } finally {
      setRegisterSubmitting(false)
    }
  }, [persistPendingRun])

  useEffect(() => {
    if (phase === 'idle') {
      prepareIdle(mode, activeDuration, customPhrase)
    }
  }, [activeDuration, customPhrase, mode, phase, prepareIdle])

  useEffect(() => {
    if (!savedAccount?.username) return
    void refreshProfile(savedAccount.username)
  }, [refreshProfile, savedAccount?.username])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typingInField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (registerOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (!registerSubmitting) void handleSkipRegister()
        }
        if (event.key === 'Tab' && !typingInField) {
          event.preventDefault()
        }
        return
      }

      if (event.key === 'Escape' && leaderboardOpen) {
        event.preventDefault()
        setLeaderboardOpen(false)
        return
      }

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
  }, [
    goHome,
    handleSkipRegister,
    leaderboardOpen,
    registerOpen,
    registerSubmitting,
    startRound,
  ])

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
            <button type="button" className="nav-btn" onClick={openLeaderboard}>
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
        {savedAccount && (
          <ProfileChip
            username={savedAccount.username}
            profile={profile}
            error={profileError}
          />
        )}
      </header>

      <main className="content">
        {phase === 'finished' ? (
          <ResultsScreen
            stats={stats}
            attempts={attempts}
            durationSec={mode === 'time' ? activeDuration : elapsedSec}
            mode={mode}
            rank={lastRank}
            judgeName={judgeName}
            modelResults={modelResults}
            saveError={saveError}
            onPlayAgain={goHome}
            onOpenLeaderboard={openLeaderboard}
            onOpenModels={() => setModelsOpen(true)}
          />
        ) : (
          <TestScreen
            words={words}
            wordIndex={wordIndex}
            paceIndex={paceIndex}
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
              setMode('time')
              setIsCustomDuration(false)
              setDurationSec(sec)
            }}
            onCustomDurationChange={(value) => {
              setMode('time')
              setIsCustomDuration(true)
              setCustomDuration(value)
            }}
            onSelectCustomDuration={() => {
              setMode('time')
              setIsCustomDuration(true)
            }}
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
        error={boardError}
        onClose={() => setLeaderboardOpen(false)}
      />
      <RegisterModal
        open={registerOpen}
        initial={savedAccount}
        error={registerError}
        submitting={registerSubmitting}
        onSubmit={(account) => void handleRegister(account)}
        onSkip={() => void handleSkipRegister()}
      />
      <ModelBoard open={modelsOpen} onClose={() => setModelsOpen(false)} />
    </div>
  )
}

export default App
