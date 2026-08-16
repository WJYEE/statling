export type DodgeLane = 0 | 1 | 2

/**
 * Multi-tick scripted patterns — each inner array is one spawn tick's lane
 * set, consumed one tick at a time (see dodge-obstacle-game.tsx's
 * scriptedQueueRef). Every tick spawns at most 2 of the 3 lanes, so at
 * least one lane is always open on every single tick — an "impossible"
 * pattern (all 3 lanes blocked at once) can never be produced by
 * construction, scripted or not.
 */
const SCRIPTED_PATTERNS: Record<string, DodgeLane[][]> = {
  'sweep-lr': [[0], [1], [2]],
  'sweep-rl': [[2], [1], [0]],
  /** The one open lane shifts every tick, forcing the player to keep moving rather than settling into one lane. */
  'gap-shift': [
    [0, 1],
    [1, 2],
    [0, 2],
  ],
}

const SCRIPTED_PATTERN_IDS = Object.keys(SCRIPTED_PATTERNS)

/** Picks one full scripted sequence (2-3 ticks) to enqueue — see DODGE_OBSTACLE_SCRIPTED_PATTERN_UNLOCK_MS/_CHANCE in lib/config/dodge-obstacle.config.ts for when/how often this fires. */
export function pickScriptedPattern(rng: () => number = Math.random): DodgeLane[][] {
  const id = SCRIPTED_PATTERN_IDS[Math.floor(rng() * SCRIPTED_PATTERN_IDS.length)]
  return SCRIPTED_PATTERNS[id]
}

/**
 * The default (non-scripted) single-tick spawn — single lane most of the
 * time (never repeating the immediately-previous spawn lane, same as
 * before this rework), or once double-spawns are unlocked, an occasional
 * 2-lane spawn that always leaves exactly one lane open. `doubleChance` is
 * tier-specific (see DodgeObstacleTierConfig.doubleSpawnChance — Hard runs
 * noticeably higher than Normal/Extreme); `lastWasDouble` blocks the roll
 * entirely right after a double-spawn tick, so no tier can ever chain two
 * double-spawns back to back regardless of how high its chance is set.
 */
export function pickDefaultSpawn(opts: {
  canDouble: boolean
  lastLane: DodgeLane | null
  lastWasDouble?: boolean
  doubleChance?: number
  rng?: () => number
}): DodgeLane[] {
  const rng = opts.rng ?? Math.random
  const allLanes: DodgeLane[] = [0, 1, 2]
  const doubleChance = opts.doubleChance ?? 0.3
  if (opts.canDouble && !opts.lastWasDouble && rng() < doubleChance) {
    const shuffled = [...allLanes].sort(() => rng() - 0.5)
    return shuffled.slice(0, 2) as DodgeLane[]
  }
  const candidates = allLanes.filter((l) => l !== opts.lastLane)
  const pool = candidates.length > 0 ? candidates : allLanes
  return [pool[Math.floor(rng() * pool.length)]]
}

/**
 * Extreme-only special pattern (v4 QA): 2 hazard lanes + 1 explicit "safe"
 * lane the player must move into — a green marker, never a real obstacle
 * (see dodge-obstacle-game.tsx's `kind: 'safe'` handling, which never
 * counts a safe marker as a collision regardless of which lane the player
 * is standing in). Always exactly 1 safe lane among the 3, so — same as
 * every other spawn shape in this file — a genuinely unavoidable pattern
 * can never be produced by construction.
 */
export function pickGreenGapPattern(rng: () => number = Math.random): { hazardLanes: DodgeLane[]; safeLane: DodgeLane } {
  const allLanes: DodgeLane[] = [0, 1, 2]
  const safeLane = allLanes[Math.floor(rng() * allLanes.length)]
  const hazardLanes = allLanes.filter((l) => l !== safeLane)
  return { hazardLanes, safeLane }
}
