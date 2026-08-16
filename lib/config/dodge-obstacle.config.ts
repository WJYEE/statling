import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * v2 (2026-08 difficulty rework): the fixed-35s session is gone — this is
 * now the app's one true endless/survival game (spec: "12개 게임 중 유일한
 * 실제 무한모드"). A run ends the instant the player collides with an
 * obstacle (no lives, no grace period) rather than at a clock. Difficulty
 * now only ever changes the STARTING speed/spawn-interval and how fast both
 * ramp per second survived — every tier keeps getting harder forever the
 * longer a run lasts, which is what finally makes `survivedMs` a real,
 * differentiating ranking metric instead of "however close to 35000 you
 * got" (see lib/scoring/dodge-obstacle.ts).
 */
export const DODGE_OBSTACLE_GAME_VERSION = 'dodge_obstacle_v2'

export const DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS = 3
export const DODGE_OBSTACLE_LANE_COUNT = 3

export interface DodgeObstacleTierConfig {
  /** Fall speed (px/s) at t=0. */
  initialSpeedPxPerS: number
  /** How much speed climbs per second survived — unbounded ramp, capped by speedCapPxPerS. */
  speedRampPxPerSPerSec: number
  speedCapPxPerS: number
  /** Time (ms) between obstacle spawns at t=0. */
  initialSpawnIntervalMs: number
  /** How much the spawn interval shrinks per second survived — unbounded ramp, floored by spawnFloorMs. */
  spawnRampMsPerSec: number
  spawnFloorMs: number
}

/**
 * Difficulty now lives entirely in these four numbers per tier — no
 * DIFFICULTY_TIME_MULTIPLIER/DIFFICULTY_LOAD_MULTIPLIER involved. Each
 * harder tier starts faster/denser AND ramps faster AND has a higher
 * ceiling, so the gap between tiers only widens the longer a run goes.
 */
export const DODGE_OBSTACLE_TIER_CONFIG: Record<GameDifficulty, DodgeObstacleTierConfig> = {
  easy: { initialSpeedPxPerS: 150, speedRampPxPerSPerSec: 3, speedCapPxPerS: 400, initialSpawnIntervalMs: 1700, spawnRampMsPerSec: 6, spawnFloorMs: 750 },
  normal: { initialSpeedPxPerS: 220, speedRampPxPerSPerSec: 4, speedCapPxPerS: 550, initialSpawnIntervalMs: 1400, spawnRampMsPerSec: 8, spawnFloorMs: 650 },
  hard: { initialSpeedPxPerS: 300, speedRampPxPerSPerSec: 6, speedCapPxPerS: 750, initialSpawnIntervalMs: 1100, spawnRampMsPerSec: 10, spawnFloorMs: 550 },
  extreme: { initialSpeedPxPerS: 380, speedRampPxPerSPerSec: 8, speedCapPxPerS: 950, initialSpawnIntervalMs: 900, spawnRampMsPerSec: 12, spawnFloorMs: 450 },
}

export function getDodgeObstacleTierConfig(difficulty: GameDifficulty): DodgeObstacleTierConfig {
  return DODGE_OBSTACLE_TIER_CONFIG[difficulty]
}

/** Current fall speed (px/s) at `elapsedMs` into the run — climbs linearly from initial, capped. Same formula for every tier; only the tier's own constants differ. */
export function dodgeObstacleSpeedAt(config: DodgeObstacleTierConfig, elapsedMs: number): number {
  const elapsedSeconds = elapsedMs / 1000
  return Math.min(config.speedCapPxPerS, config.initialSpeedPxPerS + config.speedRampPxPerSPerSec * elapsedSeconds)
}

/** Current spawn interval (ms) at `elapsedMs` into the run — shrinks linearly from initial, floored. */
export function dodgeObstacleSpawnIntervalAt(config: DodgeObstacleTierConfig, elapsedMs: number): number {
  const elapsedSeconds = elapsedMs / 1000
  return Math.max(config.spawnFloorMs, config.initialSpawnIntervalMs - config.spawnRampMsPerSec * elapsedSeconds)
}

/** After this many ms survived, a double-obstacle (2 of 3 lanes) may spawn — always leaving at least one lane open. Same threshold for every tier (only starting speed/spawn differ by tier — see module doc comment). */
export const DODGE_OBSTACLE_DOUBLE_SPAWN_UNLOCK_MS = 12_000
/** After this many ms survived, multi-step scripted patterns (sweep, gap-shift) start appearing — see lib/game/dodge-obstacle-patterns.ts. */
export const DODGE_OBSTACLE_SCRIPTED_PATTERN_UNLOCK_MS = 30_000
/** Chance per eligible spawn tick that a scripted pattern fires instead of the default single/double roll, once unlocked. */
export const DODGE_OBSTACLE_SCRIPTED_PATTERN_CHANCE = 0.22

/** Player is invulnerable-to-repeat-hit for this long after a collision — kept even though a run now ends on the first collision, purely so the very last obstacle's hit-flash can't double-fire within the same animation frame. */
export const DODGE_OBSTACLE_COLLISION_COOLDOWN_MS = 600
