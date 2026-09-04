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
  READING_WPM,
  pacedWordIndex,
  timedPromptWordCount,
  displayWordIndex,
} from './readingPace'
export { buildSentenceStream, asPromptTokens } from './prompts'
export type { PromptToken, PromptWord } from './prompts'
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
export {
  pickRoundJudge,
  pickLivePrimary,
  statsFromJudge,
  PUBLIC_STT_RANKING,
} from './judge'
export {
  parseAccountFields,
  decideAccountAction,
  validateUsername,
  validateEmail,
  formatGuestUsername,
  isGuestUsername,
} from './account'
