import { tokenizeWords } from '../core/normalize'

/**
 * Live agent: turns streaming interim speech into
 * - words ready to soft-commit (everything before the trailing partial word)
 * - the trailing partial for letter-level preview
 *
 * This mirrors Monkeytype's "space commits the word" — when STT starts a new
 * word in the hypothesis, the previous word is treated as complete.
 */
export function splitLiveHypothesis(hypothesis: string): {
  completeWords: string[]
  partialWord: string
} {
  const words = tokenizeWords(hypothesis)
  if (words.length === 0) {
    return { completeWords: [], partialWord: '' }
  }

  const endsWithSpace = /\s$/.test(hypothesis)
  if (endsWithSpace) {
    // Trailing space ⇒ every token is complete (no partial).
    return { completeWords: words, partialWord: '' }
  }

  if (words.length === 1) {
    return { completeWords: [], partialWord: words[0] }
  }

  return {
    completeWords: words.slice(0, -1),
    partialWord: words[words.length - 1],
  }
}
