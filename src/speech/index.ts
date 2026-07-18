export { useSpeechRecognition, isSpeechRecognitionSupported } from './useSpeechRecognition'
export { requestMicrophonePermission, isMicrophoneSupported } from './mic'
export {
  DeepgramSpeechSession,
  buildDeepgramListenUrl,
  buildAuthProtocol,
} from './deepgramClient'
export { TranscriptAssembler } from './transcriptAssembler'
export type { SpeechConnectionState, SpeechHandlers } from './types'
