import { describe, expect, it } from 'vitest'
import { splitLiveHypothesis } from './liveAgent'

describe('splitLiveHypothesis', () => {
  it('treats a single token as partial', () => {
    expect(splitLiveHypothesis('ple')).toEqual({
      completeWords: [],
      partialWord: 'ple',
    })
  })

  it('soft-completes prior words when a new word starts', () => {
    expect(splitLiveHypothesis('please open th')).toEqual({
      completeWords: ['please', 'open'],
      partialWord: 'th',
    })
  })

  it('completes all words when hypothesis ends with a space', () => {
    expect(splitLiveHypothesis('please open ')).toEqual({
      completeWords: ['please', 'open'],
      partialWord: '',
    })
  })

  it('handles empty hypothesis', () => {
    expect(splitLiveHypothesis('')).toEqual({
      completeWords: [],
      partialWord: '',
    })
  })
})
