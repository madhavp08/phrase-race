import type { LetterState, LetterStatus, WordState } from '../types'

/** Build letter states by comparing typed input to an expected word. */
export function alignWord(expected: string, typed: string): LetterState[] {
  const letters: LetterState[] = []
  const limit = Math.max(expected.length, typed.length)

  for (let i = 0; i < limit; i += 1) {
    const expectedChar = expected[i]
    const typedChar = typed[i]

    if (expectedChar === undefined) {
      letters.push({ char: typedChar, status: 'extra' })
      continue
    }

    if (typedChar === undefined) {
      letters.push({ char: expectedChar, status: 'untyped' })
      continue
    }

    const status: LetterStatus =
      typedChar === expectedChar ? 'correct' : 'incorrect'
    // Show the expected character (Monkeytype default) with error coloring.
    letters.push({ char: expectedChar, status })
  }

  return letters
}

export function createWordState(expected: string): WordState {
  return {
    expected,
    typed: '',
    letters: expected.split('').map((char) => ({ char, status: 'untyped' })),
    status: 'pending',
  }
}

export function previewWord(expected: string, typed: string): WordState {
  const letters = alignWord(expected, typed)

  return {
    expected,
    typed,
    letters,
    // Interim speech never commits — always stays active while previewing.
    status: 'active',
  }
}

export function commitWord(expected: string, typed: string): WordState {
  const letters = alignWord(expected, typed)
  const correct = typed === expected

  return {
    expected,
    typed,
    letters: letters.map((letter) =>
      letter.status === 'untyped'
        ? { ...letter, status: 'incorrect' as const }
        : letter,
    ),
    status: correct ? 'typed' : 'error',
  }
}

export function countCharResults(words: WordState[]): {
  correctChars: number
  incorrectChars: number
} {
  let correctChars = 0
  let incorrectChars = 0

  for (const word of words) {
    if (word.status === 'pending' || word.status === 'active') continue

    for (const letter of word.letters) {
      if (letter.status === 'correct') correctChars += 1
      if (letter.status === 'incorrect' || letter.status === 'extra') {
        incorrectChars += 1
      }
    }

    // Space after each completed word counts as a correct char when the word
    // was finished (Monkeytype includes spaces in char stats).
    if (word.status === 'typed') correctChars += 1
    else if (word.status === 'error') incorrectChars += 1
  }

  return { correctChars, incorrectChars }
}
