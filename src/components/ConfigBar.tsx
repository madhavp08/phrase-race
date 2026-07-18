const DURATIONS = [15, 30, 60] as const

interface ConfigBarProps {
  durationSec: number
  onDurationChange: (sec: number) => void
  disabled?: boolean
}

export function ConfigBar({
  durationSec,
  onDurationChange,
  disabled,
}: ConfigBarProps) {
  return (
    <div className="config-bar">
      <div className="config-group">
        <span className="config-mode active">time</span>
      </div>
      <div className="config-group">
        {DURATIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            className={`config-mode ${durationSec === sec ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onDurationChange(sec)}
          >
            {sec}
          </button>
        ))}
      </div>
    </div>
  )
}
