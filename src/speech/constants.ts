export const CANONICAL_SAMPLE_RATE = 16_000
export const OPENAI_INPUT_HZ = 24_000
export const BENCHMARK_VERSION = 'v1'
export const SCORER_VERSION = 'v1'

export const KEEP_ALIVE_MS = 3_000
export const RECONNECT_BASE_MS = 350
export const RECONNECT_MAX_MS = 3_000
export const MAX_RECONNECT_ATTEMPTS = 8

export const ALL_PROVIDER_IDS = ['deepgram', 'openai', 'elevenlabs'] as const
export type ProviderId = (typeof ALL_PROVIDER_IDS)[number]

export function parseEnabledProviders(raw?: string): ProviderId[] {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env.VITE_BENCH_PROVIDERS as string | undefined)
      : undefined
  const source = raw ?? fromEnv ?? ALL_PROVIDER_IDS.join(',')
  const parsed = source
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ProviderId =>
      ALL_PROVIDER_IDS.includes(part as ProviderId),
    )

  const unique = [...new Set(parsed)]
  return unique.length > 0 ? unique : [...ALL_PROVIDER_IDS]
}
