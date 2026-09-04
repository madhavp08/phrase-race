export type SpeechConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'errored'

export interface TranscriptWord {
  word: string
  start?: number
  end?: number
  confidence?: number
}

/** Vendor-normalized streaming event. Benchmark scoring must not branch on provider. */
export interface TranscriptEvent {
  provider: string
  model: string
  text: string
  isFinal: boolean
  receivedAt: number
  words?: TranscriptWord[]
}

export interface ProviderHandlers {
  onEvent: (event: TranscriptEvent) => void
  onError?: (message: string) => void
  onStateChange?: (state: SpeechConnectionState) => void
}

export interface STTProvider {
  readonly id: string
  readonly name: string
  readonly model: string
  connect(): Promise<void>
  sendAudio(chunk: ArrayBuffer): void
  close(): Promise<void>
  getState(): SpeechConnectionState
  getConfig(): Record<string, unknown>
}

/** React / game-facing callbacks (primary stream only). */
export interface SpeechHandlers {
  onLive?: (hypothesis: string) => void
  onFinal?: (transcript: string) => void
  onError?: (message: string) => void
  onStateChange?: (state: SpeechConnectionState) => void
}

export interface DeepgramTokenResponse {
  access_token: string
  expires_in: number
}

export type ModelResultStatus =
  | 'valid'
  | 'provider_failure'
  | 'client_failure'

export interface WordResult {
  expected: string
  heard: string
  correct: boolean
  interimLatencyMs: number | null
  finalLatencyMs: number | null
}

export interface ModelResult {
  provider: string
  model: string
  name: string
  transcript: string
  characterAccuracy: number
  cer: number
  wer: number
  modelNetWpm: number
  medianWordLatencyMs: number
  p95WordLatencyMs: number
  wordResults: WordResult[]
  status: ModelResultStatus
  error?: string
  config: Record<string, unknown>
}
