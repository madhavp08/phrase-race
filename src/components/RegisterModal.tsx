import { useEffect, useState, type FormEvent } from 'react'
import type { AccountFields } from '../core/account'
import { parseAccountFields } from '../core/account'

interface RegisterModalProps {
  open: boolean
  initial: AccountFields | null
  error: string | null
  submitting: boolean
  onSubmit: (account: AccountFields) => void
  onSkip: () => void
}

export function RegisterModal({
  open,
  initial,
  error,
  submitting,
  onSubmit,
  onSkip,
}: RegisterModalProps) {
  const [username, setUsername] = useState(initial?.username ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsername(initial?.username ?? '')
    setEmail(initial?.email ?? '')
    setLocalError(null)
  }, [open, initial])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseAccountFields(username, email)
    if (!parsed.ok) {
      setLocalError(parsed.error)
      return
    }
    setLocalError(null)
    onSubmit(parsed.value)
  }

  const message = localError ?? error

  return (
    <div className="lb-backdrop" role="presentation">
      <div
        className="lb-panel register-panel"
        role="dialog"
        aria-labelledby="register-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lb-header">
          <div>
            <p className="lb-kicker">claim your score</p>
            <h2 id="register-title">register</h2>
          </div>
        </header>

        <p className="reg-copy">
          {submitting
            ? 'Saving your score to the live board… this usually takes a couple of seconds.'
            : 'Pick a unique username and an email. The public board shows only the username. One email can only ever own one username. Skip and you still appear on the board as guest #0, guest #1, and so on.'}
        </p>

        <form className="reg-form" onSubmit={handleSubmit}>
          <label className="reg-field">
            <span>username</span>
            <input
              name="username"
              autoComplete="username"
              autoFocus
              maxLength={20}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="reg-field">
            <span>email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
            />
          </label>

          {message && <p className="error-line">{message}</p>}

          <div className="reg-actions">
            <button
              type="submit"
              className="icon-btn primary"
              disabled={submitting}
            >
              {submitting ? 'saving…' : 'post to board'}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onSkip}
              disabled={submitting}
            >
              skip — post as guest
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
