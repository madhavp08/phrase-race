import { describe, expect, it } from 'vitest'
import { errorFromBody, isAbortError } from './http'

describe('errorFromBody', () => {
  it('prefers a JSON error field', () => {
    expect(errorFromBody(409, { error: 'username taken' }, '<html>', 'x')).toBe(
      'username taken',
    )
  })

  it('explains a gateway timeout instead of dumping HTML', () => {
    expect(
      errorFromBody(504, null, '<html>FUNCTION_INVOCATION_TIMEOUT</html>', 'x'),
    ).toMatch(/timed out/i)
  })

  it('maps Vercel FUNCTION_INVOCATION_FAILED envelopes to a retryable message', () => {
    expect(
      errorFromBody(
        500,
        { error: { code: '500', message: 'A server error has occurred' } },
        '',
        'x',
      ),
    ).toMatch(/failed to start/i)
  })

  it('falls back to a short text snippet', () => {
    expect(errorFromBody(400, null, 'nope', 'fallback')).toBe('nope')
  })
})

describe('isAbortError', () => {
  it('detects DOM abort errors', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('nope'))).toBe(false)
  })
})
