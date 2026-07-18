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
          <div>
            <p className="lb-kicker">all-time</p>
            <h2>
              <span className="lb-crown" aria-hidden="true">
                ♛
              </span>
              leaderboard
            </h2>
          </div>
          <button type="button" className="lb-close" onClick={onClose}>
            esc
          </button>
        </header>

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
                  {entry.name}
                  {entry.isYou ? <em>you</em> : null}
                </span>
                <span className="lb-mode">{entry.modeLabel}</span>
                <span className="lb-wpm">{entry.wpm}</span>
                <span className="lb-acc">{entry.accuracy}%</span>
              </li>
            )
          })}
        </ol>

        <p className="lb-foot">demo board · scores saved on this device</p>
      </div>
    </div>
  )
}
