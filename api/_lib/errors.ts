import type { AccountConflictCode } from './account.js'

export class AccountConflictError extends Error {
  readonly code: AccountConflictCode

  constructor(code: AccountConflictCode, message: string) {
    super(message)
    this.name = 'AccountConflictError'
    this.code = code
  }
}
