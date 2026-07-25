interface LiveStatsProps {
  timeLeftSec: number
  wpm: number
  accuracy: number
  visible: boolean
  showAsElapsed?: boolean
}

export function LiveStats({
  timeLeftSec,
  wpm,
  accuracy,
  visible,
  showAsElapsed = false,
}: LiveStatsProps) {
  if (!visible) return null

  return (
    <div className="live-stats-mini" aria-live="polite">
      <div className="live-stat">
        <span className="live-stat-label">
          {showAsElapsed ? 'elapsed' : 'left'}
        </span>
        <span className="live-stat-value">
          {showAsElapsed ? `${timeLeftSec}s` : timeLeftSec}
        </span>
      </div>
      <div className="live-stat">
        <span className="live-stat-label">wpm</span>
        <span className="live-stat-value">
          {Number.isFinite(wpm) ? Math.round(wpm) : 0}
        </span>
      </div>
      <div className="live-stat">
        <span className="live-stat-label">acc</span>
        <span className="live-stat-value">
          {Number.isFinite(accuracy) ? Math.round(accuracy) : 0}%
        </span>
      </div>
    </div>
  )
}
