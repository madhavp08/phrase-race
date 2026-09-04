import { describe, expect, it } from 'vitest'
import {
  READING_WPM,
  displayWordIndex,
  pacedWordIndex,
  timedPromptWordCount,
} from './readingPace'

describe('pacedWordIndex', () => {
  it('stays on the first word until a word of time has passed', () => {
    expect(pacedWordIndex(0, 40)).toBe(0)
    expect(pacedWordIndex(499, 40)).toBe(0)
  })

  it('advances one word every 500ms at 120 WPM', () => {
    expect(READING_WPM).toBe(120)
    expect(pacedWordIndex(500, 40)).toBe(1)
    expect(pacedWordIndex(1000, 40)).toBe(2)
    expect(pacedWordIndex(30_000, 200)).toBe(60)
  })

  it('does not run past the last word', () => {
    expect(pacedWordIndex(60_000, 10)).toBe(9)
  })
})

describe('timedPromptWordCount', () => {
  it('covers a 120s round at 120 WPM with extra runway', () => {
    expect(timedPromptWordCount(120)).toBeGreaterThanOrEqual(240)
  })

  it('still has a buffer on a short 15s round', () => {
    expect(timedPromptWordCount(15)).toBeGreaterThanOrEqual(70)
  })
})

describe('displayWordIndex', () => {
  it('follows whichever cursor is ahead so STT lag does not freeze the page', () => {
    expect(displayWordIndex(3, 10)).toBe(10)
    expect(displayWordIndex(40, 12)).toBe(40)
  })
})
