import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../data/sentences'
import { tokenizeWords } from './normalize'
import { buildSentenceStream } from './prompts'

const noShuffle = () => 0.999

describe('buildSentenceStream', () => {
  it('keeps the words of a sentence together in order', () => {
    const tokens = buildSentenceStream(10, noShuffle, [
      'the cat sat on the mat',
      'birds flew over the lake today',
    ])
    expect(tokens.map((token) => token.word).join(' ')).toBe(
      'the cat sat on the mat birds flew over the',
    )
    expect(tokens[5]?.sentenceEnd).toBe(true)
    expect(tokens[4]?.sentenceEnd).toBe(false)
  })

  it('includes ordinary function words instead of a content-word bag', () => {
    const text = buildSentenceStream(220)
      .map((token) => token.word)
      .join(' ')
    expect(text).toMatch(/\bthe\b/)
    expect(text).toMatch(/\band\b/)
    expect(text).toMatch(/\bto\b/)
  })

  it('has enough original sentences to fill a timed round', () => {
    const words = SENTENCES.flatMap((sentence) => tokenizeWords(sentence))
    expect(SENTENCES.length).toBeGreaterThanOrEqual(80)
    expect(words.length).toBeGreaterThanOrEqual(220)
  })
})
