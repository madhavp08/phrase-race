const STORAGE_KEY = 'phraserace.anonymous_id'

export function getAnonymousId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}
