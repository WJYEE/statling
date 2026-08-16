import { DIFFICULTY_TIME_MULTIPLIER } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * v2 (2026-08 content rework): this game's content is now "물건 기억"
 * (Visual Object Memory) instead of read-a-story — see
 * lib/game/story-memory-data.ts. That file's per-tier object count/question
 * types/distractor similarity are the PRIMARY difficulty axis; the
 * per-question answer time limit here stays a secondary, multiplier-scaled
 * knob (same convention as the game-wide DIFFICULTY_TIME_MULTIPLIER
 * elsewhere) — this file only ever owned pacing, never content.
 */
export const STORY_MEMORY_GAME_VERSION = 'story_memory_v2'

/** Countdown shown before the objects appear. */
export const STORY_MEMORY_INTRO_COUNTDOWN_SECONDS = 3
/** How long the multiple-choice question itself stays up before auto-advancing as unanswered. */
export const STORY_MEMORY_QUESTION_TIME_LIMIT_MS = 12_000

/**
 * STORY_MEMORY_QUESTION_TIME_LIMIT_MS scaled by the player's chosen game
 * difficulty. At 'normal' DIFFICULTY_TIME_MULTIPLIER is exactly 1, so this
 * returns the same value as the base constant.
 */
export function getStoryMemoryQuestionTimeLimitForDifficulty(difficulty: GameDifficulty): number {
  return Math.round(STORY_MEMORY_QUESTION_TIME_LIMIT_MS * DIFFICULTY_TIME_MULTIPLIER[difficulty])
}
