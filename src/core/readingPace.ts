/** Average adult reading/speaking target for the on-screen prompt. */
export const READING_WPM = 120

export function pacedWordIndex(elapsedMs: number, wordCount: number): number {
  if (wordCount <= 0 || elapsedMs <= 0) return 0
  const index = Math.floor((elapsedMs / 60_000) * READING_WPM)
  return Math.min(wordCount - 1, Math.max(0, index))
}

/**
 * How many prompt words to generate for a timed round.
 * Sized so a 120 WPM reader never runs out, plus runway for faster speech.
 */
export function timedPromptWordCount(durationSec: number): number {
  const seconds = Math.max(5, durationSec)
  const atPace = Math.ceil((seconds * READING_WPM) / 60)
  return atPace + Math.max(40, Math.ceil(atPace * 0.4))
}

export function displayWordIndex(spokenIndex: number, paceIndex: number): number {
  return Math.max(spokenIndex, paceIndex)
}
