export async function readResponseBody(response: Response): Promise<{
  status: number
  ok: boolean
  json: unknown
  text: string
}> {
  const text = await response.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = null
    }
  }
  return { status: response.status, ok: response.ok, json, text }
}

export function errorFromBody(
  status: number,
  json: unknown,
  text: string,
  fallback: string,
): string {
  if (json && typeof json === 'object' && 'error' in json) {
    const message = (json as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  if (status === 504 || status === 524) {
    return 'Save timed out on the server. Try again in a moment.'
  }
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160)
  return snippet || fallback
}

export function withTimeout(timeoutMs: number): {
  signal: AbortSignal
  cancel: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
