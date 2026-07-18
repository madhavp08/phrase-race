import { describe, expect, it } from 'vitest'
import { buildAuthProtocol, buildDeepgramListenUrl } from './deepgramClient'
import { TARGET_SAMPLE_RATE } from './mic'

describe('buildDeepgramListenUrl', () => {
  it('targets nova-3 with linear16 streaming params', () => {
    const url = new URL(buildDeepgramListenUrl())
    expect(url.protocol).toBe('wss:')
    expect(url.hostname).toBe('api.deepgram.com')
    expect(url.pathname).toBe('/v1/listen')
    expect(url.searchParams.get('model')).toBe('nova-3')
    expect(url.searchParams.get('encoding')).toBe('linear16')
    expect(url.searchParams.get('sample_rate')).toBe(String(TARGET_SAMPLE_RATE))
    expect(url.searchParams.get('interim_results')).toBe('true')
    expect(url.searchParams.get('smart_format')).toBe('true')
    expect(url.searchParams.get('endpointing')).toBe('300')
    expect(url.searchParams.get('utterance_end_ms')).toBe('1000')
    expect(url.searchParams.has('punctuate')).toBe(false)
  })
})

describe('buildAuthProtocol', () => {
  it('uses a single Bearer subprotocol string for browser WS auth', () => {
    expect(buildAuthProtocol('abc.jwt.token')).toBe('Bearer abc.jwt.token')
  })
})
