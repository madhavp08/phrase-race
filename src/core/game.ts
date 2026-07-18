import { PROMPTS } from '../data/prompts'
import type { GameState, PhraseAttempt, RoundStats, WordState } from '../types'
import {
  commitWord,
  createWordState,
  previewWord,
} from './align'
import { tokenizeWords } from './normalize'
import {
  calculateBestStreak,
  calculateStatsFromWords,
  createAttempt,
} from './scoring'

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function buildWordList(count = 220): string[] {
  const pool = shuffle(PROMPTS).flatMap((prompt) => tokenizeWords(prompt))
  if (pool.length === 0) return []

  const words: string[] = []
  while (words.length < count) {
    words.push(...shuffle(pool))
  }
  return words.slice(0, count)
}

function createIdleState(durationMs = 60_000): GameState {
  return {
    phase: 'idle',
    words: [],
    wordIndex: 0,
    attempts: [],
    startedAt: null,
    elapsedMs: 0,
    durationMs,
    currentStreak: 0,
    bestStreak: 0,
    correctChars: 0,
    incorrectChars: 0,
  }
}

function withActiveWord(words: WordState[], wordIndex: number): WordState[] {
  return words.map((word, index) => {
    if (index === wordIndex && (word.status === 'pending' || word.status === 'active')) {
      return { ...word, status: 'active' }
    }
    if (word.status === 'active' && index !== wordIndex) {
      return { ...word, status: 'pending', typed: '', letters: createWordState(word.expected).letters }
    }
    return word
  })
}

export class GameEngine {
  private state: GameState = createIdleState()
  private wordStartedAt = 0

  startRound(durationMs = 60_000, wordCount = 220): GameState {
    const list = buildWordList(wordCount)
    const words = list.map((word) => createWordState(word))
    if (words[0]) words[0] = { ...words[0], status: 'active' }

    this.state = {
      phase: 'playing',
      words,
      wordIndex: 0,
      attempts: [],
      startedAt: performance.now(),
      elapsedMs: 0,
      durationMs,
      currentStreak: 0,
      bestStreak: 0,
      correctChars: 0,
      incorrectChars: 0,
    }
    this.wordStartedAt = performance.now()
    return this.getState()
  }

  /**
   * Apply speech: finalize complete words, preview the current partial word.
   * Speaks continuously — no per-phrase submit gate.
   */
  applySpeech(finalChunk: string, interim = ''): GameState {
    if (this.state.phase !== 'playing') return this.getState()

    const finalWords = tokenizeWords(finalChunk)
    let { words, wordIndex, attempts, currentStreak, bestStreak } = this.state

    for (const spoken of finalWords) {
      if (wordIndex >= words.length) break

      const expected = words[wordIndex].expected
      const committed = commitWord(expected, spoken)
      const responseTimeMs = performance.now() - this.wordStartedAt
      const attempt = createAttempt(expected, spoken, responseTimeMs)

      words = words.map((word, index) =>
        index === wordIndex ? committed : word,
      )
      attempts = [...attempts, attempt]
      currentStreak = attempt.correct ? currentStreak + 1 : 0
      bestStreak = Math.max(bestStreak, currentStreak)
      wordIndex += 1
      this.wordStartedAt = performance.now()
    }

    const interimWords = tokenizeWords(interim)
    if (wordIndex < words.length) {
      const previewTyped = interimWords[0] ?? ''
      words = words.map((word, index) => {
        if (index !== wordIndex) return word
        if (!previewTyped) {
          return {
            ...createWordState(word.expected),
            status: 'active',
          }
        }
        return { ...previewWord(word.expected, previewTyped), status: 'active' }
      })
    }

    words = withActiveWord(words, wordIndex)

    const finished = wordIndex >= words.length
    this.state = {
      ...this.state,
      words,
      wordIndex,
      attempts,
      currentStreak,
      bestStreak,
      elapsedMs:
        this.state.startedAt !== null
          ? performance.now() - this.state.startedAt
          : this.state.elapsedMs,
      phase: finished ? 'finished' : 'playing',
    }

    return this.getState()
  }

  /** @deprecated Use applySpeech — kept for older phrase API tests. */
  submitAttempt(transcript: string, _responseTimeMs?: number): PhraseAttempt | null {
    if (this.state.phase !== 'playing') return null
    const before = this.state.attempts.length
    this.applySpeech(transcript, '')
    return this.state.attempts[before] ?? null
  }

  getCurrentPrompt(): string | null {
    if (this.state.phase !== 'playing') return null
    return this.state.words[this.state.wordIndex]?.expected ?? null
  }

  finishRound(): GameState {
    if (this.state.phase === 'idle') return this.getState()

    const elapsedMs =
      this.state.startedAt !== null
        ? Math.min(
            performance.now() - this.state.startedAt,
            this.state.durationMs,
          )
        : this.state.elapsedMs

    // Clear interim preview on active word
    const words = this.state.words.map((word, index) => {
      if (index === this.state.wordIndex && word.status === 'active') {
        return createWordState(word.expected)
      }
      return word
    })

    this.state = {
      ...this.state,
      words,
      phase: 'finished',
      elapsedMs,
      bestStreak: Math.max(
        this.state.bestStreak,
        calculateBestStreak(this.state.attempts),
      ),
    }

    return this.getState()
  }

  getStats(): RoundStats {
    const elapsedMs =
      this.state.phase === 'playing' && this.state.startedAt !== null
        ? performance.now() - this.state.startedAt
        : this.state.elapsedMs

    return calculateStatsFromWords(
      this.state.words,
      this.state.attempts,
      elapsedMs,
    )
  }

  getState(): GameState {
    return {
      ...this.state,
      words: this.state.words.map((word) => ({
        ...word,
        letters: [...word.letters],
      })),
      attempts: [...this.state.attempts],
    }
  }

  reset(): GameState {
    this.state = createIdleState(this.state.durationMs)
    return this.getState()
  }
}
