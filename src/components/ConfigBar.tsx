import type { TestMode } from '../types'

const PRESET_DURATIONS = [15, 30, 60] as const

interface ConfigBarProps {
  mode: TestMode
  durationSec: number
  customDuration: string
  isCustomDuration: boolean
  disabled?: boolean
  onModeChange: (mode: TestMode) => void
  onDurationChange: (sec: number) => void
  onCustomDurationChange: (value: string) => void
  onSelectCustom: () => void
}

export function ConfigBar({
  mode,
  durationSec,
  customDuration,
  isCustomDuration,
  disabled,
  onModeChange,
  onDurationChange,
  onCustomDurationChange,
  onSelectCustom,
}: ConfigBarProps) {
  return (
    <div className="config-bar">
      <div className="config-group">
        <button
          type="button"
          className={`config-mode ${mode === 'time' ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => onModeChange('time')}
        >
          time
        </button>
        <button
          type="button"
          className={`config-mode ${mode === 'phrase' ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => onModeChange('phrase')}
        >
          phrase
        </button>
      </div>

      {mode === 'time' && (
        <div className="config-group">
          {PRESET_DURATIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              className={`config-mode ${
                !isCustomDuration && durationSec === sec ? 'active' : ''
              }`}
              disabled={disabled}
              onClick={() => onDurationChange(sec)}
            >
              {sec}
            </button>
          ))}
          <button
            type="button"
            className={`config-mode ${isCustomDuration ? 'active' : ''}`}
            disabled={disabled}
            onClick={onSelectCustom}
          >
            custom
          </button>
          {isCustomDuration && (
            <input
              className="custom-time-input"
              type="number"
              min={5}
              max={600}
              inputMode="numeric"
              value={customDuration}
              disabled={disabled}
              onChange={(event) => onCustomDurationChange(event.target.value)}
              aria-label="Custom duration in seconds"
            />
          )}
        </div>
      )}

      {mode === 'phrase' && (
        <div className="config-group">
          <span className="config-hint">tongue twister</span>
        </div>
      )}
    </div>
  )
}
