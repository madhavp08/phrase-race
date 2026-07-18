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
  /** Live hypothesis — updates as the user speaks (interim + uncommitted). */
  onLive?: (hypothesis: string) => void
  /** Newly finalized transcript segment from Chrome. */
  onFinal: (transcript: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
}

/**
 * Chrome Web Speech wrapper.
 * Rebuilds the full live hypothesis on every result so the UI can paint
 * letter mistakes while the user is still talking (not only after a pause).
 */
export function createSpeechRecognition(
  handlers: SpeechRecognitionHandlers,
): SpeechRecognition {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
  if (!SpeechRecognitionCtor) {
    throw new Error('Web Speech API is not supported. Please use Chrome.')
  }

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = 'en-US'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let processedFinalCount = 0

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let live = ''
    let newFinal = ''

    for (let i = 0; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        if (i >= processedFinalCount) {
          newFinal += `${transcript} `
        }
      } else {
        live += transcript
      }
    }

    // Count finals currently in the result buffer.
    let finalCount = 0
    for (let i = 0; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) finalCount += 1
    }
    processedFinalCount = finalCount

    // Live agent sees non-final speech immediately.
    handlers.onLive?.(live)

    if (newFinal.trim()) {
      handlers.onFinal(newFinal.trim())
    }
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'not-allowed') {
      handlers.onError?.('Microphone permission was denied.')
    } else if (event.error === 'no-speech' || event.error === 'aborted') {
      // Common in continuous mode — restarted via onend.
    } else if (event.error === 'network') {
      handlers.onError?.(
        'Speech service network error. Check connection and try again.',
      )
    } else {
      handlers.onError?.(`Speech recognition failed: ${event.error}`)
    }
  }

  recognition.onend = () => {
    // Result buffer clears when recognition restarts.
    processedFinalCount = 0
    handlers.onEnd?.()
  }

  return recognition
}
