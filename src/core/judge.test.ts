import { describe, expect, it } from 'vitest'
import { pickLivePrimary, pickRoundJudge, statsFromJudge } from './judge'
import type { ModelResult } from '../speech/types'
import type { RoundStats } from '../types'

function model(partial: Partial<ModelResult> & Pick<ModelResult, 'provider'>): ModelResult {
  return {
    model: `${partial.provider}-model`,
    name: partial.provider,
    transcript: '',
    characterAccuracy: 90,
    cer: 0.1,
    wer: 0.1,
    modelNetWpm: 40,
    medianWordLatencyMs: 100,
    p95WordLatencyMs: 200,
    wordResults: [],
    status: 'valid',
    config: {},
    ...partial,
  }
}

const emptyStats: RoundStats = {
  rawWpm: 10,
  netWpm: 10,
  accuracy: 50,
  bestStreak: 2,
  averageResponseTimeMs: 0,
  consistency: 0,
  fastestWordMs: 0,
  slowestWordMs: 0,
  correctChars: 0,
  incorrectChars: 0,
  extraChars: 0,
  missedChars: 0,
  correctWords: 1,
  incorrectWords: 1,
}

describe('pickRoundJudge', () => {
  it('picks the valid model with the highest WPM', () => {
    const winner = pickRoundJudge([
      model({ provider: 'deepgram', modelNetWpm: 55, characterAccuracy: 99 }),
      model({ provider: 'openai', modelNetWpm: 72, characterAccuracy: 90 }),
      model({
        provider: 'elevenlabs',
        modelNetWpm: 80,
        status: 'provider_failure',
      }),
    ])
    expect(winner?.provider).toBe('openai')
  })

  it('breaks WPM ties on character accuracy', () => {
    const winner = pickRoundJudge([
      model({ provider: 'deepgram', modelNetWpm: 60, characterAccuracy: 91 }),
      model({ provider: 'openai', modelNetWpm: 60, characterAccuracy: 97 }),
    ])
    expect(winner?.provider).toBe('openai')
  })

  it('returns null when every model failed', () => {
    expect(
      pickRoundJudge([
        model({ provider: 'deepgram', status: 'provider_failure' }),
      ]),
    ).toBeNull()
  })
})

describe('statsFromJudge', () => {
  it('copies WPM/accuracy from the judge and keeps streaks', () => {
    const stats = statsFromJudge(
      emptyStats,
      model({
        provider: 'openai',
        modelNetWpm: 81.4,
        characterAccuracy: 96.2,
        wordResults: [
          {
            expected: 'a',
            heard: 'a',
            correct: true,
            interimLatencyMs: null,
            finalLatencyMs: null,
          },
          {
            expected: 'b',
            heard: 'c',
            correct: false,
            interimLatencyMs: null,
            finalLatencyMs: null,
          },
        ],
      }),
    )
    expect(stats.netWpm).toBe(81.4)
    expect(stats.accuracy).toBe(96.2)
    expect(stats.bestStreak).toBe(2)
    expect(stats.correctWords).toBe(1)
    expect(stats.incorrectWords).toBe(1)
  })
})

describe('pickLivePrimary', () => {
  it('uses measured average WPM when the board has data', () => {
    expect(
      pickLivePrimary(['deepgram', 'openai', 'elevenlabs'], [
        {
          provider: 'deepgram',
          validRuns: 4,
          avgModelNetWpm: 50,
          avgCharacterAccuracy: 99,
        },
        {
          provider: 'openai',
          validRuns: 4,
          avgModelNetWpm: 70,
          avgCharacterAccuracy: 90,
        },
      ]),
    ).toBe('openai')
  })

  it('falls back to the public ranking snapshot with no runs', () => {
    expect(pickLivePrimary(['deepgram', 'openai', 'elevenlabs'], [])).toBe(
      'openai',
    )
    expect(pickLivePrimary(['deepgram', 'elevenlabs'], [])).toBe('deepgram')
  })

  it('ignores providers that are not enabled this round', () => {
    expect(
      pickLivePrimary(['deepgram'], [
        {
          provider: 'openai',
          validRuns: 10,
          avgModelNetWpm: 99,
          avgCharacterAccuracy: 99,
        },
      ]),
    ).toBe('deepgram')
  })
})
