import type { ModelResult } from '../speech'

interface ModelReviewProps {
  models: ModelResult[]
}

export function ModelReview({ models }: ModelReviewProps) {
  const valid = models.filter(
    (model) => model.status === 'valid' && model.wordResults.length > 0,
  )
  if (valid.length === 0) return null

  const rowCount = Math.max(...valid.map((model) => model.wordResults.length))
  const rows = Array.from({ length: rowCount }, (_, index) => index)

  return (
    <div className="attempt-review model-review">
      <h2>what each model heard</h2>
      <div className="model-review-scroll">
        <table className="model-review-table">
          <thead>
            <tr>
              <th>expected</th>
              {valid.map((model) => (
                <th key={model.provider}>{model.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((index) => {
              const expected =
                valid.map((model) => model.wordResults[index]?.expected).find(
                  Boolean,
                ) ?? ''
              return (
                <tr key={`${expected}-${index}`}>
                  <td>{expected || '—'}</td>
                  {valid.map((model) => {
                    const word = model.wordResults[index]
                    if (!word) return <td key={model.provider}>—</td>
                    const latency =
                      word.finalLatencyMs !== null
                        ? `${Math.round(word.finalLatencyMs)}ms`
                        : ''
                    return (
                      <td
                        key={model.provider}
                        className={word.correct ? 'ok' : 'miss'}
                      >
                        <span>{word.heard || '(empty)'}</span>
                        {latency && (
                          <span className="attempt-latency">{latency}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
