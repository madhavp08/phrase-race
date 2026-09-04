import type { ModelResult, ModelResultStatus } from '../speech/types'
import { parseAccountFields, type AccountFields } from './account'

const SECRET_KEY = /^(api[_-]?key|access_token|secret|authorization|xi-api-key)$/i

export const TEST_TYPES = ['standard', 'stress'] as const
export type TestType = (typeof TEST_TYPES)[number]

export const RUN_OUTCOMES = [
  'completed',
  'aborted',
  'insufficient_audio',
] as const
export type RunOutcome = (typeof RUN_OUTCOMES)[number]

export interface RunUserMetrics {
  rawWpm: number
  netWpm: number
  accuracy: number
}

export interface RunPayload {
  anonymousId: string
  startedAt: string
  endedAt: string
  testType: TestType
  durationSec: number
  referenceWords: string[]
  promptSetId: string
  benchmarkVersion: string
  scorerVersion: string
  audioFormat: string
  sampleRate: number
  openaiInputHz: number
  outcome: RunOutcome
  userMetrics: RunUserMetrics
  models: ModelResult[]
  judgeProvider?: string
  account?: AccountFields
  modeLabel?: string
}

export type RunPayloadError = { ok: false; error: string }
export type RunPayloadOk = { ok: true; value: RunPayload }
export type RunPayloadResult = RunPayloadOk | RunPayloadError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectSecretKeys(value: unknown, path = 'body'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = rejectSecretKeys(value[i], `${path}[${i}]`)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const key of Object.keys(value)) {
    if (SECRET_KEY.test(key)) {
      return `Forbidden credential field "${key}"`
    }
    const found = rejectSecretKeys(value[key], `${path}.${key}`)
    if (found) return found
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null
  }
  return value
}

function parseModel(raw: unknown): ModelResult | null {
  if (!isRecord(raw)) return null
  const status = asString(raw.status) as ModelResultStatus | null
  if (
    status !== 'valid' &&
    status !== 'provider_failure' &&
    status !== 'client_failure'
  ) {
    return null
  }
  const wordResults = Array.isArray(raw.wordResults)
    ? raw.wordResults.flatMap((row) => {
        if (!isRecord(row)) return []
        const expected = asString(row.expected) ?? ''
        const heard = asString(row.heard) ?? ''
        return [
          {
            expected,
            heard,
            correct: row.correct === true,
            interimLatencyMs:
              typeof row.interimLatencyMs === 'number'
                ? row.interimLatencyMs
                : null,
            finalLatencyMs:
              typeof row.finalLatencyMs === 'number' ? row.finalLatencyMs : null,
          },
        ]
      })
    : []

  const config = isRecord(raw.config) ? raw.config : {}
  return {
    provider: asString(raw.provider) ?? '',
    model: asString(raw.model) ?? '',
    name: asString(raw.name) ?? asString(raw.provider) ?? '',
    transcript: typeof raw.transcript === 'string' ? raw.transcript : '',
    characterAccuracy: asNumber(raw.characterAccuracy) ?? 0,
    cer: asNumber(raw.cer) ?? 0,
    wer: asNumber(raw.wer) ?? 0,
    modelNetWpm: asNumber(raw.modelNetWpm) ?? 0,
    medianWordLatencyMs: asNumber(raw.medianWordLatencyMs) ?? 0,
    p95WordLatencyMs: asNumber(raw.p95WordLatencyMs) ?? 0,
    wordResults,
    status,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    config,
  }
}

