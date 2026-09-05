import type { SpeechConnectionState } from '../speech'
import type { TestMode, WordState } from '../types'
import { ConfigBar } from './ConfigBar'
import { LiveStats } from './LiveStats'
import { Words } from './Words'

interface TestScreenProps {
  words: WordState[]
  wordIndex: number
  paceIndex?: number
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
  liveProviderCount: number
  enabledProviderCount: number
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
  paceIndex = 0,
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
  liveProviderCount,
  enabledProviderCount,
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
        <Words words={words} wordIndex={wordIndex} paceIndex={paceIndex} />

        {playing && (
          <div className="heard-box" aria-live="polite">
            <div className="heard-label">
              {connectionState === 'live'
                ? enabledProviderCount > 1
                  ? `hearing · ${liveProviderCount}/${enabledProviderCount} models`
                  : 'hearing…'
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
                <span className="heard-empty">…</span>
              )}
            </p>
          </div>
        )}

        {!playing && (
          <p className="start-hint">
            {supported ? (
              <button
                type="button"
                className="text-btn primary"
                onClick={onStart}
              >
                start
              </button>
            ) : (
              'Microphone required'
            )}
          </p>
        )}

      </div>

      {error && <p className="error-line">{error}</p>}

      <div className="footer-row">
        <button type="button" className="restart-btn" onClick={onGoHome}>
          {playing ? 'end' : 'restart'}
        </button>
      </div>
    </section>
  )
}
