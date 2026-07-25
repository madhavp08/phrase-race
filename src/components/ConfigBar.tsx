import type { TestMode } from '../types'

const PRESET_DURATIONS = [15, 30, 60] as const

interface ConfigBarProps {
  mode: TestMode
  durationSec: number
  customDuration: string
  isCustomDuration: boolean
  customPhrase: string
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
        <div className="config-card" role="group" aria-label="Mode">
          <button
            type="button"
            className={`config-mode ${mode === 'time' ? 'active' : ''}`}
            onClick={() => onModeChange('time')}
          >
            timed
          </button>
          <button
            type="button"
            className={`config-mode ${mode === 'custom' ? 'active' : ''}`}
            onClick={() => onModeChange('custom')}
          >
            phrase
          </button>
        </div>

        {mode === 'time' && (
          <div className="config-card" role="group" aria-label="Duration">
            {PRESET_DURATIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                className={`config-mode ${
                  !isCustomDuration && durationSec === sec ? 'active' : ''
                }`}
                onClick={() => onDurationChange(sec)}
              >
                {sec}s
              </button>
            ))}
            <button
              type="button"
              className={`config-mode icon-only ${isCustomDuration ? 'active' : ''}`}
              onClick={onSelectCustomDuration}
              title="Custom duration"
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
              onClick={onShufflePhrase}
              title="New tongue twister"
            >
              shuffle
            </button>
            <span className="config-hint">tongue twister or paste your own</span>
          </div>
        )}
      </div>

      {mode === 'custom' && (
        <label className="custom-phrase-field">
          <span className="custom-phrase-label">phrase</span>
          <input
            type="text"
            value={customPhrase}
            onChange={(event) => onCustomPhraseChange(event.target.value)}
            placeholder="type or paste any phrase…"
            spellCheck={false}
          />
        </label>
      )}
    </div>
  )
}
