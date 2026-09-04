import { useEffect, useState } from 'react'
import type { ModelSummaryRow } from '../core/modelSummary'

interface ModelBoardProps {
  open: boolean
  onClose: () => void
}

interface SummaryResponse {
  models?: ModelSummaryRow[]
  error?: string
}

function fmt(value: number | null, digits = 1, suffix = ''): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}${suffix}`
}

export function ModelBoard({ open, onClose }: ModelBoardProps) {
  const [rows, setRows] = useState<ModelSummaryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void fetch('/api/models/summary', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = (await response.json()) as SummaryResponse
        if (cancelled) return
        setRows(body.models ?? [])
        setError(body.error ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load')
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  return (
    <div className="lb-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lb-panel model-board"
        role="dialog"
        aria-label="Model comparison"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lb-header">
          <div>
            <p className="lb-kicker">aggregate</p>
            <h2>model comparison</h2>
          </div>
          <button type="button" className="lb-close" onClick={onClose}>
            close
          </button>
        </div>

        {loading && <p className="muted">loading…</p>}
        {error && <p className="error-line">{error}</p>}
        {!loading && rows.length === 0 && !error && (
          <p className="muted">No saved benchmark runs yet.</p>
        )}

        {rows.length > 0 && (
          <>
            <div className="mb-cols">
              <span>model</span>
              <span>type</span>
              <span>n</span>
              <span>acc</span>
              <span>wpm</span>
              <span>wer</span>
              <span>latency</span>
            </div>
            <ul className="mb-list">
              {rows.map((row) => (
                <li key={`${row.provider}-${row.model}-${row.testType}`}>
                  <span>{row.provider}</span>
                  <span className="lb-mode">{row.testType}</span>
                  <span>{row.validRuns}</span>
                  <span>{fmt(row.avgCharacterAccuracy, 1, '%')}</span>
                  <span>{fmt(row.avgModelNetWpm, 0)}</span>
                  <span>{fmt(row.avgWer, 2)}</span>
                  <span>{fmt(row.medianOfMedianLatencyMs, 0, 'ms')}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="lb-foot">
          Aggregates only include status=valid rows. Numbers are measured, not
          claimed.
        </p>
      </div>
    </div>
  )
}
