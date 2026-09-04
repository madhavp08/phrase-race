import { SENTENCES } from '../data/sentences'
import { tokenizeWords } from './normalize'

export interface PromptToken {
  word: string
  sentenceEnd: boolean
}

export type PromptWord = string | PromptToken

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function asPromptTokens(input: readonly PromptWord[]): PromptToken[] {
  return input.map((item) =>
    typeof item === 'string'
      ? { word: item, sentenceEnd: false }
      : { word: item.word, sentenceEnd: Boolean(item.sentenceEnd) },
  )
}

/**
 * Timed rounds are a stream of whole English sentences, shuffled as
 * sentences (not as a bag of content words).
 */
export function buildSentenceStream(
  count = 220,
  rng: () => number = Math.random,
  sentences: readonly string[] = SENTENCES,
): PromptToken[] {
  if (count <= 0) return []
  const tokenized = sentences
    .map((sentence) => tokenizeWords(sentence))
    .filter((words) => words.length > 0)
  if (tokenized.length === 0) return []

  const tokens: PromptToken[] = []
  let pool = shuffle(tokenized, rng)
  let index = 0
  while (tokens.length < count) {
    if (index >= pool.length) {
      pool = shuffle(tokenized, rng)
      index = 0
    }
    const sentence = pool[index] ?? []
    index += 1
    for (let wordIndex = 0; wordIndex < sentence.length; wordIndex += 1) {
      tokens.push({
        word: sentence[wordIndex] ?? '',
        sentenceEnd: wordIndex === sentence.length - 1,
      })
    }
  }
  return tokens.slice(0, count)
}
