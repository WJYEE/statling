import { DIFFICULTY_TIME_MULTIPLIER } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { FocusShape } from '@/lib/game/focus-symbol'

/** Focus ("Target Hunt") tuning constants — GAME_SPEC §45-54. */
/**
 * v2: gameScore reworked to weightedAccuracy 85% + miss/false-click penalty
 * budget (15pt, miss weighted 2.5x), clamped 0-100 (was an unbounded
 * ~1000-scale formula).
 * v3 (2026-08 difficulty rework): the target is no longer always a star —
 * see FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY. Placement density/similarity
 * now ramp per-tier (FOCUS_TIER_SEQUENCES) instead of one shared sequence.
 * Grid size stays 6x6 for every tier — shape variety and distractor count
 * are this game's difficulty axis, not search-area size — per the explicit
 * "순수한 시각 탐색이 아닌 퍼즐처럼 변하지 않도록" constraint: no color
 * attribute, no compound conditions, no target-border emphasis added.
 */
export const FOCUS_GAME_VERSION = 'focus_v3'

export const FOCUS_TUTORIAL_ROUNDS = 1
export const FOCUS_REAL_ROUNDS = 3
export const FOCUS_NO_TARGET_ROUND_COUNT = 1

/** Tutorial keeps a small, easy search area — it's for learning the rule, not testing it. */
export const FOCUS_TUTORIAL_GRID_SIZE = 4
/** Real rounds use a much larger search area so the target isn't visible at a glance. Flat across every tier — see module doc comment. */
export const FOCUS_REAL_GRID_SIZE = 6

/**
 * Which shape this session's target can be, picked once per session (see
 * focus-game.tsx) — never combined with a color attribute, so this stays
 * pure visual-shape search rather than a multi-attribute puzzle. Easy always
 * lands on the same familiar 'star' target (unchanged feel); Hard/Extreme
 * draw from all 5 shapes.
 */
export const FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY: Record<GameDifficulty, FocusShape[]> = {
  easy: ['star'],
  normal: ['star', 'circle'],
  hard: ['star', 'circle', 'square', 'triangle', 'diamond'],
  extreme: ['star', 'circle', 'square', 'triangle', 'diamond'],
}

export interface FocusDifficultyLevel {
  level: number
  /** Total symbols shown this round (target + distractors when present, all-distractor when not). */
  totalPlacementCount: number
  /** 1 = very different shape family ... 4 = same shape, subtle structural difference only (never color-only). */
  similarityLevel: number
}

/** Tutorial uses an easy, fixed difficulty for both the target-present and no-target practice rounds — same for every tier (only which SHAPE the target is varies, via FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY). */
export const FOCUS_TUTORIAL_DIFFICULTY: FocusDifficultyLevel = {
  level: 0,
  totalPlacementCount: 5,
  similarityLevel: 1,
}

/**
 * One full 3-round sequence per tier, all on the same 6x6 grid — placement
 * density and distractor similarity both climb tier over tier as well as
 * round over round within a tier. Easy/Normal's peak (round 3) lands close
 * to where the old shared sequence's round 3 was (36 placements/similarity
 * 4), so a fast Normal player isn't suddenly facing a much harder session
 * than before; Hard/Extreme push further past that old ceiling.
 */
export const FOCUS_TIER_SEQUENCES: Record<GameDifficulty, FocusDifficultyLevel[]> = {
  easy: [
    { level: 1, totalPlacementCount: 16, similarityLevel: 1 },
    { level: 2, totalPlacementCount: 20, similarityLevel: 1 },
    { level: 3, totalPlacementCount: 22, similarityLevel: 2 },
  ],
  normal: [
    { level: 1, totalPlacementCount: 22, similarityLevel: 1 },
    { level: 2, totalPlacementCount: 26, similarityLevel: 2 },
    { level: 3, totalPlacementCount: 28, similarityLevel: 2 },
  ],
  hard: [
    { level: 1, totalPlacementCount: 26, similarityLevel: 2 },
    { level: 2, totalPlacementCount: 30, similarityLevel: 3 },
    { level: 3, totalPlacementCount: 34, similarityLevel: 3 },
  ],
  extreme: [
    { level: 1, totalPlacementCount: 30, similarityLevel: 3 },
    { level: 2, totalPlacementCount: 34, similarityLevel: 4 },
    { level: 3, totalPlacementCount: 36, similarityLevel: 4 },
  ],
}

export function getFocusDifficultySequenceForDifficulty(difficulty: GameDifficulty): FocusDifficultyLevel[] {
  return FOCUS_TIER_SEQUENCES[difficulty]
}

/** Per-round weight for Weighted Accuracy — harder rounds count slightly more. Index matches each tier's own FOCUS_TIER_SEQUENCES entry (round 1 = index 0, ...) — same 3 weights apply within every tier's own 3-round ramp. */
export const FOCUS_DIFFICULTY_ACCURACY_WEIGHTS = [1.0, 1.15, 1.2]

/**
 * Per-round time limit (ms), index matches each tier's FOCUS_TIER_SEQUENCES entry. Unlike
 * Memory, Focus enforces a real timeout — without one, users could search
 * indefinitely and eventually always find the target, which would stop
 * measuring sustained attention at all. Tutorial rounds have no limit.
 * Final round keeps the same 3500ms pressure the old round 8 used.
 */
export const FOCUS_ROUND_TIME_LIMIT_MS = [5000, 3800, 3500]

/** Difficulty-scaled per-round time limits — bigger DIFFICULTY_TIME_MULTIPLIER = more time = easier. At 'normal' (multiplier 1) this is identical to FOCUS_ROUND_TIME_LIMIT_MS. */
export function getFocusRoundTimeLimitForDifficulty(difficulty: GameDifficulty): number[] {
  return FOCUS_ROUND_TIME_LIMIT_MS.map((ms) => Math.round(ms * DIFFICULTY_TIME_MULTIPLIER[difficulty]))
}

/** How long the per-round correct/wrong/missed feedback stays up before advancing. */
export const FOCUS_ROUND_FEEDBACK_MS = 650

/** How long each Tutorial transition message stays up — raised from 1100ms to 2200ms so the rule callout was actually readable, then trimmed back down ~1s once the callout got its own persistent reminder alongside it, then trimmed again for touch responsiveness (this stage has nothing tappable, so it's pure "next round" filler). */
export const FOCUS_TUTORIAL_TRANSITION_MS = 800
