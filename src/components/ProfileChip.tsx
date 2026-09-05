import { useEffect, useRef, useState } from 'react'
import type { PublicProfile } from '../data/profile'

interface ProfileChipProps {
  username: string
  profile: PublicProfile | null
  onLogout: () => void
}

export function ProfileChip({ username, profile, onLogout }: ProfileChipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const stats = profile && !profile.guest ? profile : null

  return (
    <div className="profile-chip" ref={rootRef}>
      <button
        type="button"
        className="profile-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="profile-name">{username}</span>
      </button>

      {open && (
        <div className="profile-panel" role="dialog" aria-label="Your profile">
          <h2>{username}</h2>
          <ul className="profile-stats">
            <li>
              <span>best</span>
              <strong>
                {stats?.bestWpm != null ? `${stats.bestWpm} wpm` : '—'}
              </strong>
            </li>
            <li>
              <span>acc</span>
              <strong>
                {stats?.bestAccuracy != null ? `${stats.bestAccuracy}%` : '—'}
              </strong>
            </li>
            <li>
              <span>runs</span>
              <strong>{stats?.runCount ?? 0}</strong>
            </li>
            <li>
              <span>rank</span>
              <strong>{stats?.rank != null ? `#${stats.rank}` : '—'}</strong>
            </li>
          </ul>
          {stats?.modeLabel && (
            <p className="profile-mode">{stats.modeLabel}</p>
          )}
          <button
            type="button"
            className="profile-logout"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            log out
          </button>
        </div>
      )}
    </div>
  )
}
