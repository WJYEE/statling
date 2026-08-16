import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * v3 (2026-08 후속 보정): only Extreme is the app's true endless/survival
 * mode — a run there ends the instant the player collides (no lives, no
 * clock). Easy/Normal/Hard are back to a FIXED-TIME session (spec: "제한
 * 시간 동안 최대한 잘 회피") where a collision no longer ends the run —
 * it's recorded and penalizes the score/raw record via the dodge-rate term
 * (see lib/scoring/dodge-obstacle.ts), and the run only ends when the
 * clock runs out. Difficulty still lives entirely in starting
 * speed/spawn-interval + ramp rate + how early/often double-spawns and
 * scripted multi-tick patterns unlock — Hard leans hardest on scripted
 * patterns per spec ("다양한 scripted pattern 적극 사용"), Easy never uses
 * them at all ("비교적 단순한 obstacle pattern").
 *
 * (v2 had made every tier endless-with-1-hit-end; superseded by this v3
 * per explicit follow-up spec — see PR discussion for rationale.)
 */
export const DODGE_OBSTACLE_GAME_VERSION = 'dodge_obstacle_v3'

export const DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS = 3
export const DODGE_OBSTACLE_LANE_COUNT = 3

export type DodgeObstacleMode = 'fixed-time' | 'endless'

export interface DodgeObstacleTierConfig {
  mode: DodgeObstacleMode
  /** Only set when mode === 'fixed-time' — the run ends at this elapsed ms regardless of collisions. */
  durationMs?: number
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
  /** After this many ms elapsed, a double-obstacle (2 of 3 lanes) may spawn — always leaving at least one lane open. Infinity = never. */
  doubleSpawnUnlockMs: number
  /** After this many ms elapsed, multi-step scripted patterns (sweep, gap-shift) start appearing — see lib/game/dodge-obstacle-patterns.ts. Infinity = never. */
  scriptedPatternUnlockMs: number
  /** Chance per eligible spawn tick that a scripted pattern fires instead of the default single/double roll, once unlocked. */
  scriptedPatternChance: number
}

/**
 * Difficulty lives entirely in these numbers per tier — no
 * DIFFICULTY_TIME_MULTIPLIER/DIFFICULTY_LOAD_MULTIPLIER involved. Easy is
 * plain single-lane spawns only; Normal adds occasional double-spawns;
 * Hard unlocks both double-spawns and scripted patterns almost immediately
 * and uses them often; Extreme (endless) ramps the same way Hard does but
 * never stops.
 */
export const DODGE_OBSTACLE_TIER_CONFIG: Record<GameDifficulty, DodgeObstacleTierConfig> = {
  easy: {
    mode: 'fixed-time',
    durationMs: 35_000,
    initialSpeedPxPerS: 150,
    speedRampPxPerSPerSec: 3,
    speedCapPxPerS: 400,
    initialSpawnIntervalMs: 1700,
    spawnRampMsPerSec: 6,
    spawnFloorMs: 750,
    doubleSpawnUnlockMs: Infinity,
    scriptedPatternUnlockMs: Infinity,
    scriptedPatternChance: 0,
  },
  normal: {
    mode: 'fixed-time',
    durationMs: 35_000,
    initialSpeedPxPerS: 220,
    speedRampPxPerSPerSec: 4,
    speedCapPxPerS: 550,
    initialSpawnIntervalMs: 1400,
    spawnRampMsPerSec: 8,
    spawnFloorMs: 650,
    doubleSpawnUnlockMs: 15_000,
    scriptedPatternUnlockMs: Infinity,
    scriptedPatternChance: 0,
  },
  hard: {
    mode: 'fixed-time',
    durationMs: 40_000,
    initialSpeedPxPerS: 300,
    speedRampPxPerSPerSec: 6,
    speedCapPxPerS: 750,
    initialSpawnIntervalMs: 1100,
    spawnRampMsPerSec: 10,
    spawnFloorMs: 550,
    doubleSpawnUnlockMs: 6_000,
    scriptedPatternUnlockMs: 8_000,
    scriptedPatternChance: 0.35,
  },
  extreme: {
    mode: 'endless',
    initialSpeedPxPerS: 380,
    speedRampPxPerSPerSec: 8,
    speedCapPxPerS: 950,
    initialSpawnIntervalMs: 900,
    spawnRampMsPerSec: 12,
    spawnFloorMs: 450,
    doubleSpawnUnlockMs: 12_000,
    scriptedPatternUnlockMs: 30_000,
    scriptedPatternChance: 0.22,
  },
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

/** Player is invulnerable-to-repeat-flash for this long after a collision — prevents the hit-flash from double-firing within the same animation frame when multiple obstacles resolve at once. */
export const DODGE_OBSTACLE_COLLISION_COOLDOWN_MS = 600
