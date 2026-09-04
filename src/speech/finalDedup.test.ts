import { describe, expect, it } from 'vitest'
import { FinalDeduper } from './finalDedup'

describe('FinalDeduper', () => {
  it('drops identical consecutive finals', () => {
    const dedupe = new FinalDeduper()
    expect(dedupe.accept('Hello World')).toBe(true)
    expect(dedupe.accept('hello world')).toBe(false)
    expect(dedupe.accept('hello there')).toBe(true)
  })
})
