import type { AccountFields } from '../core/account'

const STORAGE_KEY = 'phraserace.account'

export function readSavedAccount(): AccountFields | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountFields>
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.email !== 'string'
    ) {
      return null
    }
    return { username: parsed.username, email: parsed.email }
  } catch {
    return null
  }
}

export function writeSavedAccount(account: AccountFields) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
}
