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
  activeDuration: number
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
  onModeChange: (mode: TestMode) => void
  onDurationChange: (sec: number) => void
  onCustomDurationChange: (value: string) => void
  onSelectCustomDuration: () => void
  onCustomPhraseChange: (value: string) => void
  onShufflePhrase: () => void
  onStart: () => void
  onGoHome: () => void
}

function stageLabel(connectionState: SpeechConnectionState, playing: boolean) {
  if (!playing) return { text: 'ready to speak', live: false }
  if (connectionState === 'live') return { text: 'listening', live: true }
  if (connectionState === 'connecting') return { text: 'connecting', live: false }
  if (connectionState === 'reconnecting') {
    return { text: 'reconnecting', live: false }
  }
  return { text: 'starting mic', live: false }
}

export function TestScreen({
  words,
  wordIndex,
  mode,
  durationSec,
  activeDuration,
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
  onModeChange,
  onDurationChange,
  onCustomDurationChange,
  onSelectCustomDuration,
  onCustomPhraseChange,
  onShufflePhrase,
  onStart,
  onGoHome,
}: TestScreenProps) {
  const stage = stageLabel(connectionState, playing)

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
        <div className="stage-meta">
          <span className="stage-chip">
            <span
              className={`stage-chip-dot ${stage.live ? 'live' : ''}`}
              aria-hidden="true"
            />
            {stage.text}
          </span>
          <span className="stage-chip">
            {mode === 'custom' ? 'phrase' : `timed · ${activeDuration}s`}
          </span>
        </div>

        <Words words={words} wordIndex={wordIndex} />

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
                  start speaking
                </button>
              </>
            ) : (
              'Use a browser with microphone support'
            )}
          </p>
        )}

        {playing && connectionState === 'live' && (
          <p className="listening-hint live">keep talking through the stream</p>
        )}
        {playing && connectionState === 'connecting' && (
          <p className="listening-hint">connecting to Deepgram…</p>
        )}
        {playing && connectionState === 'reconnecting' && (
          <p className="listening-hint">reconnecting…</p>
        )}
      </div>

      {error && <p className="error-line">{error}</p>}

      <div className="footer-row">
        <button type="button" className="restart-btn" onClick={onGoHome}>
          {playing ? 'end round' : 'reset'}
        </button>
        <p className="keytip">
          <span>tab</span> — {playing ? 'home' : 'start'}
        </p>
      </div>
    </section>
  )
}
