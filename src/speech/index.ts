export {
  useSpeechRecognition,
  isSpeechRecognitionSupported,
} from './useSpeechRecognition'
export { requestMicrophonePermission, isMicrophoneSupported } from './mic'
export {
  DeepgramSpeechSession,
  buildDeepgramListenUrl,
  buildAuthProtocols,
} from './deepgramClient'
export { TranscriptAssembler } from './transcriptAssembler'
export { BenchmarkSession } from './benchmarkSession'
export { parseEnabledProviders, PRIMARY_PROVIDER_ID } from './constants'
export type {
  SpeechConnectionState,
  SpeechHandlers,
  STTProvider,
  TranscriptEvent,
  ModelResult,
  WordResult,
  ModelResultStatus,
} from './types'
