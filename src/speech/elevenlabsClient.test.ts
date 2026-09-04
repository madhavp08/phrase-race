import { describe, expect, it } from 'vitest'
import {
  buildElevenLabsRealtimeUrl,
  ELEVENLABS_COMMIT_STRATEGY,
  ELEVENLABS_MODEL,
} from './elevenlabsClient'

describe('ElevenLabs adapter config', () => {
  it('streams Scribe v2 with VAD commit and the single-use token', () => {
    const url = new URL(buildElevenLabsRealtimeUrl('sutkn_abc'))
    expect(url.protocol).toBe('wss:')
    expect(url.hostname).toBe('api.elevenlabs.io')
    expect(url.pathname).toBe('/v1/speech-to-text/realtime')
    expect(url.searchParams.get('model_id')).toBe(ELEVENLABS_MODEL)
    expect(url.searchParams.get('commit_strategy')).toBe(
      ELEVENLABS_COMMIT_STRATEGY,
    )
    expect(url.searchParams.get('audio_format')).toBe('pcm_16000')
    expect(url.searchParams.get('token')).toBe('sutkn_abc')
  })
})
