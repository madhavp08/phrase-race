import type { PhraseAttempt, RoundStats, WordState } from '../types'
import {
  accuracyDenominator,
  countCharResults,
  rawCharCount,
} from './align'
import { countWords, isExactMatch, normalizeText } from './normalize'

/** Monkeytype-style round-to-2 helper. */
export function roundTo2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

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

/**
 * Monkeytype formulas:
 *   minutes = elapsedMs / 60000
 *   wpm     = (correct / 5) / minutes
 *   raw     = ((correct + incorrect + extra) / 5) / minutes
 *   acc     = correct / (correct + incorrect + extra + missed) * 100
 *
 * For timed tests, pass the configured duration as elapsedMs at the end
 * so a 60s test always uses 1.0 minutes.
 */
export function calculateStatsFromWords(
  words: WordState[],
  attempts: PhraseAttempt[],
  elapsedMs: number,
): RoundStats {
  const counts = countCharResults(words, { includeActive: true })
  const correctWords = attempts.filter((attempt) => attempt.correct).length
  const incorrectWords = attempts.length - correctWords
  const totalResponseTimeMs = attempts.reduce(
    (sum, attempt) => sum + attempt.responseTimeMs,
    0,
  )
  const denom = accuracyDenominator(counts)
  const typed = rawCharCount(counts)

  const empty: RoundStats = {
    rawWpm: 0,
    netWpm: 0,
    accuracy: 0,
    bestStreak: calculateBestStreak(attempts),
    averageResponseTimeMs:
      attempts.length > 0 ? totalResponseTimeMs / attempts.length : 0,
    correctChars: counts.correct,
    incorrectChars: counts.incorrect,
    extraChars: counts.extra,
    missedChars: counts.missed,
    correctWords,
    incorrectWords,
  }

  if (elapsedMs <= 0 || denom === 0) {
    return empty
  }

  const minutes = elapsedMs / 60_000

  return {
    rawWpm: roundTo2(typed / 5 / minutes),
    netWpm: roundTo2(counts.correct / 5 / minutes),
    accuracy: roundTo2((counts.correct / denom) * 100),
    bestStreak: calculateBestStreak(attempts),
    averageResponseTimeMs:
      attempts.length > 0 ? totalResponseTimeMs / attempts.length : 0,
    correctChars: counts.correct,
    incorrectChars: counts.incorrect,
    extraChars: counts.extra,
    missedChars: counts.missed,
    correctWords,
    incorrectWords,
  }
}

/** Legacy phrase-attempt stats (unit tests / alternate mode). */
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
      extraChars: 0,
      missedChars: 0,
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
    rawWpm: roundTo2(totalSpokenWords / minutes),
    netWpm: roundTo2(correctPromptWords / minutes),
    accuracy: roundTo2((correctAttempts / attempts.length) * 100),
    bestStreak: calculateBestStreak(attempts),
    averageResponseTimeMs: totalResponseTimeMs / attempts.length,
    correctChars: 0,
    incorrectChars: 0,
    extraChars: 0,
    missedChars: 0,
    correctWords: correctAttempts,
    incorrectWords: attempts.length - correctAttempts,
  }
}
