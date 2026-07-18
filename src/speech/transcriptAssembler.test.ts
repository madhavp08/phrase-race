import { describe, expect, it, vi } from 'vitest'
import { TranscriptAssembler } from './transcriptAssembler'

function createAssembler() {
  const onLive = vi.fn()
  const onFinal = vi.fn()
  const assembler = new TranscriptAssembler({ onLive, onFinal })
  return { assembler, onLive, onFinal }
}

describe('TranscriptAssembler', () => {
  it('emits interim transcripts as live hypotheses', () => {
    const { assembler, onLive, onFinal } = createAssembler()

    assembler.handleMessage({
      type: 'Results',
      is_final: false,
      channel: { alternatives: [{ transcript: 'hello wor' }] },
    })

    expect(onLive).toHaveBeenLastCalledWith('hello wor')
    expect(onFinal).not.toHaveBeenCalled()
  })

  it('commits final Results and clears live text', () => {
    const { assembler, onLive, onFinal } = createAssembler()

    assembler.handleMessage({
      type: 'Results',
      is_final: false,
      channel: { alternatives: [{ transcript: 'hello' }] },
    })
    assembler.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'hello world' }] },
    })

    expect(onFinal).toHaveBeenCalledWith('hello world')
    expect(onLive).toHaveBeenLastCalledWith('')
  })

  it('flushes latest interim on UtteranceEnd without a prior final', () => {
    const { assembler, onLive, onFinal } = createAssembler()

    assembler.handleMessage({
      type: 'Results',
      is_final: false,
      channel: { alternatives: [{ transcript: 'open window' }] },
    })
    assembler.handleMessage({ type: 'UtteranceEnd' })

    expect(onFinal).toHaveBeenCalledWith('open window')
    expect(onLive).toHaveBeenLastCalledWith('')
  })

  it('does not double-flush after speech_final', () => {
    const { assembler, onFinal } = createAssembler()

    assembler.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'done' }] },
    })
    assembler.handleMessage({ type: 'UtteranceEnd' })

    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('done')
  })

  it('deduplicates identical consecutive finals', () => {
    const { assembler, onFinal } = createAssembler()

    assembler.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'Hello World' }] },
    })
    assembler.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'hello world' }] },
    })

    expect(onFinal).toHaveBeenCalledTimes(1)
  })
})
