export type LetterStatus = 'untyped' | 'correct' | 'incorrect' | 'extra'

export interface LetterState {
  char: string
  status: LetterStatus
}

/** preview = live soft match from interim speech (not yet finalized). */
export type WordStatus = 'pending' | 'active' | 'preview' | 'typed' | 'error'

export interface WordState {
  expected: string
  typed: string
  letters: LetterState[]
  status: WordStatus
}

export interface PhraseAttempt {
  prompt: string
  transcript: string
  normalizedPrompt: string
  normalizedTranscript: string
  correct: boolean
  responseTimeMs: number
  wordCount: number
}

export interface RoundStats {
  /** Net WPM — (correctChars / 5) / minutes (Monkeytype wpm) */
  netWpm: number
  /** Raw WPM — (typedChars / 5) / minutes (Monkeytype raw) */
  rawWpm: number
  /** correct / (correct + incorrect + extra + missed) * 100 */
  accuracy: number
  bestStreak: number
  averageResponseTimeMs: number
  correctChars: number
  incorrectChars: number
  extraChars: number
  missedChars: number
  correctWords: number
  incorrectWords: number
}

export type GamePhase = 'idle' | 'playing' | 'finished'

/** time = timed word stream; custom = editable tongue twister / phrase. */
export type TestMode = 'time' | 'custom'

export interface GameState {
  phase: GamePhase
  mode: TestMode
  words: WordState[]
  wordIndex: number
  attempts: PhraseAttempt[]
  startedAt: number | null
  elapsedMs: number
  durationMs: number
  currentStreak: number
  bestStreak: number
  correctChars: number
  incorrectChars: number
}
