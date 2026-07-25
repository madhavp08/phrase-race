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
      <span title={showAsElapsed ? 'elapsed' : 'time left'}>
        {showAsElapsed ? `${timeLeftSec}s` : timeLeftSec}
      </span>
      <span title="wpm">{Number.isFinite(wpm) ? Math.round(wpm) : 0}</span>
      <span title="accuracy">
        {Number.isFinite(accuracy) ? Math.round(accuracy) : 0}%
      </span>
    </div>
  )
}
