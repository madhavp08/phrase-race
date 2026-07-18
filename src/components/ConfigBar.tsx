import type { TestMode } from '../types'

const PRESET_DURATIONS = [15, 30, 60] as const

interface ConfigBarProps {
  mode: TestMode
  durationSec: number
  customDuration: string
  isCustomDuration: boolean
  customPhrase: string
  disabled?: boolean
  onModeChange: (mode: TestMode) => void
  onDurationChange: (sec: number) => void
  onCustomDurationChange: (value: string) => void
  onSelectCustomDuration: () => void
  onCustomPhraseChange: (value: string) => void
  onShufflePhrase: () => void
}

export function ConfigBar({
  mode,
  durationSec,
  customDuration,
  isCustomDuration,
  customPhrase,
  disabled,
  onModeChange,
  onDurationChange,
  onCustomDurationChange,
  onSelectCustomDuration,
  onCustomPhraseChange,
  onShufflePhrase,
}: ConfigBarProps) {
  return (
    <div className="config">
      <div className="config-bar">
        <div className="config-card">
          <button
            type="button"
            className={`config-mode ${mode === 'time' ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange('time')}
          >
            <span className="config-ico" aria-hidden="true">
              ⏱
            </span>
            time
          </button>
          <button
            type="button"
            className={`config-mode ${mode === 'custom' ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange('custom')}
          >
            <span className="config-ico" aria-hidden="true">
              🔧
            </span>
            custom
          </button>
        </div>

        {mode === 'time' && (
          <div className="config-card">
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
              className={`config-mode icon-only ${isCustomDuration ? 'active' : ''}`}
              disabled={disabled}
              onClick={onSelectCustomDuration}
              title="Custom time"
            >
              🔧
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

        {mode === 'custom' && (
          <div className="config-card">
            <button
              type="button"
              className="config-mode"
              disabled={disabled}
              onClick={onShufflePhrase}
              title="New tongue twister"
            >
              <span className="config-ico" aria-hidden="true">
                ↻
              </span>
              new
            </button>
            <span className="config-hint">tongue twister</span>
          </div>
        )}
      </div>

      {mode === 'custom' && (
        <label className="custom-phrase-field">
          <span className="custom-phrase-label">phrase</span>
          <input
            type="text"
            value={customPhrase}
            disabled={disabled}
            onChange={(event) => onCustomPhraseChange(event.target.value)}
            placeholder="type or paste any phrase…"
            spellCheck={false}
          />
        </label>
      )}
    </div>
  )
}
