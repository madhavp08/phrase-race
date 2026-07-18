import { describe, expect, it } from 'vitest'
import { commitWord, createWordState } from './align'
import { countWords, isExactMatch, normalizeText } from './normalize'
import {
  calculateBestStreak,
  calculateStats,
  calculateStatsFromWords,
  createAttempt,
} from './scoring'

describe('normalizeText', () => {
  it('lowercases text', () => {
    expect(normalizeText('Please Open The Window')).toBe(
      'please open the window',
    )
  })

  it('removes punctuation', () => {
    expect(normalizeText("Don't stop, now!")).toBe('dont stop now')
    expect(normalizeText('hello, world.')).toBe('hello world')
  })

  it('collapses extra whitespace', () => {
    expect(normalizeText('  please   open   the   window  ')).toBe(
      'please open the window',
    )
  })
})

describe('isExactMatch', () => {
  it('matches despite capitalization and punctuation', () => {
    expect(
      isExactMatch('Please open the window!', 'please open the window'),
    ).toBe(true)
  })

  it('matches despite extra whitespace', () => {
    expect(
      isExactMatch('turn on the lights', '  turn   on  the lights '),
    ).toBe(true)
  })

  it('rejects incorrect transcripts', () => {
    expect(isExactMatch('turn on the lights', 'turn off the lights')).toBe(
      false,
    )
  })

  it('rejects empty transcript against a prompt', () => {
    expect(isExactMatch('send the message now', '')).toBe(false)
  })
})

describe('createAttempt', () => {
  it('builds a correct attempt with normalized fields', () => {
    const attempt = createAttempt(
      'Send the message now!',
      'send the message now',
      1200,
    )

    expect(attempt.correct).toBe(true)
    expect(attempt.normalizedPrompt).toBe('send the message now')
    expect(attempt.normalizedTranscript).toBe('send the message now')
    expect(attempt.responseTimeMs).toBe(1200)
    expect(attempt.wordCount).toBe(4)
  })

  it('marks incorrect transcripts as incorrect', () => {
    const attempt = createAttempt(
      'send the message now',
      'send the email now',
      900,
    )
    expect(attempt.correct).toBe(false)
  })
})

describe('calculateBestStreak', () => {
  it('tracks the longest consecutive correct run', () => {
    const attempts = [
      createAttempt('a', 'a', 100),
      createAttempt('b', 'b', 100),
      createAttempt('c', 'wrong', 100),
      createAttempt('d', 'd', 100),
      createAttempt('e', 'e', 100),
      createAttempt('f', 'f', 100),
    ]

    expect(calculateBestStreak(attempts)).toBe(3)
  })

  it('returns zero for empty rounds', () => {
    expect(calculateBestStreak([])).toBe(0)
  })
})

describe('calculateStats', () => {
  it('returns zeros for empty rounds', () => {
    expect(calculateStats([], 60_000)).toMatchObject({
      rawWpm: 0,
      netWpm: 0,
      accuracy: 0,
      bestStreak: 0,
      averageResponseTimeMs: 0,
    })
  })

  it('calculates word-based raw/net WPM and accuracy', () => {
    const attempts = [
      createAttempt('one two three', 'one two three', 1000),
      createAttempt('four five', 'four five six', 2000),
      createAttempt('seven eight nine', 'seven eight nine', 3000),
    ]

    const stats = calculateStats(attempts, 60_000)

    expect(stats.rawWpm).toBeCloseTo(9)
    expect(stats.netWpm).toBeCloseTo(6)
    expect(stats.accuracy).toBeCloseTo((2 / 3) * 100)
    expect(stats.bestStreak).toBe(1)
    expect(stats.averageResponseTimeMs).toBeCloseTo(2000)
  })

  it('scales WPM with elapsed time', () => {
    const attempts = [
      createAttempt('alpha beta gamma delta', 'alpha beta gamma delta', 500),
    ]

    const stats = calculateStats(attempts, 30_000)
    expect(stats.rawWpm).toBeCloseTo(8)
    expect(stats.netWpm).toBeCloseTo(8)
    expect(stats.accuracy).toBe(100)
  })
})

describe('calculateStatsFromWords', () => {
  it('uses Monkeytype-style chars/5 WPM', () => {
    // "hi" correct + space = 3 correct chars → (3/5)/1min = 0.6 wpm
    const words = [commitWord('hi', 'hi'), createWordState('there')]
    const attempts = [createAttempt('hi', 'hi', 400)]
    const stats = calculateStatsFromWords(words, attempts, 60_000)

    expect(stats.netWpm).toBeCloseTo(0.6)
    expect(stats.accuracy).toBe(100)
    expect(stats.correctWords).toBe(1)
  })
})

describe('countWords', () => {
  it('counts normalized words', () => {
    expect(countWords('  Hello,   world!  ')).toBe(2)
    expect(countWords('')).toBe(0)
  })
})
