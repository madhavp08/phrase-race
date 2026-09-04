export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AccountFields {
  username: string
  email: string
}

export interface AccountRow {
  id: string
  username: string
  email: string | null
}

export type AccountConflictCode = 'username_taken' | 'email_username_mismatch'

export type AccountDecision =
  | { ok: true; action: 'create' }
  | { ok: true; action: 'reuse'; id: string }
  | { ok: false; code: AccountConflictCode; error: string }

export function normalizeUsername(value: string): string {
  return value.trim()
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateUsername(raw: string | null | undefined): string | null {
  if (!raw) return 'Username is required'
  const username = normalizeUsername(raw)
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username can only use letters, numbers, and underscores'
  }
  return null
}

export function validateEmail(raw: string | null | undefined): string | null {
  if (!raw) return 'Email is required'
  const email = normalizeEmail(raw)
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address'
  }
  return null
}

export function parseAccountFields(
  username: string,
  email: string,
): { ok: true; value: AccountFields } | { ok: false; error: string } {
  const userError = validateUsername(username)
  if (userError) return { ok: false, error: userError }
  const emailError = validateEmail(email)
  if (emailError) return { ok: false, error: emailError }
  return {
    ok: true,
    value: {
      username: normalizeUsername(username),
      email: normalizeEmail(email),
    },
  }
}

/**
 * One email ↔ one username. Same pair is a returning user.
 * Do not leak the existing username when the email already has another one.
 */
export function decideAccountAction(
  username: string,
  email: string,
  matches: readonly AccountRow[],
): AccountDecision {
  const wantUser = username.toLowerCase()
  const wantEmail = email.toLowerCase()
  const registered = matches.filter((row) => row.email != null)
  const byUser = registered.filter(
    (row) => row.username.toLowerCase() === wantUser,
  )
  const byEmail = registered.filter(
    (row) => row.email != null && row.email.toLowerCase() === wantEmail,
  )

  if (registered.length === 0) return { ok: true, action: 'create' }

  const same =
    byUser.length === 1 &&
    byEmail.length === 1 &&
    byUser[0] &&
    byEmail[0] &&
    byUser[0].id === byEmail[0].id

  if (same && byUser[0]) {
    return { ok: true, action: 'reuse', id: byUser[0].id }
  }

  if (byEmail.length > 0 && byEmail[0]?.username.toLowerCase() !== wantUser) {
    return {
      ok: false,
      code: 'email_username_mismatch',
      error:
        'This email is already registered to a different username. Use the original username.',
    }
  }

  return {
    ok: false,
    code: 'username_taken',
    error: 'That username is taken.',
  }
}

export function formatGuestUsername(n: number): string {
  return `guest #${n}`
}

export function isGuestUsername(name: string): boolean {
  return /^guest #\d+$/.test(name)
}
