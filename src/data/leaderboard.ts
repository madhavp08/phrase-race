import type { TestMode } from '../types'
import { errorFromBody, readResponseBody } from './http'

export interface LeaderboardEntry {
  id: string
  username: string
  wpm: number
  accuracy: number
  modeLabel: string
  isYou?: boolean
}

export function modeLabel(mode: TestMode, durationSec: number): string {
  return mode === 'custom' ? 'custom' : `time ${durationSec}`
}

export function markYou(
  entries: LeaderboardEntry[],
  username?: string | null,
): LeaderboardEntry[] {
  if (!username) return entries.map((entry) => ({ ...entry, isYou: false }))
  const want = username.toLowerCase()
  return entries.map((entry) => ({
    ...entry,
    isYou: entry.username.toLowerCase() === want,
  }))
}

export async function fetchLeaderboard(): Promise<{
  entries: LeaderboardEntry[]
  error?: string
}> {
  try {
    const response = await fetch('/api/leaderboard', {
      headers: { Accept: 'application/json' },
    })
    const { ok, status, json, text } = await readResponseBody(response)
    const body =
      json && typeof json === 'object'
        ? (json as { entries?: LeaderboardEntry[]; error?: string })
        : {}
    const entries = Array.isArray(body.entries)
      ? body.entries.map((entry) => ({
          id: String(entry.id),
          username: String(entry.username ?? ''),
          wpm: Number(entry.wpm) || 0,
          accuracy: Number(entry.accuracy) || 0,
          modeLabel: String(entry.modeLabel ?? ''),
        }))
      : []
    if (!ok) {
      return {
        entries,
        error: errorFromBody(
          status,
          json,
          text,
          `Leaderboard failed (${status})`,
        ),
      }
    }
    return { entries }
  } catch (error) {
    return {
      entries: [],
      error:
        error instanceof Error
          ? error.message
          : 'Could not reach /api/leaderboard',
    }
  }
}
