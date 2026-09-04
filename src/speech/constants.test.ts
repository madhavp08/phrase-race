import { describe, expect, it } from 'vitest'
import { parseEnabledProviders } from './constants'

describe('parseEnabledProviders', () => {
  it('does not force Deepgram into a filtered list', () => {
    expect(parseEnabledProviders('openai')).toEqual(['openai'])
  })

  it('dedupes and ignores unknown ids', () => {
    expect(parseEnabledProviders('deepgram,whisper,openai,deepgram')).toEqual([
      'deepgram',
      'openai',
    ])
  })

  it('falls back to all providers when the list is empty', () => {
    expect(parseEnabledProviders('')).toEqual([
      'deepgram',
      'openai',
      'elevenlabs',
    ])
  })
})
