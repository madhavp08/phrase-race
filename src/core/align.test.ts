import { describe, expect, it } from 'vitest'
import { alignWord, commitWord, previewWord } from './align'

describe('alignWord', () => {
  it('marks matching letters correct and rest untyped', () => {
    const letters = alignWord('please', 'ple')
    expect(letters.map((l) => l.status)).toEqual([
      'correct',
      'correct',
      'correct',
      'untyped',
      'untyped',
      'untyped',
    ])
  })

  it('marks wrong letters incorrect', () => {
    const letters = alignWord('open', 'opan')
    expect(letters.map((l) => [l.char, l.status])).toEqual([
      ['o', 'correct'],
      ['p', 'correct'],
      ['e', 'incorrect'],
      ['n', 'correct'],
    ])
  })

  it('marks extra typed letters', () => {
    const letters = alignWord('hi', 'hill')
    expect(letters.map((l) => l.status)).toEqual([
      'correct',
      'correct',
      'extra',
      'extra',
    ])
  })
})

describe('commitWord', () => {
  it('commits a correct word', () => {
    const word = commitWord('lights', 'lights')
    expect(word.status).toBe('typed')
    expect(word.letters.every((l) => l.status === 'correct')).toBe(true)
  })

  it('commits an incorrect word and marks leftover letters incorrect', () => {
    const word = commitWord('window', 'win')
    expect(word.status).toBe('error')
    expect(word.letters.filter((l) => l.status === 'incorrect')).toHaveLength(3)
  })
})

describe('previewWord', () => {
  it('previews partial speech against the active word', () => {
    const word = previewWord('message', 'mes')
    expect(word.status).toBe('active')
    expect(word.letters.slice(0, 3).every((l) => l.status === 'correct')).toBe(
      true,
    )
  })
})
