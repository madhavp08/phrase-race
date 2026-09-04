import type { ModelResult } from '../speech'
import type { PhraseAttempt, RoundStats, TestMode } from '../types'
import { AttemptReview } from './AttemptReview'
import { ModelResults } from './ModelResults'
import { ModelReview } from './ModelReview'

interface ResultsScreenProps {
  stats: RoundStats
  attempts: PhraseAttempt[]
  durationSec: number
  mode: TestMode
  rank: number | null
  judgeName: string | null
  modelResults: ModelResult[]
  saveError: string | null
  onPlayAgain: () => void
  onOpenLeaderboard: () => void
  onOpenModels: () => void
}

function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(digits)
}

export function ResultsScreen({
  stats,
  attempts,
  durationSec,
  mode,
  rank,
  judgeName,
  modelResults,
  saveError,
  onPlayAgain,
  onOpenLeaderboard,
  onOpenModels,
}: ResultsScreenProps) {
  return (
    <section className="results">
      <p className="results-kicker">your test</p>
      {judgeName && (
        <p className="results-judge">scored by {judgeName} · highest WPM this round</p>
      )}
      <div className="results-hero">
        <div className="result-group">
          <div className="top">wpm</div>
          <div className="bottom">{fmt(stats.netWpm, 0)}</div>
        </div>
        <div className="result-group">
          <div className="top">acc</div>
          <div className="bottom">{fmt(stats.accuracy, 0)}%</div>
        </div>
      </div>

      {rank !== null && (
        <button
          type="button"
          className="rank-banner"
          onClick={onOpenLeaderboard}
        >
          placed #{rank} — open board
        </button>
      )}

      <div className="results-more">
        <div className="result-group">
          <div className="top">test type</div>
          <div className="bottom small">
            {mode === 'custom' ? 'custom' : `time ${durationSec}`}
          </div>
        </div>
        <div className="result-group">
          <div className="top">raw</div>
          <div className="bottom">{fmt(stats.rawWpm, 0)}</div>
        </div>
        <div className="result-group">
          <div className="top">characters</div>
          <div className="bottom small chars">
            <span className="c-ok" title="correct">
              {stats.correctChars}
            </span>
            <span className="c-sep">/</span>
            <span className="c-bad" title="incorrect">
              {stats.incorrectChars}
            </span>
            <span className="c-sep">/</span>
            <span className="c-extra" title="extra">
              {stats.extraChars}
            </span>
            <span className="c-sep">/</span>
            <span className="c-miss" title="missed">
              {stats.missedChars}
            </span>
          </div>
        </div>
        <div className="result-group">
          <div className="top">words</div>
          <div className="bottom small">
            {stats.correctWords}/{stats.incorrectWords}
          </div>
        </div>
        <div className="result-group">
          <div className="top">streak</div>
          <div className="bottom">{stats.bestStreak}</div>
        </div>
        <div className="result-group">
          <div className="top">time</div>
          <div className="bottom">{durationSec}s</div>
        </div>
        <div className="result-group">
          <div className="top">consistency</div>
          <div className="bottom">{fmt(stats.consistency, 0)}%</div>
        </div>
        <div className="result-group">
          <div className="top">avg latency</div>
          <div className="bottom small">
            {fmt(stats.averageResponseTimeMs, 0)}ms
          </div>
        </div>
        <div className="result-group">
          <div className="top">word latency</div>
          <div className="bottom small">
            {stats.correctWords + stats.incorrectWords > 0
              ? `${fmt(stats.fastestWordMs, 0)}–${fmt(stats.slowestWordMs, 0)}ms`
              : '—'}
          </div>
        </div>
      </div>

      <div className="results-actions">
        <button
          type="button"
          className="icon-btn primary"
          onClick={onPlayAgain}
        >
          next test
        </button>
        <button type="button" className="icon-btn" onClick={onOpenLeaderboard}>
          leaderboard
        </button>
        <button type="button" className="icon-btn" onClick={onOpenModels}>
          models
        </button>
      </div>

      {saveError && <p className="error-line">{saveError}</p>}

      <ModelResults models={modelResults} judgeName={judgeName} />

      <p className="keytip results-tip">
        <span>tab</span> — home
      </p>

      <AttemptReview attempts={attempts} />
      <ModelReview models={modelResults} />
    </section>
  )
}
