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
  customPhrase: string
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
  onSelectCustomDuration: () => void
  onCustomPhraseChange: (value: string) => void
  onShufflePhrase: () => void
  onStart: () => void
  onGoHome: () => void
}

export function TestScreen({
  words,
  wordIndex,
  mode,
  durationSec,
  customDuration,
  isCustomDuration,
  customPhrase,
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
  onSelectCustomDuration,
  onCustomPhraseChange,
  onShufflePhrase,
  onStart,
  onGoHome,
}: TestScreenProps) {
  return (
    <section className={`test-screen ${focused ? 'focused' : ''}`}>
      {!playing && (
        <ConfigBar
          mode={mode}
          durationSec={durationSec}
          customDuration={customDuration}
          isCustomDuration={isCustomDuration}
          customPhrase={customPhrase}
          disabled={playing}
          onModeChange={onModeChange}
          onDurationChange={onDurationChange}
          onCustomDurationChange={onCustomDurationChange}
          onSelectCustomDuration={onSelectCustomDuration}
          onCustomPhraseChange={onCustomPhraseChange}
          onShufflePhrase={onShufflePhrase}
        />
      )}

      <LiveStats
        timeLeftSec={mode === 'time' ? timeLeftSec : elapsedSec}
        wpm={wpm}
        accuracy={accuracy}
        visible={playing}
        showAsElapsed={mode === 'custom'}
      />

      <div className="typing-test">
        <div className="lang-row" aria-hidden="true">
          <span className="lang-pill">english</span>
        </div>

        <Words words={words} wordIndex={wordIndex} focused={true} />

        {!playing && (
          <p className="start-hint">
            {supported ? (
              <>
                <span>
                  press <span className="keychip">tab</span> to start
                </span>
                <span className="hint-or">or</span>
                <button
                  type="button"
                  className="text-btn primary"
                  onClick={onStart}
                >
                  click
                </button>
              </>
            ) : (
              'Microphone / MediaRecorder not supported in this browser'
            )}
          </p>
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
        onClick={onGoHome}
        title="Back to home"
      >
        ↻
      </button>

      <p className="keytip">
        <span>tab</span> — {playing ? 'home' : 'start'}
      </p>
    </section>
  )
}
