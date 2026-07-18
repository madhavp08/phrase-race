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
    <div className="live-stats-mini">
      <span className="live-time" title={showAsElapsed ? 'elapsed' : 'time left'}>
        {showAsElapsed ? `${timeLeftSec}s` : timeLeftSec}
      </span>
      <span className="live-wpm">{Number.isFinite(wpm) ? Math.round(wpm) : 0}</span>
      <span className="live-acc">
        {Number.isFinite(accuracy) ? Math.round(accuracy) : 0}%
      </span>
    </div>
  )
}
