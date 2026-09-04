import type { TestMode } from '../types'

const PRESET_DURATIONS = [15, 30, 60, 120] as const

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
  const durationValue = isCustomDuration ? customDuration : String(durationSec)

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

        <div className="config-card" role="group" aria-label="Duration">
          {PRESET_DURATIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              className={`config-mode ${
                mode === 'time' && !isCustomDuration && durationSec === sec
                  ? 'active'
                  : ''
              }`}
              onClick={() => onDurationChange(sec)}
            >
              {sec}
            </button>
          ))}
          <input
            className={`custom-time-input ${
              mode === 'time' && isCustomDuration ? 'active' : ''
            }`}
            type="number"
            min={5}
            max={600}
            inputMode="numeric"
            value={durationValue}
            onChange={(event) => onCustomDurationChange(event.target.value)}
            onFocus={() => {
              if (!isCustomDuration) onSelectCustomDuration()
            }}
            aria-label="Duration in seconds"
            title="seconds"
          />
          <span className="config-hint">s</span>
        </div>

        {mode === 'custom' && (
          <div className="config-card">
            <button
              type="button"
              className="config-mode"
              onClick={onShufflePhrase}
              title="New phrase"
            >
              shuffle
            </button>
            <span className="config-hint">paste your own or shuffle</span>
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
