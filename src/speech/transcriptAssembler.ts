/**
 * Assembles Deepgram streaming Results / UtteranceEnd into:
 * - interim hypothesis (for live UI)
 * - finalized segments (for scoring)
 *
 * Commit rules (Deepgram end-of-speech guidance):
 * 1. `is_final=true` with text → commit immediately (responsive word advances)
 * 2. `UtteranceEnd` with leftover interim and no recent final → flush interim
 * 3. Deduplicate identical consecutive finals (reconnect / duplicate frames)
 */

export interface AssemblerHandlers {
  onLive: (hypothesis: string) => void
  onFinal: (transcript: string) => void
}

interface DeepgramAlternative {
  transcript?: string
}

interface DeepgramResultsMessage {
  type: 'Results'
  is_final?: boolean
  speech_final?: boolean
  channel?: {
    alternatives?: DeepgramAlternative[]
  }
}

type DeepgramMessage =
  | DeepgramResultsMessage
  | { type: 'UtteranceEnd' }
  | { type: string }

export class TranscriptAssembler {
  private latestInterim = ''
  private pendingInterimForUtteranceEnd = false
  private lastFinalNormalized = ''
  private handlers: AssemblerHandlers

  constructor(handlers: AssemblerHandlers) {
    this.handlers = handlers
  }

  reset() {
    this.latestInterim = ''
    this.pendingInterimForUtteranceEnd = false
    this.lastFinalNormalized = ''
    this.handlers.onLive('')
  }

  handleMessage(raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const message = raw as DeepgramMessage

    if (message.type === 'Results') {
      this.handleResults(message as DeepgramResultsMessage)
      return
    }

    if (message.type === 'UtteranceEnd') {
      this.handleUtteranceEnd()
    }
  }

  private handleResults(message: DeepgramResultsMessage) {
    const transcript = message.channel?.alternatives?.[0]?.transcript ?? ''
    const trimmed = transcript.trim()
    const isFinal = Boolean(message.is_final)
    const speechFinal = Boolean(message.speech_final)

    if (!isFinal) {
      // Ignore empty interim noise frames.
      if (!trimmed && !this.latestInterim) return
      this.latestInterim = trimmed
      this.pendingInterimForUtteranceEnd = true
      this.handlers.onLive(trimmed)
      return
    }

    if (trimmed) {
      this.commitFinal(trimmed)
    }

    this.latestInterim = ''
    // After speech_final, utterance is complete — don't flush again.
    this.pendingInterimForUtteranceEnd = !speechFinal
    this.handlers.onLive('')
  }

  private handleUtteranceEnd() {
    if (!this.pendingInterimForUtteranceEnd) return
    if (!this.latestInterim) {
      this.pendingInterimForUtteranceEnd = false
      return
    }

    this.commitFinal(this.latestInterim)
    this.latestInterim = ''
    this.pendingInterimForUtteranceEnd = false
    this.handlers.onLive('')
  }

  private commitFinal(transcript: string) {
    const normalized = transcript.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!normalized) return
    // Drop exact duplicate finals (common on flaky reconnects).
    if (normalized === this.lastFinalNormalized) return
    this.lastFinalNormalized = normalized
    this.handlers.onFinal(transcript)
  }
}
