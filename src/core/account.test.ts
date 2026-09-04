import { describe, expect, it } from 'vitest'
import {
  decideAccountAction,
  parseAccountFields,
  validateEmail,
  validateUsername,
} from './account'

describe('username / email', () => {
  it('accepts a normal handle and email', () => {
    expect(parseAccountFields('  nova_3 ', 'Madhav@Example.COM')).toEqual({
      ok: true,
      value: { username: 'nova_3', email: 'madhav@example.com' },
    })
  })

  it('rejects short or punctuation usernames', () => {
    expect(validateUsername('ab')).toMatch(/3/)
    expect(validateUsername('bad-name')).toMatch(/underscores/)
  })

  it('rejects invalid email', () => {
    expect(validateEmail('not-an-email')).toMatch(/valid email/)
  })
})

describe('decideAccountAction', () => {
  it('creates when nothing matches', () => {
    expect(decideAccountAction('nova', 'a@b.co', [])).toEqual({
      ok: true,
      action: 'create',
    })
  })

  it('reuses the same email + username pair', () => {
    expect(
      decideAccountAction('Nova', 'a@b.co', [
        { id: '1', username: 'nova', email: 'a@b.co' },
      ]),
    ).toEqual({ ok: true, action: 'reuse', id: '1' })
  })

  it('blocks a second username on an existing email', () => {
    const result = decideAccountAction('other', 'a@b.co', [
      { id: '1', username: 'nova', email: 'a@b.co' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('email_username_mismatch')
      expect(result.error).not.toMatch(/nova/i)
    }
  })

  it('blocks a username already bound to another email', () => {
    const result = decideAccountAction('nova', 'new@b.co', [
      { id: '1', username: 'nova', email: 'old@b.co' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('username_taken')
  })
})
