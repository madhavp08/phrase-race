import { splitLiveHypothesis } from '../speech/liveAgent'
import type {
  ModelResult,
  ModelResultStatus,
  TranscriptEvent,
  WordResult,
} from '../speech/types'
import { isExactMatch, tokenizeWords } from './normalize'
import { roundTo2 } from './scoring'
import {
  alignTokens,
  characterAccuracyFromCer,
  characterErrorRate,
  median,
  percentile,
  wordErrorRate,
} from './sttMetrics'

export interface ShadowEvaluatorOptions {
  provider: string
  model: string
  name: string
  config: Record<string, unknown>
}

/**
 * Per-model scorer that never touches GameEngine / the caret.
 * Interim events only stamp first-seen times; finals append committed text.
 */
export class ShadowEvaluator {
  readonly provider: string
  readonly model: string
  readonly name: string
  readonly config: Record<string, unknown>

  private committed: string[] = []
  private interimLatencies: number[] = []
  private finalLatencies: number[] = []
  private lastChunkAt = 0
  private reachedLive = false
  private failed = false
  private failStatus: ModelResultStatus = 'provider_failure'
  private failReason?: string
  private seenInterimIndex = 0

  constructor(options: ShadowEvaluatorOptions) {
    this.provider = options.provider
    this.model = options.model
    this.name = options.name
    this.config = options.config
  }

  setAudioClock(lastChunkAt: number) {
    this.lastChunkAt = lastChunkAt
  }

  setLive() {
    this.reachedLive = true
  }

  fail(message: string, status: ModelResultStatus = 'provider_failure') {
    this.failed = true
    this.failReason = message
    this.failStatus = status
  }

  get committedTranscript(): string {
    return this.committed.join(' ')
  }

  consume(event: TranscriptEvent) {
    const latency = this.latencyMs(event.receivedAt)

    if (!event.isFinal) {
      if (!event.text.trim()) return
      const { completeWords } = splitLiveHypothesis(event.text)
      while (this.seenInterimIndex < completeWords.length) {
        if (this.interimLatencies.length < this.committed.length + 1) {
          this.interimLatencies.push(latency)
        } else if (this.seenInterimIndex >= this.committed.length) {
          this.interimLatencies.push(latency)
        }
        this.seenInterimIndex += 1
      }
      return
    }

    const words = tokenizeWords(event.text)
    if (words.length === 0) return
    for (const word of words) {
      this.committed.push(word)
      this.finalLatencies.push(latency)
      if (this.interimLatencies.length < this.committed.length) {
        this.interimLatencies.push(latency)
      }
    }
    this.seenInterimIndex = 0
  }

  finalize(referenceWords: string[], elapsedMs = 0): ModelResult {
    const transcript = this.committedTranscript
    const hasTranscript = this.committed.length > 0
    const status: ModelResultStatus =
      hasTranscript || (this.reachedLive && !this.failed)
        ? 'valid'
        : this.failed
          ? this.failStatus
          : this.reachedLive
            ? 'valid'
            : 'provider_failure'

    if (status !== 'valid') {
      return {
        provider: this.provider,
        model: this.model,
        name: this.name,
        transcript,
        characterAccuracy: 0,
        cer: 0,
        wer: 0,
        modelNetWpm: 0,
        medianWordLatencyMs: 0,
        p95WordLatencyMs: 0,
        wordResults: [],
        status,
        error: this.failReason,
        config: this.config,
      }
    }

    const referenceText = referenceWords.join(' ')
    const cer = characterErrorRate(referenceText, transcript)
    const wer = wordErrorRate(referenceText, transcript)
    const alignment = alignTokens(referenceWords, this.committed)
    const wordResults = wordResultsFromAlignment(
      alignment.ops,
      this.interimLatencies,
      this.finalLatencies,
    )
    const finals = wordResults
      .map((row) => row.finalLatencyMs)
      .filter((ms): ms is number => ms !== null)

    const minutes = elapsedMs > 0 ? elapsedMs / 60_000 : 0
    const refChars = referenceText.replace(/\s+/g, ' ').length
    const modelNetWpm =
      minutes > 0 ? roundTo2((refChars * (1 - cer)) / 5 / minutes) : 0

    return {
      provider: this.provider,
      model: this.model,
      name: this.name,
      transcript,
      characterAccuracy: characterAccuracyFromCer(cer),
      cer: roundTo2(cer),
      wer: roundTo2(wer),
      modelNetWpm,
      medianWordLatencyMs: roundTo2(median(finals)),
      p95WordLatencyMs: roundTo2(percentile(finals, 0.95)),
      wordResults,
      status,
      error: this.failReason,
      config: this.config,
    }
  }

  private latencyMs(receivedAt: number): number {
    if (this.lastChunkAt <= 0) return 0
    return Math.max(0, receivedAt - this.lastChunkAt)
  }
}

function wordResultsFromAlignment(
  ops: ReturnType<typeof alignTokens>['ops'],
  interimLatencies: number[],
  finalLatencies: number[],
): WordResult[] {
  const rows: WordResult[] = []
  let hypIndex = 0

  for (const op of ops) {
    if (op.type === 'ins') {
      rows.push({
        expected: '',
        heard: op.hyp,
        correct: false,
        interimLatencyMs: interimLatencies[hypIndex] ?? null,
        finalLatencyMs: finalLatencies[hypIndex] ?? null,
      })
      hypIndex += 1
      continue
    }

    if (op.type === 'del') {
      rows.push({
        expected: op.ref,
        heard: '',
        correct: false,
        interimLatencyMs: null,
        finalLatencyMs: null,
      })
      continue
    }

    rows.push({
      expected: op.ref,
      heard: op.hyp,
      correct: isExactMatch(op.ref, op.hyp),
      interimLatencyMs: interimLatencies[hypIndex] ?? null,
      finalLatencyMs: finalLatencies[hypIndex] ?? null,
    })
    hypIndex += 1
  }

  return rows
}

/** Send the same PCM bytes to every provider. Failures are isolated. */
export function fanOutAudio(
  chunk: ArrayBuffer,
  senders: Array<{ sendAudio: (pcm: ArrayBuffer) => void }>,
): void {
  for (const sender of senders) {
    try {
      sender.sendAudio(chunk)
    } catch {
      // one broken adapter must not stop the others
    }
  }
}
