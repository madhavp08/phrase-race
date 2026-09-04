export interface ModelSummaryRow {
  provider: string
  model: string
  testType: string
  runs: number
  validRuns: number
  avgCharacterAccuracy: number | null
  avgCer: number | null
  avgWer: number | null
  avgModelNetWpm: number | null
  medianOfMedianLatencyMs: number | null
  p95OfMedianLatencyMs: number | null
}
