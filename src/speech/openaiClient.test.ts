import { describe, expect, it } from 'vitest'
import {
  buildOpenAIAuthProtocols,
  buildOpenAIRealtimeUrl,
  buildOpenAISessionUpdate,
  OPENAI_DELAY,
  OPENAI_TRANSCRIBE_MODEL,
} from './openaiClient'
import { OPENAI_INPUT_HZ } from './constants'

describe('OpenAI adapter config', () => {
  it('uses the transcription realtime endpoint', () => {
    const url = new URL(buildOpenAIRealtimeUrl())
    expect(url.protocol).toBe('wss:')
    expect(url.hostname).toBe('api.openai.com')
    expect(url.pathname).toBe('/v1/realtime')
    expect(url.searchParams.get('intent')).toBe('transcription')
  })

  it('puts the ephemeral key in a space-free subprotocol', () => {
    expect(buildOpenAIAuthProtocols('ek_test')).toEqual([
      'realtime',
      'openai-insecure-api-key.ek_test',
    ])
  })

  it('pins gpt-live-transcribe, 24 kHz, and low delay', () => {
    const update = buildOpenAISessionUpdate()
    const session = update.session as {
      audio: {
        input: {
          format: { rate: number }
          transcription: { model: string; delay: string }
        }
      }
    }
    expect(session.audio.input.format.rate).toBe(OPENAI_INPUT_HZ)
    expect(session.audio.input.transcription.model).toBe(OPENAI_TRANSCRIBE_MODEL)
    expect(session.audio.input.transcription.delay).toBe(OPENAI_DELAY)
  })
})
