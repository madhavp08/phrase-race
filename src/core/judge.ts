import type { ModelSummaryRow } from './modelSummary'
import type { ModelResult } from '../speech/types'
import type { RoundStats } from '../types'

/**
 * Fallback live-primary order when PhraseRace has no measured runs yet.
 * Public realtime STT leaderboards are not a stable API (most are batch ASR).
 * Snapshot: September 2026, English — commonly cited accuracy, not vendor ads.
 * Once /api/models/summary has valid runs, those averages win.
 */
export const PUBLIC_STT_RANKING = ['openai', 'deepgram', 'elevenlabs'] as const

/**
 * After a round, the user-facing WPM/accuracy come from the valid model
 * with the highest model-adjusted WPM — not a hardcoded vendor.
 */
export function pickRoundJudge(
  models: readonly ModelResult[],
): ModelResult | null {
  const valid = models.filter((model) => model.status === 'valid')
  if (valid.length === 0) return null
  const ranked = [...valid].sort((a, b) => {
    if (b.modelNetWpm !== a.modelNetWpm) return b.modelNetWpm - a.modelNetWpm
    if (b.characterAccuracy !== a.characterAccuracy) {
      return b.characterAccuracy - a.characterAccuracy
    }
    return a.provider.localeCompare(b.provider)
  })
  return ranked[0] ?? null
}

export function statsFromJudge(
  base: RoundStats,
  judge: ModelResult,
): RoundStats {
  const hasWords = judge.wordResults.length > 0
  const correctWords = judge.wordResults.filter((word) => word.correct).length
  const incorrectWords = judge.wordResults.length - correctWords
  return {
    ...base,
    netWpm: judge.modelNetWpm,
    rawWpm: judge.modelNetWpm,
    accuracy: judge.characterAccuracy,
    correctWords: hasWords ? correctWords : base.correctWords,
    incorrectWords: hasWords ? incorrectWords : base.incorrectWords,
  }
}

/**
 * Live caret follows the historically fastest model on our board.
 * With no measured runs yet, fall back to a dated public-ranking snapshot
 * (not a live Hugging Face scrape — those boards are mostly batch ASR).
 */
export function pickLivePrimary(
  enabled: readonly string[],
  summaries: readonly Pick<
    ModelSummaryRow,
    'provider' | 'validRuns' | 'avgModelNetWpm' | 'avgCharacterAccuracy'
  >[],
): string {
  if (enabled.length === 0) return PUBLIC_STT_RANKING[0] ?? 'deepgram'

  const stats = new Map<
    string,
    { wpmN: number; wpmSum: number; accN: number; accSum: number }
  >()

  for (const row of summaries) {
    if (!enabled.includes(row.provider) || row.validRuns <= 0) continue
    const cur = stats.get(row.provider) ?? {
      wpmN: 0,
      wpmSum: 0,
      accN: 0,
      accSum: 0,
    }
    if (row.avgModelNetWpm != null) {
      cur.wpmSum += row.avgModelNetWpm * row.validRuns
      cur.wpmN += row.validRuns
    }
    if (row.avgCharacterAccuracy != null) {
      cur.accSum += row.avgCharacterAccuracy * row.validRuns
      cur.accN += row.validRuns
    }
    stats.set(row.provider, cur)
  }

  let best: string | null = null
  let bestWpm = -Infinity
  let bestAcc = -Infinity
  for (const id of enabled) {
    const s = stats.get(id)
    if (!s || s.wpmN === 0) continue
    const wpm = s.wpmSum / s.wpmN
    const acc = s.accN ? s.accSum / s.accN : 0
    if (wpm > bestWpm || (wpm === bestWpm && acc > bestAcc)) {
      best = id
      bestWpm = wpm
      bestAcc = acc
    }
  }
  if (best) return best

  for (const id of PUBLIC_STT_RANKING) {
    if (enabled.includes(id)) return id
  }
  return enabled[0] ?? PUBLIC_STT_RANKING[0] ?? 'deepgram'
}
