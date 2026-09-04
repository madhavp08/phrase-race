import { randomUUID } from 'node:crypto'
import type { ModelSummaryRow } from '../../src/core/modelSummary'
import { percentile } from '../../src/core/sttMetrics'
import type { RunPayload } from '../../src/core/runPayload'
import { ensureSchema, getSql } from './db'

export async function createRun(payload: RunPayload): Promise<string> {
  await ensureSchema()
  const sql = getSql()
  const runId = randomUUID()

  await sql.query(
    `INSERT INTO users (anonymous_id) VALUES ($1)
     ON CONFLICT (anonymous_id) DO NOTHING`,
    [payload.anonymousId],
  )

  await sql.query(
    `INSERT INTO test_runs (
      id, anonymous_id, started_at, ended_at, test_type, duration_sec,
      reference_words, prompt_set_id, benchmark_version, scorer_version,
      audio_format, sample_rate, openai_input_hz, outcome,
      raw_wpm, net_wpm, accuracy
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )`,
    [
      runId,
      payload.anonymousId,
      payload.startedAt,
      payload.endedAt,
      payload.testType,
      payload.durationSec,
      payload.referenceWords,
      payload.promptSetId,
      payload.benchmarkVersion,
      payload.scorerVersion,
      payload.audioFormat,
      payload.sampleRate,
      payload.openaiInputHz,
      payload.outcome,
      payload.userMetrics.rawWpm,
      payload.userMetrics.netWpm,
      payload.userMetrics.accuracy,
    ],
  )

  for (const model of payload.models) {
    const modelId = randomUUID()
    await sql.query(
      `INSERT INTO model_results (
        id, run_id, provider, model, name, config, transcript,
        character_accuracy, cer, wer, model_net_wpm,
        median_word_latency_ms, p95_word_latency_ms, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )`,
      [
        modelId,
        runId,
        model.provider,
        model.model,
        model.name,
        model.config ?? {},
        model.transcript,
        model.characterAccuracy,
        model.cer,
        model.wer,
        model.modelNetWpm,
        model.medianWordLatencyMs,
        model.p95WordLatencyMs,
        model.status,
      ],
    )

    for (const [index, word] of model.wordResults.entries()) {
      await sql.query(
        `INSERT INTO word_results (
          id, model_result_id, word_index, expected, heard, correct,
          interim_latency_ms, final_latency_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          modelId,
          index,
          word.expected,
          word.heard,
          word.correct,
          word.interimLatencyMs,
          word.finalLatencyMs,
        ],
      )
    }
  }

  return runId
}

export type { ModelSummaryRow }

export async function getModelSummary(): Promise<ModelSummaryRow[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql.query(
    `SELECT
       mr.provider,
       mr.model,
       tr.test_type AS "testType",
       mr.character_accuracy AS "characterAccuracy",
       mr.cer,
       mr.wer,
       mr.median_word_latency_ms AS "medianWordLatencyMs",
       mr.status
     FROM model_results mr
     JOIN test_runs tr ON tr.id = mr.run_id`,
    [],
  )) as Array<{
    provider: string
    model: string
    testType: string
    characterAccuracy: number | null
    cer: number | null
    wer: number | null
    medianWordLatencyMs: number | null
    status: string
  }>

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = `${row.provider}\t${row.model}\t${row.testType}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const summaries: ModelSummaryRow[] = []
  for (const [key, list] of groups) {
    const [provider, model, testType] = key.split('\t')
    const valid = list.filter((row) => row.status === 'valid')
    const acc = valid
      .map((row) => row.characterAccuracy)
      .filter((n): n is number => n !== null)
    const cer = valid.map((row) => row.cer).filter((n): n is number => n !== null)
    const wer = valid.map((row) => row.wer).filter((n): n is number => n !== null)
    const lat = valid
      .map((row) => row.medianWordLatencyMs)
      .filter((n): n is number => n !== null)

    summaries.push({
      provider: provider ?? '',
      model: model ?? '',
      testType: testType ?? 'standard',
      runs: list.length,
      validRuns: valid.length,
      avgCharacterAccuracy: average(acc),
      avgCer: average(cer),
      avgWer: average(wer),
      medianOfMedianLatencyMs: lat.length ? percentile(lat, 0.5) : null,
      p95OfMedianLatencyMs: lat.length ? percentile(lat, 0.95) : null,
    })
  }

  summaries.sort((a, b) => a.provider.localeCompare(b.provider))
  return summaries
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, n) => sum + n, 0) / values.length
}
