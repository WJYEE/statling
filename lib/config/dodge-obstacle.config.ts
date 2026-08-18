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
 *
 * v4 (2026-08 QA 보정): Easy's session shortened 35s → 10s (spec: "Easy 세션
 * 길이가 너무 길다"); Hard's double-spawn chance is now tier-specific
 * (0.3 → 0.5, see `doubleSpawnChance`) instead of a hardcoded shared 0.3 in
 * dodge-obstacle-patterns.ts; and Extreme gained the green-gap special
 * pattern (`greenGapChance`/`greenGapUnlockMs`) — 2 hazard lanes + 1 explicit
 * safe lane, see dodge-obstacle-patterns.ts#pickGreenGapPattern.
 */
export const DODGE_OBSTACLE_GAME_VERSION = 'dodge_obstacle_v4'

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
  /** Chance per eligible default-spawn tick that it actually double-spawns, once unlocked — tier-specific (was a hardcoded shared 0.3) so Hard can run noticeably more double-spawns than Normal/Extreme without touching them. A tick immediately after a double-spawn never rolls another one (see dodge-obstacle-patterns.ts#pickDefaultSpawn's lastWasDouble), so this chance alone can never chain into "impossible" back-to-back double walls. */
  doubleSpawnChance: number
  /** After this many ms elapsed, multi-step scripted patterns (sweep, gap-shift) start appearing — see lib/game/dodge-obstacle-patterns.ts. Infinity = never. */
  scriptedPatternUnlockMs: number
  /** Chance per eligible spawn tick that a scripted pattern fires instead of the default single/double roll, once unlocked. */
  scriptedPatternChance: number
  /** After this many ms elapsed, the green-gap special pattern (2 hazard lanes + 1 explicit safe lane) may appear — Extreme-only, Infinity everywhere else. */
  greenGapUnlockMs: number
  /** Chance per eligible spawn tick that the green-gap pattern fires instead of the normal spawn roll, once unlocked. 0 for every tier but Extreme. */
  greenGapChance: number
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
    // v4 QA: was 35_000 — 35s felt far too long for the intended "practice" tier.
    durationMs: 10_000,
    initialSpeedPxPerS: 150,
    speedRampPxPerSPerSec: 3,
    speedCapPxPerS: 400,
    initialSpawnIntervalMs: 1700,
    spawnRampMsPerSec: 6,
    spawnFloorMs: 750,
    doubleSpawnUnlockMs: Infinity,
    doubleSpawnChance: 0.3,
    scriptedPatternUnlockMs: Infinity,
    scriptedPatternChance: 0,
    greenGapUnlockMs: Infinity,
    greenGapChance: 0,
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
    doubleSpawnChance: 0.3,
    scriptedPatternUnlockMs: Infinity,
    scriptedPatternChance: 0,
    greenGapUnlockMs: Infinity,
    greenGapChance: 0,
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
    // v4 QA: was the shared default 0.3 — Hard's double-spawn frequency felt
    // too low ("체감상 낮다"). Raised to 0.5 (still capped from chaining into
    // consecutive double-walls by pickDefaultSpawn's lastWasDouble guard).
    doubleSpawnChance: 0.5,
    scriptedPatternUnlockMs: 8_000,
    scriptedPatternChance: 0.35,
    greenGapUnlockMs: Infinity,
    greenGapChance: 0,
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
    doubleSpawnChance: 0.3,
    scriptedPatternUnlockMs: 30_000,
    scriptedPatternChance: 0.22,
    // v4 QA: new green-gap special pattern — appears after 20s survived,
    // rare (12% per eligible tick) so it stays "one of Extreme's special
    // patterns" rather than a dominant mechanic; normal/scripted patterns
    // keep appearing at their usual rates alongside it.
    greenGapUnlockMs: 20_000,
    greenGapChance: 0.12,
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
