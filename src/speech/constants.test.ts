import { describe, expect, it } from 'vitest'
import { parseEnabledProviders, PRIMARY_PROVIDER_ID } from './constants'

describe('parseEnabledProviders', () => {
  it('always includes Deepgram as primary', () => {
    expect(parseEnabledProviders('openai')).toEqual([
      PRIMARY_PROVIDER_ID,
      'openai',
    ])
  })

  it('dedupes and ignores unknown ids', () => {
    expect(parseEnabledProviders('deepgram,whisper,openai,deepgram')).toEqual([
      'deepgram',
      'openai',
    ])
  })
})
