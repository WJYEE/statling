/**
 * Per-game ranking metric definitions — the ONLY place that decides what
 * "raw record" a game's leaderboard ranks by (e.g. reaction time in ms vs
 * accuracy %), so adding a new registered game (see lib/game/game-registry.ts)
 * only ever means adding one entry here, never touching
 * lib/ranking/ranking-provider.ts's ranking/sorting logic itself.
 *
 * Each metric reads a named key out of the flat `metrics` bag every mini-game
 * completion now saves alongside its normalizedScore (see
 * lib/game/player-skill-storage.ts#MiniGamePerformanceRecord.metrics) — the
 * keys used below must match exactly what components/brain-bet/game-flow.tsx's
 * on*Complete handlers write into that bag for the same gameId.
 */

export type MetricDirection = 'asc' | 'desc'

export interface RankingMetricDef {
  /** Key into a MiniGamePerformanceRecord's `metrics` bag. */
  key: string
  /** Shown as the row's small label context, e.g. "평균 반응속도". */
  label: string
  /** 'asc' = lower is better (e.g. reaction ms), 'desc' = higher is better (e.g. accuracy). */
  direction: MetricDirection
  /** Renders a raw metric value into display text, e.g. 214 -> "214ms". */
  format: (value: number) => string
  /** [min, max] plausible raw-value range placeholder rivals are bell-sampled from — see lib/ranking/ranking-provider.ts. Purely cosmetic mock data, replaced once real rival records exist. */
  syntheticRange: [number, number]
}

export interface GameRankingMetricConfig {
  /** The leaderboard's sort key. */
  primary: RankingMetricDef
  /** Breaks ties on `primary` — shown as a secondary line under the rank row, never sorted on its own. */
  tiebreaker?: RankingMetricDef
}

/**
 * Hard and Extreme usually measure the exact same thing (Extreme is Hard's
 * same fixed-round format under harder parameters — see
 * lib/config/difficulty.config.ts's time/load multipliers), so `default`
 * covers both unless a game defines a tier-specific override. That override
 * is the extension point for a game whose Extreme tier becomes a
 * fundamentally different format later (e.g. an endless/survival mode
 * ranked by "라운드 도달"/"생존 시간" instead of Hard's fixed-round metric) —
 * see getGameRankingMetricConfig.
 */
export interface GameRankingMetricsByDifficulty {
  default: GameRankingMetricConfig
  hard?: GameRankingMetricConfig
  extreme?: GameRankingMetricConfig
}

const ms = (value: number) => `${Math.round(value)}ms`
const seconds = (value: number) => `${(value / 1000).toFixed(1)}초`
const percentFraction = (value: number) => `${Math.round(value * 100)}%`
const countUnit = (unit: string) => (value: number) => `${Math.round(value)}${unit}`

/** Keyed by lib/game/game-registry.ts's GamePoolEntry.key — one entry per registered game, every stat's pool covered. */
export const GAME_RANKING_METRICS: Record<string, GameRankingMetricsByDifficulty> = {
  'reaction-classic': {
    default: {
      primary: { key: 'medianReactionMs', label: '평균 반응속도', direction: 'asc', format: ms, syntheticRange: [200, 550] },
      tiebreaker: { key: 'consistency', label: '반응 편차', direction: 'asc', format: ms, syntheticRange: [10, 90] },
    },
  },
  'reaction-dodge-run': {
    // v3 (후속 보정): only Extreme is endless now — Hard runs a fixed 40s
    // clock, so its survivedMs is a near-constant and can no longer rank
    // anyone. Hard ranks by obstaclesDodged (fixed-duration -> dodge count
    // is the discriminating stat), tiebroken by fewest collisions. Extreme
    // keeps ranking by real survivedMs (a run always ends on collision).
    default: {
      primary: { key: 'survivedMs', label: '생존 시간', direction: 'desc', format: seconds, syntheticRange: [3000, 90000] },
      tiebreaker: { key: 'obstaclesDodged', label: '회피 횟수', direction: 'desc', format: countUnit('회'), syntheticRange: [3, 120] },
    },
    hard: {
      primary: { key: 'obstaclesDodged', label: '회피 횟수', direction: 'desc', format: countUnit('회'), syntheticRange: [15, 70] },
      tiebreaker: { key: 'collisions', label: '충돌 횟수', direction: 'asc', format: countUnit('회'), syntheticRange: [0, 15] },
    },
    extreme: {
      primary: { key: 'survivedMs', label: '생존 시간', direction: 'desc', format: seconds, syntheticRange: [3000, 90000] },
      tiebreaker: { key: 'obstaclesDodged', label: '회피 횟수', direction: 'desc', format: countUnit('회'), syntheticRange: [3, 120] },
    },
  },
  'memory-classic': {
    default: {
      primary: { key: 'weightedAccuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageAdjustedResponseTimeMs', label: '평균 소요시간', direction: 'asc', format: ms, syntheticRange: [900, 3000] },
    },
  },
  'memory-story-recall': {
    default: {
      primary: { key: 'accuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [1200, 4000] },
    },
  },
  'focus-classic': {
    default: {
      primary: { key: 'weightedAccuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [500, 2200] },
    },
  },
  'focus-color-target': {
    default: {
      primary: { key: 'accuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageReactionTimeMs', label: '평균 반응속도', direction: 'asc', format: ms, syntheticRange: [250, 1000] },
    },
  },
  'judgment-classic': {
    // v2 (2026-08 후속 보정): Hard/Extreme now genuinely use 4-way input, so
    // a fixed 10s session's raw processed/correct-block THROUGHPUT varies a
    // lot more by difficulty than before — ranking on correctBlocks would
    // reward a fast-but-sloppy player over an accurate one. Accuracy is the
    // fairer primary axis; switchAccuracy (Judgment's signature "adapt the
    // instant the rule changes" skill) breaks ties.
    default: {
      primary: { key: 'overallAccuracy', label: '정확도', direction: 'desc', format: percentFraction, syntheticRange: [0.4, 1] },
      tiebreaker: { key: 'switchAccuracy', label: '전환 직후 정확도', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
    },
  },
  'decision-best-choice': {
    default: {
      primary: { key: 'accuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [1200, 6000] },
    },
  },
  'spatial-classic': {
    default: {
      primary: { key: 'difficultyWeightedAccuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [1500, 6000] },
    },
  },
  'spatial-fit-puzzle': {
    default: {
      primary: { key: 'totalCompletionMs', label: '완성 시간', direction: 'asc', format: seconds, syntheticRange: [15000, 80000] },
      tiebreaker: { key: 'misplacements', label: '오배치 횟수', direction: 'asc', format: countUnit('회'), syntheticRange: [0, 12] },
    },
  },
  'reasoning-classic': {
    default: {
      primary: { key: 'difficultyWeightedAccuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [1500, 6000] },
    },
  },
  'reasoning-number-pattern': {
    default: {
      primary: { key: 'accuracy', label: '정답률', direction: 'desc', format: percentFraction, syntheticRange: [0.3, 1] },
      tiebreaker: { key: 'averageResponseTimeMs', label: '평균 응답시간', direction: 'asc', format: ms, syntheticRange: [1500, 6000] },
    },
  },
}

/** Resolves a gameId + Hard/Extreme tier to its ranking metric config — tier override first, falling back to the game's shared `default`. Null when gameId isn't registered here at all. */
export function getGameRankingMetricConfig(
  gameId: string,
  difficulty: 'hard' | 'extreme',
): GameRankingMetricConfig | null {
  const entry = GAME_RANKING_METRICS[gameId]
  if (!entry) return null
  return entry[difficulty] ?? entry.default
}
