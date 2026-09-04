import { normalizeText, tokenizeWords } from './normalize'
import { roundTo2 } from './scoring'

export type AlignOp = {
  type: 'equal' | 'sub' | 'del' | 'ins'
  ref: string
  hyp: string
}

function tokensOf(value: string | string[]): string[] {
  return Array.isArray(value) ? value : tokenizeWords(value)
}

function charsOf(value: string): string[] {
  return [...value]
}

/** Classic Levenshtein distance + backtrace for token sequences. */
export function alignTokens(reference: string[], hypothesis: string[]): {
  distance: number
  substitutions: number
  deletions: number
  insertions: number
  ops: AlignOp[]
} {
  const n = reference.length
  const m = hypothesis.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )

  for (let i = 0; i <= n; i += 1) dp[i]![0] = i
  for (let j = 0; j <= m; j += 1) dp[0]![j] = j

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        (dp[i - 1]![j] ?? 0) + 1,
        (dp[i]![j - 1] ?? 0) + 1,
        (dp[i - 1]![j - 1] ?? 0) + cost,
      )
    }
  }

  const ops: AlignOp[] = []
  let i = n
  let j = m
  let substitutions = 0
  let deletions = 0
  let insertions = 0

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]) {
      ops.push({ type: 'equal', ref: reference[i - 1]!, hyp: hypothesis[j - 1]! })
      i -= 1
      j -= 1
      continue
    }

    const del = i > 0 ? (dp[i - 1]![j] ?? Infinity) : Infinity
    const ins = j > 0 ? (dp[i]![j - 1] ?? Infinity) : Infinity
    const sub =
      i > 0 && j > 0 ? (dp[i - 1]![j - 1] ?? Infinity) : Infinity
    const best = Math.min(del, ins, sub)

    if (best === sub) {
      ops.push({ type: 'sub', ref: reference[i - 1]!, hyp: hypothesis[j - 1]! })
      substitutions += 1
      i -= 1
      j -= 1
    } else if (best === del) {
      ops.push({ type: 'del', ref: reference[i - 1]!, hyp: '' })
      deletions += 1
      i -= 1
    } else {
      ops.push({ type: 'ins', ref: '', hyp: hypothesis[j - 1]! })
      insertions += 1
      j -= 1
    }
  }

  ops.reverse()
  return {
    distance: dp[n]![m] ?? 0,
    substitutions,
    deletions,
    insertions,
    ops,
  }
}

export function characterErrorRate(
  reference: string,
  hypothesis: string,
): number {
  const ref = charsOf(normalizeText(reference).replace(/\s+/g, ' '))
  const hyp = charsOf(normalizeText(hypothesis).replace(/\s+/g, ' '))
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1
  const { distance } = alignTokens(ref, hyp)
  return distance / ref.length
}

export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = tokensOf(reference)
  const hyp = tokensOf(hypothesis)
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1
  const { distance } = alignTokens(ref, hyp)
  return distance / ref.length
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? a
  return lo === hi ? a : a + (b - a) * (idx - lo)
}

export function median(values: number[]): number {
  return percentile(values, 0.5)
}

export function characterAccuracyFromCer(cer: number): number {
  return roundTo2(Math.max(0, Math.min(100, (1 - cer) * 100)))
}
