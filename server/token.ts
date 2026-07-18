const DEEPGRAM_API_BASE = 'https://api.deepgram.com/v1'
const KEY_TTL_SECONDS = 60

export interface DeepgramTokenResponse {
  access_token: string
  expires_in: number
}

interface DeepgramProject {
  project_id: string
}

interface DeepgramKeyResponse {
  key?: string
}

let cachedProjectId: string | null = null

async function getProjectId(apiKey: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId

  const response = await fetch(`${DEEPGRAM_API_BASE}/projects`, {
    headers: { Authorization: `Token ${apiKey}` },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Deepgram project lookup failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }

  const data = (await response.json()) as { projects?: DeepgramProject[] }
  const projectId = data.projects?.[0]?.project_id
  if (!projectId) {
    throw new Error('Deepgram account has no projects')
  }

  cachedProjectId = projectId
  return projectId
}

/**
 * Browsers can't send an Authorization header on a native WebSocket
 * handshake, and Deepgram's JWT grant tokens (from /v1/auth/grant) only
 * authenticate via that header — so they can't be used for a direct
 * browser-to-Deepgram Listen connection. Instead we mint a real,
 * short-lived scoped API key, which the browser can pass via the
 * Sec-WebSocket-Protocol subprotocol like a normal API key.
 */
export async function grantDeepgramToken(
  apiKey: string,
): Promise<DeepgramTokenResponse> {
  const projectId = await getProjectId(apiKey)

  const response = await fetch(
    `${DEEPGRAM_API_BASE}/projects/${projectId}/keys`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: 'phraserace-temp',
        scopes: ['usage:write'],
        time_to_live_in_seconds: KEY_TTL_SECONDS,
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Deepgram key creation failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }

  const data = (await response.json()) as DeepgramKeyResponse
  if (!data.key) {
    throw new Error('Deepgram key creation returned no key')
  }

  return { access_token: data.key, expires_in: KEY_TTL_SECONDS }
}
