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
    const err = (json as { error?: unknown }).error
    if (typeof err === 'string' && err.trim()) {
      return friendlyServerCrash(status, err, text) ?? err
    }
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) {
        return friendlyServerCrash(status, message, text) ?? message
      }
    }
  }
  if (status === 500) {
    return (
      friendlyServerCrash(status, '', text) ??
      'Save failed on the server. Try again after the latest deploy finishes.'
    )
  }
  if (status === 504 || status === 524) {
    return 'Save timed out on the server. Try again in a moment.'
  }
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160)
  return snippet || fallback
}

function friendlyServerCrash(
  status: number,
  message: string,
  text: string,
): string | null {
  const blob = `${message} ${text}`
  if (
    status >= 500 &&
    (/server error has occurred/i.test(blob) ||
      /FUNCTION_INVOCATION_FAILED/i.test(blob))
  ) {
    return 'The score server failed to start. Wait for a fresh deploy and try again.'
  }
  return null
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
