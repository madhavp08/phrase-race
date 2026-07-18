import type { TestMode, WordState } from '../types'
import { ConfigBar } from './ConfigBar'
import { LiveStats } from './LiveStats'
import { Words } from './Words'

interface TestScreenProps {
  words: WordState[]
  wordIndex: number
  mode: TestMode
  durationSec: number
  customDuration: string
  isCustomDuration: boolean
  timeLeftSec: number
  elapsedSec: number
  wpm: number
  accuracy: number
  playing: boolean
  focused: boolean
  listening: boolean
  supported: boolean
  error: string | null
  onModeChange: (mode: TestMode) => void
  onDurationChange: (sec: number) => void
  onCustomDurationChange: (value: string) => void
  onSelectCustom: () => void
  onStart: () => void
  onRestart: () => void
}

export function TestScreen({
  words,
  wordIndex,
  mode,
  durationSec,
  customDuration,
  isCustomDuration,
  timeLeftSec,
  elapsedSec,
  wpm,
  accuracy,
  playing,
  focused,
  listening,
  supported,
  error,
  onModeChange,
  onDurationChange,
  onCustomDurationChange,
  onSelectCustom,
  onStart,
  onRestart,
}: TestScreenProps) {
  return (
    <section className={`test-screen ${focused ? 'focused' : ''}`}>
      {!playing && (
        <ConfigBar
          mode={mode}
          durationSec={durationSec}
          customDuration={customDuration}
          isCustomDuration={isCustomDuration}
          disabled={playing}
          onModeChange={onModeChange}
          onDurationChange={onDurationChange}
          onCustomDurationChange={onCustomDurationChange}
          onSelectCustom={onSelectCustom}
        />
      )}

      <LiveStats
        timeLeftSec={mode === 'time' ? timeLeftSec : elapsedSec}
        wpm={wpm}
        accuracy={accuracy}
        visible={playing}
        showAsElapsed={mode === 'phrase'}
      />

      <div className="typing-test">
        <Words
          words={words}
          wordIndex={wordIndex}
          focused={focused || playing}
        />

        {!playing && (
          <button
            type="button"
            className="focus-overlay"
            onClick={onStart}
            disabled={!supported}
          >
            {supported
              ? mode === 'phrase'
                ? 'Click to race a tongue twister'
                : 'Click here to speak'
              : 'Use Chrome for speech recognition'}
          </button>
        )}

        {playing && listening && (
          <p className="listening-hint live">listening — keep talking</p>
        )}
        {playing && !listening && !error && (
          <p className="listening-hint">reconnecting mic…</p>
        )}
      </div>

      {error && <p className="error-line">{error}</p>}

      <button
        type="button"
        className="restart-btn"
        onClick={onRestart}
        title="Restart test"
      >
        ↻
      </button>

      <p className="keytip">
        <span>tab</span> + <span>enter</span> — restart test
      </p>
    </section>
  )
}
