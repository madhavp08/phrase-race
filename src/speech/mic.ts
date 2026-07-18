export async function requestMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
  return true
}

export function isMicrophoneSupported(): boolean {
  return (
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  )
}

export const TARGET_SAMPLE_RATE = 16_000

export interface MicCapture {
  /** Start streaming PCM chunks. Safe to call once. */
  start: (onChunk: (pcm: ArrayBuffer) => void) => void
  stop: () => void
}

/**
 * Continuous linear16 PCM capture at 16 kHz — more reliable for Deepgram
 * live streaming than fragmented MediaRecorder WebM blobs.
 */
export async function createMicCapture(): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  })

  const audioContext = new AudioContext()
  // Some browsers ignore the requested rate — we downsample manually.
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const source = audioContext.createMediaStreamSource(stream)
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  const silent = audioContext.createGain()
  silent.gain.value = 0

  let onChunk: ((pcm: ArrayBuffer) => void) | null = null
  let running = false

  processor.onaudioprocess = (event) => {
    if (!running || !onChunk) return
    const input = event.inputBuffer.getChannelData(0)
    const downsampled = downsampleBuffer(
      input,
      audioContext.sampleRate,
      TARGET_SAMPLE_RATE,
    )
    onChunk(floatTo16BitPCM(downsampled))
  }

  source.connect(processor)
  processor.connect(silent)
  silent.connect(audioContext.destination)

  return {
    start(handler) {
      onChunk = handler
      running = true
    },
    stop() {
      running = false
      onChunk = null
      try {
        processor.disconnect()
        source.disconnect()
        silent.disconnect()
      } catch {
        // ignore
      }
      void audioContext.close()
      stream.getTracks().forEach((track) => track.stop())
    },
  }
}

function downsampleBuffer(
  buffer: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return buffer
  const ratio = fromRate / toRate
  const newLength = Math.max(1, Math.round(buffer.length / ratio))
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i += 1) {
    const idx = Math.min(buffer.length - 1, Math.floor(i * ratio))
    result[i] = buffer[idx] ?? 0
  }
  return result
}

function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i] ?? 0))
    view.setInt16(
      i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    )
  }
  return buffer
}
