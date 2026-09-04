import { DeepgramSpeechSession } from './deepgramClient'
import { ElevenLabsSpeechSession } from './elevenlabsClient'
import { OpenAISpeechSession } from './openaiClient'
import type { ProviderId } from './constants'
import type { ProviderHandlers, STTProvider } from './types'

export function createProvider(
  id: ProviderId,
  handlers: ProviderHandlers,
): STTProvider {
  switch (id) {
    case 'deepgram':
      return new DeepgramSpeechSession(handlers)
    case 'openai':
      return new OpenAISpeechSession(handlers)
    case 'elevenlabs':
      return new ElevenLabsSpeechSession(handlers)
  }
}
