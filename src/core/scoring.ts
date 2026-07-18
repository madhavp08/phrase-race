import type { PhraseAttempt, RoundStats, WordState } from '../types'
import { countCharResults } from './align'
import { countWords, isExactMatch, normalizeText } from './normalize'

export function createAttempt(
  prompt: string,
  transcript: string,
  responseTimeMs: number,
): PhraseAttempt {
  const normalizedPrompt = normalizeText(prompt)
  const normalizedTranscript = normalizeText(transcript)
  const correct = isExactMatch(prompt, transcript)

  return {
    prompt,
    transcript,
    normalizedPrompt,
    normalizedTranscript,
    correct,
    responseTimeMs,
    wordCount: countWords(transcript),
  }
}

export function calculateBestStreak(attempts: PhraseAttempt[]): number {
  let best = 0
  let current = 0

  for (const attempt of attempts) {
    if (attempt.correct) {
      current += 1
      if (current > best) best = current
    } else {
      current = 0
    }
  }

  return best
}

export function calculateStatsFromWords(
  words: WordState[],
  attempts: PhraseAttempt[],
  elapsedMs: number,
): RoundStats {
  const { correctChars, incorrectChars } = countCharResults(words)
  const correctWords = attempts.filter((attempt) => attempt.correct).length
  const incorrectWords = attempts.length - correctWords
  const totalResponseTimeMs = attempts.reduce(
    (sum, attempt) => sum + attempt.responseTimeMs,
    0,
  )

  if (elapsedMs <= 0 || (correctChars === 0 && incorrectChars === 0)) {
    return {
      rawWpm: 0,
      netWpm: 0,
      accuracy: 0,
      bestStreak: calculateBestStreak(attempts),
      averageResponseTimeMs:
        attempts.length > 0 ? totalResponseTimeMs / attempts.length : 0,
      correctChars,
      incorrectChars,
      correctWords,
      incorrectWords,
    }
  }

  const minutes = elapsedMs / 60_000
  const totalTypedChars = correctChars + incorrectChars

  return {
    // Monkeytype: chars/5 per minute
    rawWpm: totalTypedChars / 5 / minutes,
    netWpm: correctChars / 5 / minutes,
    accuracy:
      totalTypedChars === 0
        ? 0
        : (correctChars / totalTypedChars) * 100,
    bestStreak: calculateBestStreak(attempts),
    averageResponseTimeMs:
      attempts.length > 0 ? totalResponseTimeMs / attempts.length : 0,
    correctChars,
    incorrectChars,
    correctWords,
    incorrectWords,
  }
}

/** Legacy phrase-attempt stats (kept for unit tests / phrase mode). */
export function calculateStats(
  attempts: PhraseAttempt[],
  elapsedMs: number,
): RoundStats {
  if (attempts.length === 0 || elapsedMs <= 0) {
    return {
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
  }

  const minutes = elapsedMs / 60_000
  const totalSpokenWords = attempts.reduce(
    (sum, attempt) => sum + attempt.wordCount,
    0,
  )
  const correctPromptWords = attempts
    .filter((attempt) => attempt.correct)
    .reduce((sum, attempt) => sum + countWords(attempt.prompt), 0)
  const correctAttempts = attempts.filter((attempt) => attempt.correct).length
  const totalResponseTimeMs = attempts.reduce(
    (sum, attempt) => sum + attempt.responseTimeMs,
    0,
  )

  return {
    rawWpm: totalSpokenWords / minutes,
    netWpm: correctPromptWords / minutes,
    accuracy: (correctAttempts / attempts.length) * 100,
    bestStreak: calculateBestStreak(attempts),
    averageResponseTimeMs: totalResponseTimeMs / attempts.length,
    correctChars: 0,
    incorrectChars: 0,
    correctWords: correctAttempts,
    incorrectWords: attempts.length - correctAttempts,
  }
}
