export type LetterStatus = 'untyped' | 'correct' | 'incorrect' | 'extra'

export interface LetterState {
  char: string
  status: LetterStatus
}

export type WordStatus = 'pending' | 'active' | 'typed' | 'error'

export interface WordState {
  expected: string
  typed: string
  letters: LetterState[]
  status: WordStatus
}

/** Completed word attempt — used for end-of-round review. */
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
  /** Monkeytype-style net WPM: (correctChars / 5) / minutes */
  netWpm: number
  /** Raw WPM: (all typed chars / 5) / minutes */
  rawWpm: number
  accuracy: number
  bestStreak: number
  averageResponseTimeMs: number
  correctChars: number
  incorrectChars: number
  correctWords: number
  incorrectWords: number
}

export type GamePhase = 'idle' | 'playing' | 'finished'

export interface GameState {
  phase: GamePhase
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
