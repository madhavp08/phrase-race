export { normalizeText, isExactMatch, countWords, tokenizeWords } from './normalize'
export {
  createAttempt,
  calculateStats,
  calculateStatsFromWords,
  calculateBestStreak,
} from './scoring'
export {
  alignWord,
  createWordState,
  previewWord,
  commitWord,
  countCharResults,
} from './align'
export { roundTo2 } from './scoring'
export {
  GameEngine,
  buildWordList,
  pickTongueTwister,
  pickTongueTwisterText,
} from './game'
export {
  characterErrorRate,
  wordErrorRate,
  alignTokens,
  median,
  percentile,
} from './sttMetrics'
export { ShadowEvaluator, fanOutAudio } from './shadowEval'
export { validateRunPayload } from './runPayload'
export type { RunPayload } from './runPayload'
