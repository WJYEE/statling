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

/**
 * Game-wide difficulty tier scaling on top of the per-question base above —
 * see lib/config/difficulty.config.ts. At `normal` (DIFFICULTY_TIME_MULTIPLIER
 * === 1) this returns exactly NUMBER_PATTERN_TIME_LIMIT_MS.
 */
export function getNumberPatternTimeLimitForDifficulty(difficulty: GameDifficulty): number {
  return Math.round(NUMBER_PATTERN_TIME_LIMIT_MS * DIFFICULTY_TIME_MULTIPLIER[difficulty])
}
