import type { LeaderboardEntry } from '../data/leaderboard'

interface LeaderboardProps {
  open: boolean
  board: LeaderboardEntry[]
  highlightRank?: number | null
  error?: string | null
  onClose: () => void
}

export function Leaderboard({
  open,
  board,
  highlightRank,
  error,
  onClose,
}: LeaderboardProps) {
  if (!open) return null

  return (
    <div className="lb-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lb-panel"
        role="dialog"
        aria-label="Leaderboard"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lb-header">
          <h2>leaderboard</h2>
          <button type="button" className="lb-close" onClick={onClose}>
            close
          </button>
        </header>

        {error && <p className="error-line">{error}</p>}

        {!error && board.length === 0 && (
          <p className="muted">No scores yet.</p>
        )}

        {board.length > 0 && (
          <>
            <div className="lb-cols" aria-hidden="true">
              <span>#</span>
              <span>name</span>
              <span>mode</span>
              <span>wpm</span>
              <span>acc</span>
            </div>

            <ol className="lb-list">
              {board.map((entry, index) => {
                const rank = index + 1
                return (
                  <li
                    key={`${entry.id}-${rank}`}
                    className={[
                      entry.isYou ? 'you' : '',
                      highlightRank === rank ? 'flash' : '',
                      rank <= 3 ? `top-${rank}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="lb-rank">{rank}</span>
                    <span className="lb-name">
                      {entry.username}
                      {entry.isYou ? <em>you</em> : null}
                    </span>
                    <span className="lb-mode">{entry.modeLabel}</span>
                    <span className="lb-wpm">{entry.wpm}</span>
                    <span className="lb-acc">{entry.accuracy}%</span>
                  </li>
                )
              })}
            </ol>
          </>
        )}

      </div>
    </div>
  )
}
