/** Convert linear16 PCM bytes to base64 for JSON WebSocket frames. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Nearest-neighbor resample of signed 16-bit little-endian PCM.
 * Used to upsample the 16 kHz canonical stream to 24 kHz for OpenAI
 * without inventing new spectral information.
 */
export function resamplePcm16(
  pcm: ArrayBuffer,
  fromRate: number,
  toRate: number,
): ArrayBuffer {
  if (fromRate === toRate) {
    return pcm.slice(0)
  }
  const src = new Int16Array(pcm)
  if (src.length === 0) return pcm.slice(0)

  const ratio = fromRate / toRate
  const newLength = Math.max(1, Math.round(src.length / ratio))
  const dst = new Int16Array(newLength)
  for (let i = 0; i < newLength; i += 1) {
    const idx = Math.min(src.length - 1, Math.floor(i * ratio))
    dst[i] = src[idx] ?? 0
  }
  return dst.buffer
}

export function pcmSampleCount(pcm: ArrayBuffer): number {
  return Math.floor(pcm.byteLength / 2)
}

export function pcmDurationMs(pcm: ArrayBuffer, sampleRate: number): number {
  return (pcmSampleCount(pcm) / sampleRate) * 1000
}
