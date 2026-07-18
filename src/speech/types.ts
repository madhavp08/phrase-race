export type SpeechConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'errored'

export interface SpeechHandlers {
  /** Current interim hypothesis for live letter feedback. */
  onLive?: (hypothesis: string) => void
  /** Newly finalized transcript segment for scoring/commit. */
  onFinal?: (transcript: string) => void
  onError?: (message: string) => void
  onStateChange?: (state: SpeechConnectionState) => void
}

export interface DeepgramTokenResponse {
  access_token: string
  expires_in: number
}
