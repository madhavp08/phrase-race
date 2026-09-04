import { randomUUID } from 'node:crypto'
import {
  decideAccountAction,
  formatGuestUsername,
  isGuestUsername,
} from './account'
import { AccountConflictError } from './errors'
import type { ModelSummaryRow } from './modelSummary'
import type { RunPayload } from './runPayload'
import { chunkedPackRows } from './sqlBatch'
import { average, percentile } from './stats'
import { ensureSchema, getSql } from './db'

export { AccountConflictError } from './errors'

export interface CreateRunResult {
  id: string
  rank: number | null
  username: string | null
}

export interface LeaderboardRow {
  id: string
  username: string
  wpm: number
  accuracy: number
  modeLabel: string
}

export interface PublicProfile {
  username: string
  guest: boolean
  runCount: number
  bestWpm: number | null
  bestAccuracy: number | null
  rank: number | null
  modeLabel: string | null
}

export async function createRun(payload: RunPayload): Promise<CreateRunResult> {
  // Vercel Hobby kills this handler at ~10s. Avoid Neon HTTP transactions
  // (they have crashed the isolate with FUNCTION_INVOCATION_FAILED) and
  // avoid one round-trip per word.
  await ensureSchema()
  const sql = getSql()
  const runId = randomUUID()

  const account = payload.account
    ? await resolveRegisteredAccount(
        payload.account.username,
        payload.account.email,
        payload.anonymousId,
      )
    : await resolveGuestAccount(payload.anonymousId)

  const scoreId = randomUUID()
  const modeLabel =
    payload.modeLabel ??
    (payload.testType === 'stress' ? 'custom' : `time ${payload.durationSec}`)

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
      raw_wpm, net_wpm, accuracy, account_id, judge_provider
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
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
      account.id,
      payload.judgeProvider ?? null,
    ],
  )

  const pendingWordInserts: Array<{ text: string; params: unknown[] }> = []

  for (const model of payload.models) {
    const modelId = randomUUID()
    await sql.query(
      `INSERT INTO model_results (
        id, run_id, provider, model, name, config, transcript,
        character_accuracy, cer, wer, model_net_wpm,
        median_word_latency_ms, p95_word_latency_ms, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14
      )`,
      [
        modelId,
        runId,
        model.provider,
        model.model,
        model.name,
        JSON.stringify(model.config ?? {}),
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

    const wordPacks = chunkedPackRows(
      [
        'id',
        'model_result_id',
        'word_index',
        'expected',
        'heard',
        'correct',
        'interim_latency_ms',
        'final_latency_ms',
      ],
      model.wordResults.map((word, index) => [
        randomUUID(),
        modelId,
        index,
        word.expected,
        word.heard,
        word.correct,
        word.interimLatencyMs,
        word.finalLatencyMs,
      ]),
    )
    for (const packed of wordPacks) {
      pendingWordInserts.push({
        text: `INSERT INTO word_results (${packed.columns}) VALUES ${packed.values}`,
        params: packed.params,
      })
    }
  }

  await sql.query(
    `INSERT INTO leaderboard_scores (
      id, account_id, run_id, wpm, accuracy, mode_label, display_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      scoreId,
      account.id,
      runId,
      payload.userMetrics.netWpm,
      payload.userMetrics.accuracy,
      modeLabel,
      account.username,
    ],
  )

  const rankRows = (await sql.query(
    `SELECT rank FROM (
       SELECT id, ROW_NUMBER() OVER (
         ORDER BY wpm DESC, accuracy DESC, created_at ASC
       ) AS rank
       FROM leaderboard_scores
     ) ranked
     WHERE id = $1`,
    [scoreId],
  )) as Array<{ rank: string | number }>

  if (pendingWordInserts.length > 0) {
    try {
      for (const query of pendingWordInserts) {
        await sql.query(query.text, query.params)
      }
    } catch (error) {
      console.error('[PhraseRace] word_results insert failed', error)
    }
  }

  const rankRaw = rankRows[0]?.rank
  const rank =
    typeof rankRaw === 'number'
      ? rankRaw
      : typeof rankRaw === 'string'
        ? Number.parseInt(rankRaw, 10)
        : null

  return {
    id: runId,
    rank: Number.isFinite(rank) ? (rank as number) : null,
    username: account.username,
  }
}

export type { ModelSummaryRow }

export async function listLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql.query(
    `SELECT
       ls.id,
       COALESCE(ls.display_name, a.username) AS username,
       ls.wpm,
       ls.accuracy,
       ls.mode_label AS "modeLabel"
     FROM leaderboard_scores ls
     JOIN accounts a ON a.id = ls.account_id
     ORDER BY ls.wpm DESC, ls.accuracy DESC, ls.created_at ASC
     LIMIT $1`,
    [limit],
  )) as Array<{
    id: string
    username: string
    wpm: number
    accuracy: number
    modeLabel: string
  }>

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    wpm: Math.round(row.wpm),
    accuracy: Math.round(row.accuracy),
    modeLabel: row.modeLabel,
  }))
}

export async function getPublicProfile(opts: {
  anonymousId?: string | null
  username?: string | null
}): Promise<PublicProfile | null> {
  await ensureSchema()
  const sql = getSql()
  const anonymousId = opts.anonymousId?.trim() || null
  const username = opts.username?.trim() || null
  if (!anonymousId && !username) return null

  const accounts = (await sql.query(
    `SELECT id, username, email
     FROM accounts
     WHERE ($1::text IS NOT NULL AND anonymous_id = $1)
        OR ($2::text IS NOT NULL AND lower(username) = lower($2))
     ORDER BY CASE WHEN email IS NOT NULL THEN 0 ELSE 1 END
     LIMIT 1`,
    [anonymousId, username],
  )) as Array<{ id: string; username: string; email: string | null }>

  const account = accounts[0]
  if (!account) return null

  const counts = (await sql.query(
    `SELECT COUNT(*)::int AS n FROM leaderboard_scores WHERE account_id = $1`,
    [account.id],
  )) as Array<{ n: string | number }>
  const runCount = Number(counts[0]?.n ?? 0)

  const best = (await sql.query(
    `SELECT id, wpm, accuracy, mode_label AS "modeLabel"
     FROM leaderboard_scores
     WHERE account_id = $1
     ORDER BY wpm DESC, accuracy DESC, created_at ASC
     LIMIT 1`,
    [account.id],
  )) as Array<{
    id: string
    wpm: number
    accuracy: number
    modeLabel: string
  }>
  const top = best[0] ?? null

  let rank: number | null = null
  if (top) {
    const ranked = (await sql.query(
      `SELECT rank FROM (
         SELECT id, ROW_NUMBER() OVER (
           ORDER BY wpm DESC, accuracy DESC, created_at ASC
         ) AS rank
         FROM leaderboard_scores
       ) ranked
       WHERE id = $1`,
      [top.id],
    )) as Array<{ rank: string | number }>
    const raw = ranked[0]?.rank
    const parsed =
      typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
    rank = Number.isFinite(parsed) ? parsed : null
  }

  return {
    username: account.username,
    guest: account.email == null || isGuestUsername(account.username),
    runCount,
    bestWpm: top ? Math.round(top.wpm) : null,
    bestAccuracy: top ? Math.round(top.accuracy) : null,
    rank,
    modeLabel: top?.modeLabel ?? null,
  }
}

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
       mr.model_net_wpm AS "modelNetWpm",
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
    modelNetWpm: number | null
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
    const wpm = valid
      .map((row) => row.modelNetWpm)
      .filter((n): n is number => n !== null)
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
      avgModelNetWpm: average(wpm),
      medianOfMedianLatencyMs: lat.length ? percentile(lat, 0.5) : null,
      p95OfMedianLatencyMs: lat.length ? percentile(lat, 0.95) : null,
    })
  }

  summaries.sort((a, b) => a.provider.localeCompare(b.provider))
  return summaries
}

async function resolveRegisteredAccount(
  username: string,
  email: string,
  anonymousId: string,
): Promise<{ id: string; username: string }> {
  const sql = getSql()
  const matches = (await sql.query(
    `SELECT id, username, email
     FROM accounts
     WHERE (email IS NOT NULL AND lower(email) = lower($1))
        OR lower(username) = lower($2)`,
    [email, username],
  )) as Array<{ id: string; username: string; email: string | null }>

  const decision = decideAccountAction(username, email, matches)
  if (!decision.ok) {
    throw new AccountConflictError(decision.code, decision.error)
  }

  const byAnon = await findAccountByAnonymousId(anonymousId)

  if (decision.action === 'reuse') {
    await linkAnonymousId(decision.id, anonymousId)
    const existing = matches.find((row) => row.id === decision.id)
    return { id: decision.id, username: existing?.username ?? username }
  }

  if (byAnon && isGuestUsername(byAnon.username)) {
    await sql.query(
      `UPDATE accounts
       SET username = $1, email = $2
       WHERE id = $3`,
      [username, email, byAnon.id],
    )
    return { id: byAnon.id, username }
  }

  const id = randomUUID()
  try {
    await sql.query(
      `INSERT INTO accounts (id, email, username, anonymous_id)
       VALUES ($1,$2,$3,$4)`,
      [id, email, username, anonymousId],
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountConflictError(
        'username_taken',
        'That username or email is already registered.',
      )
    }
    throw error
  }

  return { id, username }
}

async function resolveGuestAccount(
  anonymousId: string,
): Promise<{ id: string; username: string }> {
  const existing = await findAccountByAnonymousId(anonymousId)
  if (existing) return existing

  const sql = getSql()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const n = await nextGuestNumber()
    const username = formatGuestUsername(n)
    const id = randomUUID()
    try {
      await sql.query(
        `INSERT INTO accounts (id, email, username, anonymous_id, guest_number)
         VALUES ($1, NULL, $2, $3, $4)`,
        [id, username, anonymousId, n],
      )
      return { id, username }
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue
      throw error
    }
  }

  throw new Error('Could not allocate a guest username')
}

async function findAccountByAnonymousId(
  anonymousId: string,
): Promise<{ id: string; username: string } | null> {
  const sql = getSql()
  const rows = (await sql.query(
    `SELECT id, username FROM accounts WHERE anonymous_id = $1 LIMIT 1`,
    [anonymousId],
  )) as Array<{ id: string; username: string }>
  const row = rows[0]
  return row ? { id: row.id, username: row.username } : null
}

async function linkAnonymousId(accountId: string, anonymousId: string) {
  const sql = getSql()
  try {
    await sql.query(
      `UPDATE accounts
       SET anonymous_id = $1
       WHERE id = $2 AND anonymous_id IS NULL`,
      [anonymousId, accountId],
    )
  } catch (error) {
    if (isUniqueViolation(error)) return
    throw error
  }
}

async function nextGuestNumber(): Promise<number> {
  const sql = getSql()
  const rows = (await sql.query(
    `SELECT nextval('guest_number_seq') AS n`,
    [],
  )) as Array<{ n: string | number }>
  const raw = rows[0]?.n
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n)) {
    throw new Error('guest_number_seq returned a non-number')
  }
  return n
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = 'code' in error ? String(error.code) : ''
  const message = 'message' in error ? String(error.message) : ''
  return code === '23505' || /unique|duplicate key/i.test(message)
}
