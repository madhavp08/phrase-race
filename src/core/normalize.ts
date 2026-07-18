export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isExactMatch(prompt: string, transcript: string): boolean {
  return normalizeText(prompt) === normalizeText(transcript)
}

export function countWords(value: string): number {
  const normalized = normalizeText(value)
  if (!normalized) return 0
  return normalized.split(' ').length
}

export function tokenizeWords(value: string): string[] {
  const normalized = normalizeText(value)
  if (!normalized) return []
  return normalized.split(' ')
}