export function validateRunPayload(raw: unknown): RunPayloadResult {
  let body: unknown = raw
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown
    } catch {
      return { ok: false, error: 'Body must be valid JSON' }
    }
  }
  const secret = rejectSecretKeys(body)
  if (secret) return { ok: false, error: secret }
  if (!isRecord(body)) return { ok: false, error: 'Body must be a JSON object' }

  const anonymousId = asString(body.anonymousId)
  const startedAt = asString(body.startedAt)
  const endedAt = asString(body.endedAt)
  const testType = asString(body.testType)
  const durationSec = asNumber(body.durationSec)
  const referenceWords = asStringArray(body.referenceWords)
  const promptSetId = asString(body.promptSetId)
  const benchmarkVersion = asString(body.benchmarkVersion)
  const scorerVersion = asString(body.scorerVersion)
  const audioFormat = asString(body.audioFormat)
  const sampleRate = asNumber(body.sampleRate)
  const openaiInputHz = asNumber(body.openaiInputHz)
  const outcome = asString(body.outcome)
  const userMetrics = isRecord(body.userMetrics) ? body.userMetrics : null
  const models = Array.isArray(body.models)
    ? body.models.map(parseModel)
    : null

  if (!anonymousId) return { ok: false, error: 'anonymousId is required' }
  if (!startedAt || !endedAt) return { ok: false, error: 'timestamps are required' }
  if (!testType || !TEST_TYPES.includes(testType as TestType)) {
    return { ok: false, error: 'testType must be standard or stress' }
  }
  if (durationSec === null || durationSec < 0) {
    return { ok: false, error: 'durationSec is required' }
  }
  if (!referenceWords) return { ok: false, error: 'referenceWords must be a string array' }
  if (!promptSetId) return { ok: false, error: 'promptSetId is required' }
  if (!benchmarkVersion || !scorerVersion) {
    return { ok: false, error: 'benchmarkVersion and scorerVersion are required' }
  }
  if (!audioFormat || sampleRate === null || openaiInputHz === null) {
    return { ok: false, error: 'audioFormat, sampleRate, and openaiInputHz are required' }
  }
  if (!outcome || !RUN_OUTCOMES.includes(outcome as RunOutcome)) {
    return { ok: false, error: 'outcome is invalid' }
  }
  if (!userMetrics) return { ok: false, error: 'userMetrics is required' }
  const rawWpm = asNumber(userMetrics.rawWpm)
  const netWpm = asNumber(userMetrics.netWpm)
  const accuracy = asNumber(userMetrics.accuracy)
  if (rawWpm === null || netWpm === null || accuracy === null) {
    return { ok: false, error: 'userMetrics fields are required' }
  }
  if (!models || models.some((model) => model === null)) {
    return { ok: false, error: 'models must be an array of model results' }
  }
  if (models.length === 0) return { ok: false, error: 'models must not be empty' }
  if (models.some((model) => !model?.provider)) {
    return { ok: false, error: 'each model needs a provider' }
  }

  let judgeProvider: string | undefined
  const judgeRaw = asString(body.judgeProvider)
  if (judgeRaw) judgeProvider = judgeRaw

  let modeLabel: string | undefined
  const modeRaw = asString(body.modeLabel)
  if (modeRaw) modeLabel = modeRaw

  let account: AccountFields | undefined
  if (body.account !== undefined && body.account !== null) {
    if (!isRecord(body.account)) {
      return { ok: false, error: 'account must be an object' }
    }
    const parsedAccount = parseAccountFields(
      typeof body.account.username === 'string' ? body.account.username : '',
      typeof body.account.email === 'string' ? body.account.email : '',
    )
    if (!parsedAccount.ok) return { ok: false, error: parsedAccount.error }
    account = parsedAccount.value
  }

  return {
    ok: true,
    value: {
      anonymousId,
      startedAt,
      endedAt,
      testType: testType as TestType,
      durationSec,
      referenceWords,
      promptSetId,
      benchmarkVersion,
      scorerVersion,
      audioFormat,
      sampleRate,
      openaiInputHz,
      outcome: outcome as RunOutcome,
      userMetrics: { rawWpm, netWpm, accuracy },
      models: models as ModelResult[],
      judgeProvider,
      account,
      modeLabel,
    },
  }
}
