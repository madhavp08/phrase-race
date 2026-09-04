import { describe, expect, it } from 'vitest'
import {
  alignTokens,
  characterAccuracyFromCer,
  characterErrorRate,
  median,
  percentile,
  wordErrorRate,
} from './sttMetrics'

describe('characterErrorRate / wordErrorRate', () => {
  it('is 0 for identical normalized strings', () => {
    expect(characterErrorRate('Hello, world!', 'hello world')).toBe(0)
    expect(wordErrorRate('Hello, world!', 'hello world')).toBe(0)
  })

  it('counts a known substitution/deletion/insertion triple', () => {
    // kitten → sitting : S=2 (k→s, e→i), I=1 (g) → 3/6
    expect(characterErrorRate('kitten', 'sitting')).toBeCloseTo(0.5, 5)

    // the cat sat / the bat sit here : 2 sub + 1 ins / 3 words
    expect(wordErrorRate('the cat sat', 'the bat sit here')).toBeCloseTo(1, 5)
  })

  it('treats empty reference with leftover hypothesis as 1', () => {
    expect(characterErrorRate('', 'abc')).toBe(1)
    expect(wordErrorRate('', 'hello')).toBe(1)
  })

  it('converts CER to character accuracy', () => {
    expect(characterAccuracyFromCer(0.1)).toBe(90)
  })
})

describe('alignTokens', () => {
  it('pairs substitutions and keeps insertions/deletions', () => {
    const { ops, substitutions, deletions, insertions } = alignTokens(
      ['the', 'quick', 'fox'],
      ['the', 'crown', 'fox', 'extra'],
    )
    expect(substitutions).toBe(1)
    expect(deletions).toBe(0)
    expect(insertions).toBe(1)
    expect(ops.some((op) => op.type === 'sub' && op.ref === 'quick')).toBe(true)
    expect(ops.some((op) => op.type === 'ins' && op.hyp === 'extra')).toBe(true)
  })
})

describe('percentile', () => {
  it('returns median and p95', () => {
    const values = [10, 20, 30, 40, 50]
    expect(median(values)).toBe(30)
    expect(percentile(values, 0.95)).toBeGreaterThanOrEqual(40)
  })

  it('returns 0 for an empty series', () => {
    expect(median([])).toBe(0)
  })
})
