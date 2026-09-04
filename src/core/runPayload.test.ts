import { describe, expect, it } from 'vitest'
import { validateRunPayload } from './runPayload'
import type { ModelResult } from '../speech/types'

const model: ModelResult = {
  provider: 'deepgram',
  model: 'nova-3',
  name: 'Deepgram Nova-3',
  transcript: 'hello',
  characterAccuracy: 100,
  cer: 0,
  wer: 0,
  modelNetWpm: 40,
  medianWordLatencyMs: 160,
  p95WordLatencyMs: 200,
  wordResults: [],
  status: 'valid',
  config: { endpointingMs: 100 },
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    anonymousId: '11111111-1111-4111-8111-111111111111',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    testType: 'standard',
    durationSec: 30,
    referenceWords: ['hello'],
    promptSetId: 'english-400-stream-220',
    benchmarkVersion: 'v1',
    scorerVersion: 'v1',
    audioFormat: 'linear16',
    sampleRate: 16000,
    openaiInputHz: 24000,
    outcome: 'completed',
    userMetrics: { rawWpm: 80, netWpm: 72, accuracy: 96 },
    models: [model],
    ...overrides,
  }
}

describe('validateRunPayload', () => {
  it('accepts a complete experiment', () => {
    const result = validateRunPayload(validBody())
    expect(result.ok).toBe(true)
  })

  it('rejects credential field names anywhere in the body', () => {
    const result = validateRunPayload(
      validBody({
        models: [{ ...model, config: { api_key: 'sk-secret' } }],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/api_key/i)
  })

  it('rejects access_token keys', () => {
    const result = validateRunPayload(validBody({ access_token: 'nope' }))
    expect(result.ok).toBe(false)
  })

  it('rejects an empty models array', () => {
    const result = validateRunPayload(validBody({ models: [] }))
    expect(result.ok).toBe(false)
  })

  it('accepts a username + email account', () => {
    const result = validateRunPayload(
      validBody({
        account: { username: 'Nova', email: 'Nova@Example.com' },
        judgeProvider: 'openai',
        modeLabel: 'time 30',
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.account).toEqual({
        username: 'Nova',
        email: 'nova@example.com',
      })
      expect(result.value.judgeProvider).toBe('openai')
    }
  })

  it('rejects a bad username on the run payload', () => {
    const result = validateRunPayload(
      validBody({ account: { username: 'x', email: 'a@b.co' } }),
    )
    expect(result.ok).toBe(false)
  })

  it('accepts a JSON string body (Vercel sometimes leaves req.body unparsed)', () => {
    const result = validateRunPayload(JSON.stringify(validBody()))
    expect(result.ok).toBe(true)
  })

  it('rejects invalid JSON strings', () => {
    const result = validateRunPayload('{not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/json/i)
  })
})
