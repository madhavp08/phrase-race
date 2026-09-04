import type { ModelResult } from '../speech'

function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

interface ModelResultsProps {
  models: ModelResult[]
}

export function ModelResults({ models }: ModelResultsProps) {
  if (models.length === 0) return null

  return (
    <div className="model-results">
      <h2>model results</h2>
      <p className="model-caption">
        Same 16 kHz audio, scored independently. Latency is end-to-end (last
        sent PCM chunk → transcript event), not isolated model time.
      </p>
      <div className="model-table" role="table">
        <div className="model-cols" role="row">
          <span>model</span>
          <span>acc</span>
          <span>cer</span>
          <span>wer</span>
          <span>adj. wpm</span>
          <span>median</span>
        </div>
        <ul>
          {models.map((model) => (
            <li
              key={model.provider}
              className={model.status === 'valid' ? 'ok' : 'fail'}
            >
              <span className="model-name">
                {model.name}
                {model.status !== 'valid' && (
                  <em title={model.error}>{model.status.replace('_', ' ')}</em>
                )}
              </span>
              {model.status === 'valid' ? (
                <>
                  <span>{fmt(model.characterAccuracy, 1)}%</span>
                  <span>{fmt(model.cer, 2)}</span>
                  <span>{fmt(model.wer, 2)}</span>
                  <span title="Model-adjusted from CER, not speaking speed">
                    {fmt(model.modelNetWpm, 0)}
                  </span>
                  <span>{fmt(model.medianWordLatencyMs, 0)}ms</span>
                </>
              ) : (
                <span className="model-fail-msg">{model.error || 'no result'}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
