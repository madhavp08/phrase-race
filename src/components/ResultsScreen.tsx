import type { PhraseAttempt, RoundStats, TestMode } from '../types'
import { AttemptReview } from './AttemptReview'

interface ResultsScreenProps {
  stats: RoundStats
  attempts: PhraseAttempt[]
  durationSec: number
  mode: TestMode
  rank: number | null
  onPlayAgain: () => void
  onOpenLeaderboard: () => void
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
  onPlayAgain,
  onOpenLeaderboard,
}: ResultsScreenProps) {
  return (
    <section className="results">
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
          ♛ placed #{rank} — view leaderboard
        </button>
      )}

      <div className="results-more">
        <div className="result-group">
          <div className="top">test type</div>
          <div className="bottom small">
            {mode === 'custom' ? 'custom' : `time ${durationSec}`}
            <br />
            english
            <br />
            speech
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
      </div>

      <div className="results-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onPlayAgain}
          title="Back to home"
        >
          <span aria-hidden="true">↻</span>
          <span>next test</span>
        </button>
        <button type="button" className="icon-btn" onClick={onOpenLeaderboard}>
          <span aria-hidden="true">♛</span>
          <span>leaderboard</span>
        </button>
      </div>

      <p className="keytip results-tip">
        <span>tab</span> — home
      </p>

      <AttemptReview attempts={attempts} />
    </section>
  )
}
