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
    status: 'active',
  }
}

export function commitWord(expected: string, typed: string): WordState {
  const letters = alignWord(expected, typed)
  const correct = typed === expected

  return {
    expected,
    typed,
    letters: letters.map((letter) => {
      if (letter.status === 'untyped') {
        // Untyped remainder on a submitted word = missed (Monkeytype).
        return { ...letter, status: 'incorrect' as const }
      }
      return letter
    }),
    status: correct ? 'typed' : 'error',
  }
}

/**
 * Character accounting aligned with Monkeytype's result breakdown:
 * correct / incorrect / extra / missed
 *
 * - correct: right letters + space after a fully correct word
 * - incorrect: wrong letter substitutions
 * - extra: letters typed past the end of a word
 * - missed: letters left untyped when a word was submitted short
 *
 * Active (in-progress) word letters are included for live stats, but no
 * trailing space is awarded until the word is committed.
 */
export function countCharResults(
  words: WordState[],
  options: { includeActive?: boolean } = {},
): {
  correct: number
  incorrect: number
  extra: number
  missed: number
} {
  const includeActive = options.includeActive ?? true
  let correct = 0
  let incorrect = 0
  let extra = 0
  let missed = 0

  for (const word of words) {
    if (word.status === 'pending') continue
    if (word.status === 'preview') continue
    if (word.status === 'active' && !includeActive) continue

    const committed = word.status === 'typed' || word.status === 'error'
    const typedLen = word.typed.length

    for (let i = 0; i < word.letters.length; i += 1) {
      const letter = word.letters[i]

      if (letter.status === 'correct') {
        correct += 1
        continue
      }

      if (letter.status === 'extra') {
        extra += 1
        continue
      }

      if (letter.status === 'incorrect') {
        // Distinguishes substitution vs missed leftover after commit.
        if (committed && i >= typedLen) {
          missed += 1
        } else {
          incorrect += 1
        }
        continue
      }

      // untyped on active word — not yet scored
    }

    if (word.status === 'typed') {
      // Space after a correct word counts as a correct character.
      correct += 1
    } else if (word.status === 'error') {
      // Space after an incorrect word still advances — counted against raw/acc.
      incorrect += 1
    }
  }

  return { correct, incorrect, extra, missed }
}

/** All characters that affect accuracy (Monkeytype-style). */
export function accuracyDenominator(counts: {
  correct: number
  incorrect: number
  extra: number
  missed: number
}): number {
  return counts.correct + counts.incorrect + counts.extra + counts.missed
}

/** Characters that count toward raw WPM (things actually "typed"/spoken). */
export function rawCharCount(counts: {
  correct: number
  incorrect: number
  extra: number
  missed: number
}): number {
  // Missed chars were never produced — exclude from raw speed.
  return counts.correct + counts.incorrect + counts.extra
}
