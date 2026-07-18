import type { LeaderboardEntry } from '../data/leaderboard'

interface LeaderboardProps {
  open: boolean
  board: LeaderboardEntry[]
  highlightRank?: number | null
  onClose: () => void
}

export function Leaderboard({
  open,
  board,
  highlightRank,
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
          <h2>
            <span aria-hidden="true">♛</span> leaderboard
          </h2>
          <button type="button" className="lb-close" onClick={onClose}>
            esc
          </button>
        </header>
        <p className="lb-sub">local demo board — no account needed</p>
        <ol className="lb-list">
          {board.map((entry, index) => {
            const rank = index + 1
            return (
              <li
                key={entry.id}
                className={[
                  entry.isYou ? 'you' : '',
                  highlightRank === rank ? 'flash' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="lb-rank">{rank}</span>
                <span className="lb-name">
                  {entry.name}
                  {entry.isYou ? ' (you)' : ''}
                </span>
                <span className="lb-mode">{entry.modeLabel}</span>
                <span className="lb-wpm">{entry.wpm}</span>
                <span className="lb-acc">{entry.accuracy}%</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
