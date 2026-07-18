import type { PhraseAttempt, RoundStats } from '../types'
import { AttemptReview } from './AttemptReview'

interface ResultsScreenProps {
  stats: RoundStats
  attempts: PhraseAttempt[]
  durationSec: number
  onPlayAgain: () => void
}

function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(digits)
}

export function ResultsScreen({
  stats,
  attempts,
  durationSec,
  onPlayAgain,
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

      <div className="results-more">
        <div className="result-group">
          <div className="top">test type</div>
          <div className="bottom small">
            time {durationSec}
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
          <div className="bottom small">
            {stats.correctChars}/{stats.incorrectChars}
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
        <button type="button" className="icon-btn" onClick={onPlayAgain} title="Next test">
          <span aria-hidden="true">↻</span>
          <span>next test</span>
        </button>
      </div>

      <AttemptReview attempts={attempts} />
    </section>
  )
}
