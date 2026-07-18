import type { TestMode } from '../types'

export interface LeaderboardEntry {
  id: string
  name: string
  wpm: number
  accuracy: number
  modeLabel: string
  isYou?: boolean
}

const STORAGE_KEY = 'phraserace.leaderboard.you'

const SEED: Omit<LeaderboardEntry, 'isYou'>[] = [
  { id: 's1', name: 'nova', wpm: 92, accuracy: 98, modeLabel: 'time 60' },
  { id: 's2', name: 'echo', wpm: 81, accuracy: 96, modeLabel: 'time 30' },
  { id: 's3', name: 'rift', wpm: 74, accuracy: 97, modeLabel: 'time 60' },
  { id: 's4', name: 'pixel', wpm: 68, accuracy: 94, modeLabel: 'custom' },
  { id: 's5', name: 'ember', wpm: 61, accuracy: 95, modeLabel: 'time 15' },
  { id: 's6', name: 'quark', wpm: 55, accuracy: 93, modeLabel: 'time 60' },
  { id: 's7', name: 'bloom', wpm: 49, accuracy: 91, modeLabel: 'time 30' },
  { id: 's8', name: 'zinc', wpm: 42, accuracy: 90, modeLabel: 'custom' },
  { id: 's9', name: 'haze', wpm: 36, accuracy: 88, modeLabel: 'time 60' },
  { id: 's10', name: 'drift', wpm: 29, accuracy: 86, modeLabel: 'time 15' },
]

function modeLabel(mode: TestMode, durationSec: number): string {
  return mode === 'custom' ? 'custom' : `time ${durationSec}`
}

function readSavedYou(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LeaderboardEntry[]
    return Array.isArray(parsed) ? parsed.map((e) => ({ ...e, isYou: true })) : []
  } catch {
    return []
  }
}

function writeSavedYou(entries: LeaderboardEntry[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.map(({ isYou: _isYou, ...rest }) => rest)),
  )
}

export function getLeaderboard(): LeaderboardEntry[] {
  const you = readSavedYou()
  const merged = [
    ...SEED.map((e) => ({ ...e, isYou: false as const })),
    ...you,
  ]
  return merged
    .sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy)
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, id: `${entry.id}-${index}` }))
}

export interface RankResult {
  ranked: boolean
  rank: number | null
  board: LeaderboardEntry[]
}

/** Insert a run if it beats the 10th place (or board isn't full). */
export function tryRankScore(
  wpm: number,
  accuracy: number,
  mode: TestMode,
  durationSec: number,
): RankResult {
  const roundedWpm = Math.round(wpm)
  const roundedAcc = Math.round(accuracy)
  if (roundedWpm <= 0) {
    return { ranked: false, rank: null, board: getLeaderboard() }
  }

  const boardBefore = getLeaderboard()
  const tenth = boardBefore[9]
  const qualifies =
    boardBefore.length < 10 ||
    roundedWpm > (tenth?.wpm ?? 0) ||
    (roundedWpm === tenth?.wpm && roundedAcc > (tenth?.accuracy ?? 0))

  if (!qualifies) {
    return { ranked: false, rank: null, board: boardBefore }
  }

  const entry: LeaderboardEntry = {
    id: `you-${Date.now()}`,
    name: 'you',
    wpm: roundedWpm,
    accuracy: roundedAcc,
    modeLabel: modeLabel(mode, durationSec),
    isYou: true,
  }

  const saved = readSavedYou().filter((e) => e.name === 'you')
  // Keep best personal runs (up to 3) so demos feel sticky.
  const nextSaved = [...saved, entry]
    .sort((a, b) => b.wpm - a.wpm)
    .slice(0, 3)
  writeSavedYou(nextSaved)

  const board = getLeaderboard()
  const rankIndex = board.findIndex((e) => e.isYou && e.wpm === roundedWpm)
  return {
    ranked: true,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    board,
  }
}
