export interface DeepgramAccessToken {
  access_token: string
  expires_in: number
}

export async function fetchDeepgramToken(): Promise<string> {
  const response = await fetch('/api/deepgram-token', { method: 'POST' })
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
  }

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error ?? `Could not get Deepgram token (${response.status})`,
    )
  }

  return data.access_token
}
