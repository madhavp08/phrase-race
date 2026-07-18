import type { PhraseAttempt } from '../types'

interface AttemptReviewProps {
  attempts: PhraseAttempt[]
}

export function AttemptReview({ attempts }: AttemptReviewProps) {
  if (attempts.length === 0) {
    return <p className="muted">No words spoken this round.</p>
  }

  return (
    <div className="attempt-review">
      <h2>word history</h2>
      <ul className="attempt-list">
        {attempts.map((attempt, index) => (
          <li
            key={`${attempt.prompt}-${index}`}
            className={attempt.correct ? 'ok' : 'miss'}
          >
            <span className="attempt-expected">{attempt.prompt}</span>
            <span className="attempt-arrow">→</span>
            <span className="attempt-heard">
              {attempt.transcript || '(empty)'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
