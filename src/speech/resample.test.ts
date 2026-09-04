import { describe, expect, it } from 'vitest'
import { resamplePcm16 } from './pcm'
import { CANONICAL_SAMPLE_RATE, OPENAI_INPUT_HZ } from './constants'

function pcmFrom(samples: number[]): ArrayBuffer {
  const view = new Int16Array(samples)
  return view.buffer
}

describe('resamplePcm16 16→24', () => {
  it('scales length by 24/16 without inventing new sample values', () => {
    const source = pcmFrom([100, -200, 300, -400])
    const out = new Int16Array(
      resamplePcm16(source, CANONICAL_SAMPLE_RATE, OPENAI_INPUT_HZ),
    )
    expect(out.length).toBe(Math.round(4 * (OPENAI_INPUT_HZ / CANONICAL_SAMPLE_RATE)))
    const allowed = new Set([100, -200, 300, -400])
    for (const sample of out) {
      expect(allowed.has(sample)).toBe(true)
    }
  })

  it('is a no-op copy at the same rate', () => {
    const source = pcmFrom([1, 2, 3])
    const out = new Int16Array(resamplePcm16(source, 16000, 16000))
    expect([...out]).toEqual([1, 2, 3])
  })
})
