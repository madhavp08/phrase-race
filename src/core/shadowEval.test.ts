import { describe, expect, it } from 'vitest'
import { fanOutAudio, ShadowEvaluator } from './shadowEval'
import type { TranscriptEvent } from '../speech/types'

function event(
  partial: Partial<TranscriptEvent> & Pick<TranscriptEvent, 'text' | 'isFinal'>,
): TranscriptEvent {
  return {
    provider: 'mock',
    model: 'mock',
    receivedAt: 1_000,
    ...partial,
  }
}

function evaluator() {
  const ev = new ShadowEvaluator({
    provider: 'mock',
    model: 'mock-1',
    name: 'Mock',
    config: { x: 1 },
  })
  ev.setAudioClock(800)
  ev.setLive()
  return ev
}

describe('ShadowEvaluator', () => {
  it('does not commit on interim text', () => {
    const ev = evaluator()
    ev.consume(event({ text: 'hello world', isFinal: false }))
    expect(ev.committedTranscript).toBe('')
    const result = ev.finalize(['hello', 'world'], 60_000)
    expect(result.transcript).toBe('')
    expect(result.wordResults.every((row) => row.heard === '')).toBe(true)
  })

  it('commits only finals and scores against the reference', () => {
    const ev = evaluator()
    ev.consume(event({ text: 'hello world', isFinal: false }))
    ev.consume(event({ text: 'hello world', isFinal: true }))
    const result = ev.finalize(['hello', 'world'], 60_000)
    expect(result.transcript).toBe('hello world')
    expect(result.status).toBe('valid')
    expect(result.cer).toBe(0)
    expect(result.wer).toBe(0)
    expect(result.characterAccuracy).toBe(100)
  })

  it('dedupes identical consecutive finals at the provider layer only after consume of unique text', () => {
    const ev = evaluator()
    ev.consume(event({ text: 'hello', isFinal: true }))
    ev.consume(event({ text: 'hello', isFinal: true }))
    expect(ev.committedTranscript).toBe('hello hello')
  })

  it('records provider_failure when an adapter never goes live', () => {
    const ev = new ShadowEvaluator({
      provider: 'broken',
      model: 'broken',
      name: 'Broken',
      config: {},
    })
    ev.fail('socket died')
    const result = ev.finalize(['hello'])
    expect(result.status).toBe('provider_failure')
    expect(result.error).toBe('socket died')
  })

  it('keeps a valid transcript if the adapter later errors', () => {
    const ev = evaluator()
    ev.consume(event({ text: 'hello', isFinal: true }))
    ev.fail('later disconnect')
    const result = ev.finalize(['hello'])
    expect(result.status).toBe('valid')
    expect(result.transcript).toBe('hello')
  })

  it('stamps chunk-to-event latency from the audio clock', () => {
    const ev = evaluator()
    ev.setAudioClock(500)
    ev.consume(event({ text: 'hello', isFinal: true, receivedAt: 680 }))
    const result = ev.finalize(['hello'])
    expect(result.wordResults[0]?.finalLatencyMs).toBe(180)
    expect(result.medianWordLatencyMs).toBe(180)
  })
})

describe('identical audio → three model results', () => {
  it('scores three mock adapters independently and isolates a failure', () => {
    const a = new ShadowEvaluator({
      provider: 'deepgram',
      model: 'nova-3',
      name: 'A',
      config: {},
    })
    const b = new ShadowEvaluator({
      provider: 'openai',
      model: 'gpt-live-transcribe',
      name: 'B',
      config: {},
    })
    const c = new ShadowEvaluator({
      provider: 'elevenlabs',
      model: 'scribe_v2_realtime',
      name: 'C',
      config: {},
    })
    a.setLive()
    b.setLive()
    a.setAudioClock(100)
    b.setAudioClock(100)
    a.consume(event({ text: 'the quick fox', isFinal: true, receivedAt: 250 }))
    b.consume(event({ text: 'the crown fox', isFinal: true, receivedAt: 400 }))
    c.fail('disconnected')

    const ref = ['the', 'quick', 'fox']
    const results = [a.finalize(ref, 60_000), b.finalize(ref, 60_000), c.finalize(ref)]
    expect(results.map((row) => row.status)).toEqual([
      'valid',
      'valid',
      'provider_failure',
    ])
    expect(results[0]?.cer).toBe(0)
    expect(results[1]?.wer).toBeGreaterThan(0)
    expect(results[2]?.transcript).toBe('')
  })
})

describe('fanOutAudio', () => {
  it('sends identical bytes to every provider', () => {
    const chunk = new Uint8Array([1, 2, 3, 4]).buffer
    const received: ArrayBuffer[] = []
    fanOutAudio(chunk, [
      { sendAudio: (pcm) => received.push(pcm) },
      { sendAudio: (pcm) => received.push(pcm) },
    ])
    expect(received).toHaveLength(2)
    expect(new Uint8Array(received[0]!)).toEqual(new Uint8Array(chunk))
    expect(new Uint8Array(received[1]!)).toEqual(new Uint8Array(chunk))
  })

  it('isolates a throwing adapter', () => {
    const chunk = new Uint8Array([9]).buffer
    const ok: ArrayBuffer[] = []
    fanOutAudio(chunk, [
      {
        sendAudio: () => {
          throw new Error('boom')
        },
      },
      { sendAudio: (pcm) => ok.push(pcm) },
    ])
    expect(ok).toHaveLength(1)
  })
})
