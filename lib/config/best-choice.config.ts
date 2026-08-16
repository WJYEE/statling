import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * v2 (2026-08 content rework): "무엇을 선택할까" is now a binary (A/B)
 * fact-comparison quiz ("둘 중 더 큰 동물은?") instead of a subjective
 * multi-choice decision scenario — see lib/game/decision-scenarios.ts.
 * Difficulty now comes from how close/counter-intuitive the comparison
 * itself is (a tier-tagged content pool), not just round count — round
 * count is still a secondary lever (BEST_CHOICE_ROUND_COUNT_BY_DIFFICULTY),
 * but the dominant difficulty axis moved into the content.
 */
export const BEST_CHOICE_GAME_VERSION = 'best_choice_v2'

export const BEST_CHOICE_INTRO_COUNTDOWN_SECONDS = 3

/** How many seconds a round gives to answer — same for every tier at first (content is the difficulty axis), tightened only at Extreme for the "빠른 판단" requirement. */
export const BEST_CHOICE_TIME_LIMIT_SECONDS_BY_DIFFICULTY: Record<GameDifficulty, number> = {
  easy: 8,
  normal: 7,
  hard: 6,
  extreme: 4,
}

/** Round count per tier — capped at 8 to match each tier's authored pool size (lib/game/decision-scenarios.ts's COMPARISON_QUESTIONS has 8 per tier). */
export const BEST_CHOICE_ROUND_COUNT_BY_DIFFICULTY: Record<GameDifficulty, number> = {
  easy: 5,
  normal: 6,
  hard: 7,
  extreme: 8,
}

export function getBestChoiceRoundCountForDifficulty(difficulty: GameDifficulty): number {
  return BEST_CHOICE_ROUND_COUNT_BY_DIFFICULTY[difficulty]
}

export function getBestChoiceTimeLimitMsForDifficulty(difficulty: GameDifficulty): number {
  return BEST_CHOICE_TIME_LIMIT_SECONDS_BY_DIFFICULTY[difficulty] * 1000
}
