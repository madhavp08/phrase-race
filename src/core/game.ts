import { TONGUE_TWISTERS } from '../data/tongueTwisters'
import { WORDS } from '../data/words'
import { splitLiveHypothesis } from '../speech/liveAgent'
import type { GameState, PhraseAttempt, RoundStats, TestMode } from '../types'
import { commitWord, createWordState, previewWord } from './align'
import { normalizeText, tokenizeWords } from './normalize'
import { asPromptTokens, buildSentenceStream, type PromptWord } from './prompts'
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

/** Shuffled content-word bag. Timed rounds now use buildSentenceStream. */
export function buildWordList(count = 220): string[] {
  if (WORDS.length === 0) return []

  const words: string[] = []
  while (words.length < count) {
    words.push(...shuffle(WORDS))
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
    promptWords?: PromptWord[],
  ): GameState {
    const list =
      promptWords && promptWords.length > 0
        ? asPromptTokens(promptWords)
        : mode === 'custom'
          ? asPromptTokens(pickTongueTwister())
          : buildSentenceStream(wordCount)
    const words = list.map((token) =>
      createWordState(token.word, token.sentenceEnd),
    )
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
    const committed = {
      ...commitWord(expected, spoken),
      sentenceEnd: words[wordIndex].sentenceEnd,
    }
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
          return {
            ...createWordState(word.expected, word.sentenceEnd),
            status: 'active',
          }
        }
        if (word.status === 'preview' || word.status === 'active') {
          return createWordState(word.expected, word.sentenceEnd)
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
            return createWordState(word.expected, word.sentenceEnd)
          }
          return word
        }
        if (!partialWord) {
          return {
            ...createWordState(word.expected, word.sentenceEnd),
            status: 'active',
          }
        }
        return {
          ...previewWord(word.expected, partialWord),
          status: 'active',
          sentenceEnd: word.sentenceEnd,
        }
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

    // Interim hypotheses can suddenly grow by many words. Commit at most one
    // per update so the cursor cannot skip ahead, but never advance the epoch
    // past what we actually committed (or later finals / updates will misalign).
    if (newCompletes.length > 0) {
      this.commitSpokenWord(newCompletes[0])
      this.softCommitted.push(normalizeText(newCompletes[0]))
      this.liveEpochComplete += 1
    }

    this.paintLivePreview(partialWord)
    this.finalizeIfComplete()
    return this.getState()
  }

  /** Commit agent — finalized segments, reconciled with soft-commits. */
  applyFinal(transcript: string): GameState {
    if (this.state.phase !== 'playing') return this.getState()

    let finalWords = tokenizeWords(transcript)

    // Soft-commits already advanced the prompt cursor. Consume that many final
    // tokens (even if Deepgram corrected the text) so we never double-commit
    // the same spoken positions.
    const reconciledCount = Math.min(
      finalWords.length,
      this.softCommitted.length,
    )
    finalWords = finalWords.slice(reconciledCount)
    this.softCommitted = this.softCommitted.slice(reconciledCount)

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

    const actualElapsed =
      this.state.startedAt !== null
        ? performance.now() - this.state.startedAt
        : this.state.elapsedMs

    // Timed tests always score against the configured duration (Monkeytype).
    const elapsedMs =
      this.state.mode === 'time' && this.state.durationMs > 0
        ? this.state.durationMs
        : actualElapsed

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
    let elapsedMs: number
    if (this.state.phase === 'playing' && this.state.startedAt !== null) {
      elapsedMs = performance.now() - this.state.startedAt
    } else if (this.state.mode === 'time' && this.state.durationMs > 0) {
      elapsedMs = this.state.durationMs
    } else {
      elapsedMs = this.state.elapsedMs
    }

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
