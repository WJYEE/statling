/**
 * v2: calculateNumberPatternScore now normalizes averageResponseTimeMs for
 * input-method latency (touch vs mouse/keyboard) before scoring — formula
 * weights unchanged.
 * v3 (2026-08 difficulty rework, GAME_SPEC §14): pickNumberPatternSession
 * (lib/game/number-pattern-data.ts) now draws only from the question pool
 * tagged with the player's actual chosen GameDifficulty, instead of ramping
 * easy->normal->hard by index position inside every session regardless of
 * tier. Content difficulty is now the primary axis; the time-limit
 * multiplier below stays as a secondary axis.
 */
import { DIFFICULTY_TIME_MULTIPLIER } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'

export const NUMBER_PATTERN_GAME_VERSION = 'number_pattern_v3'

export const NUMBER_PATTERN_INTRO_COUNTDOWN_SECONDS = 3
export const NUMBER_PATTERN_QUESTION_COUNT = 8
export const NUMBER_PATTERN_TIME_LIMIT_MS = 15_000

/** How long the feedback stage holds before advancing to the next question (or completing) — kept short for a correct answer so the game keeps its tempo. */
export const NUMBER_PATTERN_CORRECT_ADVANCE_MS = 800
/** Same feedback stage, but for a wrong (or timed-out) answer in Free Play — long enough to actually read the "왜 이 답인지" explanation before the game moves on. */
export const NUMBER_PATTERN_WRONG_ADVANCE_MS = 3_500
/**
 * Same wrong-answer feedback stage, but for Initial Assessment (`mode ===
 * 'first'`) — Assessment measures ability and shouldn't let a long
 * explanation pause interrupt that flow the way Free Play's leisurely
 * NUMBER_PATTERN_WRONG_ADVANCE_MS is meant to. Free Play's value is
 * untouched; this is a separate constant, not a shorter version of it.
 */
export const NUMBER_PATTERN_WRONG_ADVANCE_MS_ASSESSMENT = 1_400

/**
 * Game-wide difficulty tier scaling on top of the per-question base above —
 * see lib/config/difficulty.config.ts. At `normal` (DIFFICULTY_TIME_MULTIPLIER
 * === 1) this returns exactly NUMBER_PATTERN_TIME_LIMIT_MS.
 */
export function getNumberPatternTimeLimitForDifficulty(difficulty: GameDifficulty): number {
  return Math.round(NUMBER_PATTERN_TIME_LIMIT_MS * DIFFICULTY_TIME_MULTIPLIER[difficulty])
}
