import type { WordState } from '../types'
import { ConfigBar } from './ConfigBar'
import { LiveStats } from './LiveStats'
import { Words } from './Words'

interface TestScreenProps {
  words: WordState[]
  wordIndex: number
  durationSec: number
  timeLeftSec: number
  wpm: number
  accuracy: number
  playing: boolean
  focused: boolean
  listening: boolean
  supported: boolean
  error: string | null
  onDurationChange: (sec: number) => void
  onStart: () => void
  onRestart: () => void
}

export function TestScreen({
  words,
  wordIndex,
  durationSec,
  timeLeftSec,
  wpm,
  accuracy,
  playing,
  focused,
  listening,
  supported,
  error,
  onDurationChange,
  onStart,
  onRestart,
}: TestScreenProps) {
  return (
    <section className={`test-screen ${focused ? 'focused' : ''}`}>
      {!playing && (
        <ConfigBar
          durationSec={durationSec}
          onDurationChange={onDurationChange}
          disabled={playing}
        />
      )}

      <LiveStats
        timeLeftSec={timeLeftSec}
        wpm={wpm}
        accuracy={accuracy}
        visible={playing}
      />

      <div className="typing-test">
        <Words words={words} wordIndex={wordIndex} focused={focused || playing} />

        {!playing && (
          <button
            type="button"
            className="focus-overlay"
            onClick={onStart}
            disabled={!supported}
          >
            {supported
              ? 'Click here to speak'
              : 'Use Chrome for speech recognition'}
          </button>
        )}

        {playing && !listening && !error && (
          <p className="listening-hint">Starting microphone…</p>
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
