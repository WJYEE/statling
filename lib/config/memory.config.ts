/** Memory ("Memory Tiles") tuning constants — GAME_SPEC §34-44. */
/**
 * v2: gameScore reworked to weightedAccuracy 85% + 응답속도 15%, clamped
 * 0-100 (was an unbounded ~1000-scale formula).
 * v3 (2026-08 difficulty rework): grid size + target count are now the
 * PRIMARY difficulty axis, one full 3-round sequence per tier
 * (MEMORY_TIER_SEQUENCES) instead of one shared sequence scaled only by
 * exposureMs. exposureMs still shrinks tier over tier, but only as a
 * secondary nudge — see each tier's own numbers below. Every gridSize used
 * here (up to 7) renders inside memory-game.tsx's existing fixed-footprint,
 * `minmax(0,1fr)`-column grid, which already scales to any N without a
 * layout change.
 */
import type { GameDifficulty } from '@/lib/game/difficulty'

export const MEMORY_GAME_VERSION = 'memory_v3'

export const MEMORY_PRACTICE_ROUNDS = 1
export const MEMORY_REAL_ROUNDS = 3

export interface MemoryDifficultyLevel {
  level: number
  gridSize: number
  targetCount: number
  /** Flash duration — how long target cells stay highlighted before disappearing. */
  exposureMs: number
}

/** Tutorial has its own (easier) difficulty, separate from the real sequence; its result is always discarded. Unaffected by the player's chosen tier — every tier's Tutorial round is identical, since it's purely there to teach the rule. */
export const MEMORY_TUTORIAL_DIFFICULTY: MemoryDifficultyLevel = {
  level: 0,
  gridSize: 3,
  targetCount: 3,
  exposureMs: 1000,
}

/**
 * One full 3-round sequence per tier — every player still plays exactly 3
 * real rounds (no Life system, no early termination, same as before), but
 * which grid/target-count ramp they climb depends on their chosen
 * difficulty. Each tier's own 3 rounds still ramp internally (so even a
 * single tier doesn't feel flat), and each successive tier starts at
 * roughly where the previous tier's hardest round left off.
 */
export const MEMORY_TIER_SEQUENCES: Record<GameDifficulty, MemoryDifficultyLevel[]> = {
  easy: [
    { level: 1, gridSize: 3, targetCount: 3, exposureMs: 1000 },
    { level: 2, gridSize: 3, targetCount: 4, exposureMs: 950 },
    { level: 3, gridSize: 4, targetCount: 5, exposureMs: 900 },
  ],
  normal: [
    { level: 1, gridSize: 4, targetCount: 5, exposureMs: 900 },
    { level: 2, gridSize: 4, targetCount: 6, exposureMs: 850 },
    { level: 3, gridSize: 5, targetCount: 7, exposureMs: 800 },
  ],
  hard: [
    { level: 1, gridSize: 5, targetCount: 7, exposureMs: 800 },
    { level: 2, gridSize: 5, targetCount: 8, exposureMs: 700 },
    { level: 3, gridSize: 6, targetCount: 9, exposureMs: 650 },
  ],
  extreme: [
    { level: 1, gridSize: 6, targetCount: 9, exposureMs: 700 },
    { level: 2, gridSize: 6, targetCount: 10, exposureMs: 600 },
    { level: 3, gridSize: 7, targetCount: 12, exposureMs: 500 },
  ],
}

export function getMemoryDifficultySequenceForDifficulty(difficulty: GameDifficulty): MemoryDifficultyLevel[] {
  return MEMORY_TIER_SEQUENCES[difficulty]
}

/**
 * Per-round weight for Weighted Accuracy — harder rounds count slightly more.
 * Index matches each tier's own MEMORY_TIER_SEQUENCES entry (round 1 = index
 * 0, ...) — same 3 weights apply within every tier's own 3-round ramp. Kept
 * modest (1.0 → 1.25) so difficulty nudges the score without dominating it.
 */
export const MEMORY_DIFFICULTY_ACCURACY_WEIGHTS = [1.0, 1.19, 1.25]

/** Delay before the flash starts, so the grid doesn't flash the instant it appears. */
export const MEMORY_PRE_FLASH_DELAY_MS = 100

/** How long a single tile's correct/wrong click-feedback flash stays up before settling to a neutral "selected" mark. */
export const MEMORY_CLICK_FEEDBACK_MS = 220

/**
 * How long the per-round result (PERFECT! / x/y 기억했어요 + full reveal)
 * stays up before advancing. Trimmed from 800ms — every tile is `disabled`
 * during this window (see memory-game.tsx's handleCellClick guard), so on
 * touch it read as "the last tap didn't do anything" rather than a
 * deliberate results pause. Kept long enough to register the outcome, short
 * enough that it no longer feels like the round hung.
 */
export const MEMORY_ROUND_FEEDBACK_MS = 500

/** How long the Tutorial → Real transition message stays up — raised from 1100ms to 2200ms so the rule callout was actually readable, then trimmed back down ~1s once the callout got its own persistent reminder alongside it, then trimmed again since this stage's grid is untappable the whole time (pure "next round" filler, not reading time). */
export const MEMORY_TUTORIAL_TRANSITION_MS = 800

/** Added to a round's response time per wrong click, before it counts toward scoring/Personal Best. */
export const MEMORY_WRONG_TIME_PENALTY_MS = 500

/** How long the small "MISS +0.5s" penalty flash stays up (absolutely positioned — never shifts layout). */
export const MEMORY_PENALTY_FLASH_MS = 700
