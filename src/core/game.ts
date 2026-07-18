import { PROMPTS } from '../data/prompts'
import { TONGUE_TWISTERS } from '../data/tongueTwisters'
import { splitLiveHypothesis } from '../speech/liveAgent'
import type { GameState, PhraseAttempt, RoundStats, TestMode } from '../types'
import { commitWord, createWordState, previewWord } from './align'
import { normalizeText, tokenizeWords } from './normalize'
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

export function pickTongueTwisterText(): string {
  return TONGUE_TWISTERS[Math.floor(Math.random() * TONGUE_TWISTERS.length)]
}

export function pickTongueTwister(): string[] {
  return tokenizeWords(pickTongueTwisterText())
}

function createIdleState(
  durationMs = 60_000,
  mode: TestMode = 'time',
): GameState {
  return {
    phase: 'idle',
    mode,
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

export class GameEngine {
  private state: GameState = createIdleState()
  private wordStartedAt = 0
  /** Soft-committed spoken words awaiting final reconcile. */
  private softCommitted: string[] = []
  /** How many complete live words already committed in this hypothesis. */
  private liveEpochComplete = 0

  startRound(
    durationMs = 60_000,
    mode: TestMode = 'time',
    wordCount = 220,
    customWords?: string[],
  ): GameState {
    const list =
      mode === 'custom'
        ? customWords && customWords.length > 0
          ? customWords
          : pickTongueTwister()
        : buildWordList(wordCount)
    const words = list.map((word) => createWordState(word))
    if (words[0]) words[0] = { ...words[0], status: 'active' }

    this.softCommitted = []
    this.liveEpochComplete = 0
    this.state = {
      phase: 'playing',
      mode,
      words,
      wordIndex: 0,
      attempts: [],
      startedAt: performance.now(),
      elapsedMs: 0,
      durationMs: mode === 'custom' ? 0 : durationMs,
      currentStreak: 0,
      bestStreak: 0,
      correctChars: 0,
      incorrectChars: 0,
    }
    this.wordStartedAt = performance.now()
    return this.getState()
  }

  private commitSpokenWord(spoken: string): void {
    const { words, wordIndex } = this.state
    if (wordIndex >= words.length) return

    const expected = words[wordIndex].expected
    const committed = commitWord(expected, spoken)
    const responseTimeMs = performance.now() - this.wordStartedAt
    const attempt = createAttempt(expected, spoken, responseTimeMs)

    const nextWords = this.state.words.map((word, index) =>
      index === wordIndex ? committed : word,
    )
    const currentStreak = attempt.correct ? this.state.currentStreak + 1 : 0

    this.state = {
      ...this.state,
      words: nextWords,
      wordIndex: wordIndex + 1,
      attempts: [...this.state.attempts, attempt],
      currentStreak,
      bestStreak: Math.max(this.state.bestStreak, currentStreak),
      elapsedMs:
        this.state.startedAt !== null
          ? performance.now() - this.state.startedAt
          : this.state.elapsedMs,
    }
    this.wordStartedAt = performance.now()
  }

  private clearLivePreview(): void {
    const { wordIndex, words } = this.state
    this.state = {
      ...this.state,
      words: words.map((word, index) => {
        if (index < wordIndex) return word
        if (index === wordIndex) {
          return { ...createWordState(word.expected), status: 'active' }
        }
        if (word.status === 'preview' || word.status === 'active') {
          return createWordState(word.expected)
        }
        return word
      }),
    }
  }

  private paintLivePreview(partialWord: string): void {
    const { wordIndex, words } = this.state
    if (wordIndex >= words.length) return

    this.state = {
      ...this.state,
      words: words.map((word, index) => {
        if (index !== wordIndex) {
          if (index > wordIndex && word.status === 'preview') {
            return createWordState(word.expected)
          }
          return word
        }
        if (!partialWord) {
          return { ...createWordState(word.expected), status: 'active' }
        }
        return { ...previewWord(word.expected, partialWord), status: 'active' }
      }),
    }
  }

  private finalizeIfComplete(): void {
    if (this.state.wordIndex >= this.state.words.length) {
      this.state = { ...this.state, phase: 'finished' }
    }
  }

  /**
   * Live agent — letter mistakes while speaking + soft-commit when the
   * hypothesis advances to the next word (speech equivalent of Space).
   */
  applyLive(hypothesis: string): GameState {
    if (this.state.phase !== 'playing') return this.getState()

    if (!hypothesis.trim()) {
      this.liveEpochComplete = 0
      this.clearLivePreview()
      return this.getState()
    }

    const { completeWords, partialWord } = splitLiveHypothesis(hypothesis)
    const newCompletes = completeWords.slice(this.liveEpochComplete)

    for (const spoken of newCompletes) {
      this.commitSpokenWord(spoken)
      this.softCommitted.push(normalizeText(spoken))
      this.liveEpochComplete += 1
      if (this.state.wordIndex >= this.state.words.length) break
    }

    this.paintLivePreview(partialWord)
    this.finalizeIfComplete()
    return this.getState()
  }

  /** Commit agent — Chrome finalized segments, reconciled with soft-commits. */
  applyFinal(transcript: string): GameState {
    if (this.state.phase !== 'playing') return this.getState()

    let finalWords = tokenizeWords(transcript)

    while (
      finalWords.length > 0 &&
      this.softCommitted.length > 0 &&
      normalizeText(finalWords[0]) === this.softCommitted[0]
    ) {
      finalWords = finalWords.slice(1)
      this.softCommitted = this.softCommitted.slice(1)
    }

    if (
      finalWords.length > 0 &&
      this.softCommitted.length > 0 &&
      normalizeText(finalWords[0]) !== this.softCommitted[0]
    ) {
      this.softCommitted = []
    }

    for (const spoken of finalWords) {
      this.commitSpokenWord(spoken)
      if (this.state.wordIndex >= this.state.words.length) break
    }

    this.liveEpochComplete = 0
    this.clearLivePreview()
    this.finalizeIfComplete()
    return this.getState()
  }

  applySpeech(finalChunk: string, interim = ''): GameState {
    if (interim) this.applyLive(interim)
    if (finalChunk) this.applyFinal(finalChunk)
    return this.getState()
  }

  submitAttempt(transcript: string): PhraseAttempt | null {
    if (this.state.phase !== 'playing') return null
    const before = this.state.attempts.length
    this.applyFinal(transcript)
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
        ? this.state.durationMs > 0
          ? Math.min(
              performance.now() - this.state.startedAt,
              this.state.durationMs,
            )
          : performance.now() - this.state.startedAt
        : this.state.elapsedMs

    this.clearLivePreview()
    this.softCommitted = []
    this.liveEpochComplete = 0

    this.state = {
      ...this.state,
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
    this.softCommitted = []
    this.liveEpochComplete = 0
    this.state = createIdleState(this.state.durationMs, this.state.mode)
    return this.getState()
  }
}
