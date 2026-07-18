import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from './game'

describe('GameEngine', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  it('starts a round with a word stream', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 20)
    expect(engine.getState().phase).toBe('playing')
    expect(engine.getState().words.length).toBe(20)
    expect(engine.getState().words[0].status).toBe('active')
  })

  it('advances through words as speech arrives', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 10)
    const first = engine.getState().words[0].expected
    const second = engine.getState().words[1].expected

    engine.applySpeech(first, '')
    expect(engine.getState().wordIndex).toBe(1)
    expect(engine.getState().words[0].status).toBe('typed')
    expect(engine.getState().words[1].status).toBe('active')

    engine.applySpeech(second, '')
    expect(engine.getState().wordIndex).toBe(2)
  })

  it('previews interim speech on the active word', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 5)
    const expected = engine.getState().words[0].expected
    const partial = expected.slice(0, Math.max(1, Math.floor(expected.length / 2)))

    engine.applySpeech('', partial)
    const active = engine.getState().words[0]
    expect(active.status).toBe('active')
    expect(active.letters.some((l) => l.status === 'correct')).toBe(true)
    expect(engine.getState().wordIndex).toBe(0)
  })

  it('finishes and returns stats', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 5)
    const first = engine.getState().words[0].expected
    engine.applySpeech(first, '')
    vi.spyOn(performance, 'now').mockReturnValue(60_000)
    engine.finishRound()
    const stats = engine.getStats()
    expect(engine.getState().phase).toBe('finished')
    expect(stats.correctWords).toBe(1)
    expect(stats.netWpm).toBeGreaterThan(0)
  })
})
