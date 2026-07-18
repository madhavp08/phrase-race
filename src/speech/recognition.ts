export type SpeechRecognitionConstructor = new () => SpeechRecognition

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
  return true
}

export interface SpeechRecognitionHandlers {
  onInterim?: (transcript: string) => void
  onFinal: (transcript: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
}

export function createSpeechRecognition(
  handlers: SpeechRecognitionHandlers,
): SpeechRecognition {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
  if (!SpeechRecognitionCtor) {
    throw new Error('Web Speech API is not supported. Please use Chrome.')
  }

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = 'en-US'
  // Continuous stream — Monkeytype-style: keep going, don't stop per phrase.
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = ''
    let final = ''

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript

      if (event.results[i].isFinal) {
        final += `${transcript} `
      } else {
        interim += transcript
      }
    }

    handlers.onInterim?.(interim)

    if (final.trim()) {
      handlers.onFinal(final.trim())
    }
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'not-allowed') {
      handlers.onError?.('Microphone permission was denied.')
    } else if (event.error === 'no-speech') {
      // Common in continuous mode — keep listening via onend restart.
    } else if (event.error === 'aborted') {
      // Expected when stopping a round.
    } else {
      handlers.onError?.(`Speech recognition failed: ${event.error}`)
    }
  }

  recognition.onend = () => {
    handlers.onEnd?.()
  }

  return recognition
}
