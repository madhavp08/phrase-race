import type { SpeechConnectionState } from '../speech'
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
  connectionState: SpeechConnectionState
  supported: boolean
  error: string | null
  heardLog: string[]
  liveHypothesis: string
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
  connectionState,
  supported,
  error,
  heardLog,
  liveHypothesis,
  onModeChange,
  onDurationChange,
  onCustomDurationChange,
  onSelectCustomDuration,
  onCustomPhraseChange,
  onShufflePhrase,
  onStart,
  onGoHome,
}: TestScreenProps) {
  // Keep the heard box to roughly the last two lines of speech.
  const committed = heardLog.join(' ').split(/\s+/).filter(Boolean)
  const recentCommitted = committed.slice(-14).join(' ')

  return (
    <section className={`test-screen ${playing ? 'focused' : ''}`}>
      {!playing && (
        <ConfigBar
          mode={mode}
          durationSec={durationSec}
          customDuration={customDuration}
          isCustomDuration={isCustomDuration}
          customPhrase={customPhrase}
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
        <div className="prompt-label">say this</div>
        <Words words={words} wordIndex={wordIndex} />

        {playing && (
          <div className="heard-box" aria-live="polite">
            <div className="heard-label">
              {connectionState === 'live'
                ? 'hearing…'
                : connectionState === 'reconnecting'
                  ? 'reconnecting…'
                  : 'connecting…'}
            </div>
            <p className="heard-text">
              {recentCommitted && (
                <span className="heard-final">{recentCommitted} </span>
              )}
              {liveHypothesis && (
                <span className="heard-live">{liveHypothesis}</span>
              )}
              {!recentCommitted && !liveHypothesis && (
                <span className="heard-empty">start speaking…</span>
              )}
            </p>
          </div>
        )}

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
                  click here
                </button>
              </>
            ) : (
              'Use a browser with microphone support'
            )}
          </p>
        )}

      </div>

      {error && <p className="error-line">{error}</p>}

      <div className="footer-row">
        <button type="button" className="restart-btn" onClick={onGoHome}>
          {playing ? 'end round' : 'restart'}
        </button>
        <p className="keytip">
          <span>tab</span> — {playing ? 'home' : 'start'}
        </p>
      </div>
    </section>
  )
}
