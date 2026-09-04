import {
  BENCHMARK_VERSION,
  OPENAI_INPUT_HZ,
  SCORER_VERSION,
} from '../speech/constants'
import { TARGET_SAMPLE_RATE } from '../speech/mic'
import type { ModelResult } from '../speech/types'
import type { RunPayload, TestType } from '../core/runPayload'
import type { RoundStats } from '../types'
import { getAnonymousId } from './anonymousId'

export interface SubmitRunInput {
  startedAt: number
  testType: TestType
  durationSec: number
  referenceWords: string[]
  promptSetId: string
  outcome: RunPayload['outcome']
  stats: RoundStats
  models: ModelResult[]
}

export async function submitRun(
  input: SubmitRunInput,
): Promise<{ id: string } | { error: string }> {
  const payload: RunPayload = {
    anonymousId: getAnonymousId(),
    startedAt: new Date(input.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    testType: input.testType,
    durationSec: input.durationSec,
    referenceWords: input.referenceWords,
    promptSetId: input.promptSetId,
    benchmarkVersion: BENCHMARK_VERSION,
    scorerVersion: SCORER_VERSION,
    audioFormat: 'linear16',
    sampleRate: TARGET_SAMPLE_RATE,
    openaiInputHz: OPENAI_INPUT_HZ,
    outcome: input.outcome,
    userMetrics: {
      rawWpm: input.stats.rawWpm,
      netWpm: input.stats.netWpm,
      accuracy: input.stats.accuracy,
    },
    models: input.models,
  }

  try {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await response.json()) as { id?: string; error?: string }
    if (!response.ok || !body.id) {
      return { error: body.error || `Save failed (${response.status})` }
    }
    return { id: body.id }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not reach /api/runs',
    }
  }
}
