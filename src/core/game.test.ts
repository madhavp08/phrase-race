import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from './game'

describe('GameEngine', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  it('starts a timed round with a word stream', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 'time', 20)
    expect(engine.getState().phase).toBe('playing')
    expect(engine.getState().mode).toBe('time')
    expect(engine.getState().words.length).toBe(20)
    expect(engine.getState().words[0].status).toBe('active')
  })

  it('starts a phrase round with a tongue twister', () => {
    const engine = new GameEngine()
    engine.startRound(0, 'phrase')
    expect(engine.getState().mode).toBe('phrase')
    expect(engine.getState().words.length).toBeGreaterThan(3)
    expect(engine.getState().durationMs).toBe(0)
  })

  it('live agent soft-commits when the next word begins', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 'time', 10)
    const first = engine.getState().words[0].expected
    const second = engine.getState().words[1].expected

    engine.applyLive(`${first} ${second.slice(0, 2)}`)
    expect(engine.getState().wordIndex).toBe(1)
    expect(['typed', 'error']).toContain(engine.getState().words[0].status)
    expect(engine.getState().words[1].status).toBe('active')
    expect(
      engine.getState().words[1].letters.some((l) => l.status === 'correct'),
    ).toBe(true)
  })

  it('does not double-commit the same live words on repeat hypotheses', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 'time', 10)
    const first = engine.getState().words[0].expected

    engine.applyLive(`${first} op`)
    engine.applyLive(`${first} ope`)
    expect(engine.getState().wordIndex).toBe(1)
    expect(engine.getState().attempts).toHaveLength(1)
  })

  it('reconciles finals with soft-committed live words', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 'time', 10)
    const first = engine.getState().words[0].expected
    const second = engine.getState().words[1].expected

    engine.applyLive(`${first} ${second.slice(0, 1)}`)
    expect(engine.getState().attempts).toHaveLength(1)

    engine.applyFinal(`${first} ${second}`)
    expect(engine.getState().attempts).toHaveLength(2)
    expect(engine.getState().wordIndex).toBe(2)
  })

  it('finishes and returns stats', () => {
    const engine = new GameEngine()
    engine.startRound(60_000, 'time', 5)
    const first = engine.getState().words[0].expected
    engine.applyFinal(first)
    vi.spyOn(performance, 'now').mockReturnValue(60_000)
    engine.finishRound()
    const stats = engine.getStats()
    expect(engine.getState().phase).toBe('finished')
    expect(stats.correctWords).toBe(1)
    expect(stats.netWpm).toBeGreaterThan(0)
  })
})
