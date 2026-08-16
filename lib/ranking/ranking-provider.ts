import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { getAllRecordsAtDifficulty, getCurrentSeasonRecordAtDifficulty, loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import { loadXpState } from '@/lib/ranking/xp-ledger'
import {
  combineGamePercentiles,
  computeParticipantAwarePercentile,
  type GamePercentileInput,
} from '@/lib/ranking/ranking-calculator'
import { getGameRankingMetricConfig, type MetricDirection } from '@/lib/ranking/game-ranking-metrics.config'
import { CURRENT_RANKING_SEASON } from '@/lib/ranking/ranking-season'

export interface OverallRankingQuery {
  displayName: string
  /** Real Supabase user id when logged in, null for a guest. */
  userId?: string | null
}

/** One row of the 종합 랭킹 list — deliberately has no score/percentile field, so the internal composite (see ranking-calculator.ts) can never leak into the UI even by accident. */
export interface OverallRankingEntry {
  id: string
  displayName: string
  isMe: boolean
}

/** Hard is the existing fixed-round format; Extreme is the same game at the harder tier — kept as fully separate leaderboards (see getGameRanking) rather than collapsed into one "representative" record. */
export type RankedDifficulty = 'hard' | 'extreme'

/** One row of a single game's leaderboard — ranked by that game's own raw metric (see lib/ranking/game-ranking-metrics.config.ts), never a 0-100 score. */
export interface GameRankingEntry {
  id: string
  displayName: string
  isMe: boolean
  /** Formatted primary (sort key) metric, e.g. "214ms" or "92%". */
  primaryDisplay: string
  /** Formatted tiebreaker metric, shown as a secondary line — only present when the game defines one. */
  tiebreakerDisplay?: string
}

export interface GameRankingQuery {
  gameId: string
  difficulty: RankedDifficulty
  displayName: string
  userId?: string | null
}

/** One row of the XP 랭킹 list — total XP only, the one place XP is allowed to rank against other players (still never feeds getOverallRanking). */
export interface XpRankingEntry {
  id: string
  displayName: string
  totalXp: number
  isMe: boolean
}

export interface XpRankingQuery {
  displayName: string
  userId?: string | null
}

/**
 * Ranking's swap seam: RankingScreen only ever talks to `rankingProvider`
 * (the singleton below), never to a concrete implementation. Today that's
 * LocalRankingProvider (device-local skill records + deterministic
 * placeholder rivals, no backend). Once a real leaderboard exists
 * server-side, adding a SupabaseRankingProvider that implements this same
 * interface and swapping the singleton's assignment is the entire
 * migration — RankingScreen and every exported type here stay exactly as
 * they are. The calculation math itself (lib/ranking/ranking-calculator.ts)
 * and the per-game metric definitions (lib/ranking/game-ranking-metrics.
 * config.ts) don't change either; only the score/metric pools fed into them
 * stop being synthesized locally and start coming from real rows.
 *
 * XP (lib/ranking/xp-ledger.ts) is only ever read by getXpRanking — never
 * by getOverallRanking or getGameRanking — per spec: XP is a personal
 * growth/profile number that is also allowed its own ranking tab, but must
 * never feed into the mini-game-record-based overall/per-game rankings.
 */
export interface RankingProvider {
  /** 종합 랭킹 — full list sorted best-first, computed from every mini-game the player has a Hard-tier record for (Extreme is deliberately excluded — see getOverallRanking's doc comment), never from XP. Only rank position + name are exposed; see OverallRankingEntry. */
  getOverallRanking(query: OverallRankingQuery): Promise<OverallRankingEntry[]>
  /** One specific game's leaderboard AT ONE DIFFICULTY TIER, sorted by that game's own raw metric (see lib/ranking/game-ranking-metrics.config.ts) — Hard and Extreme are always separate calls/lists, never merged. */
  getGameRanking(query: GameRankingQuery): Promise<GameRankingEntry[]>
  /** XP 랭킹 — full list sorted by totalXp, descending. Independent of getOverallRanking's math. */
  getXpRanking(query: XpRankingQuery): Promise<XpRankingEntry[]>
}

/** Stand-ins for "other players" until a real leaderboard exists — cycled through when a pool is larger than this list. */
const PLACEHOLDER_NAMES = ['몽글이', '또리', '살구', '두부', '콩콩이', '보리', '구름이', '또랑이', '마루', '방울이', '토실이', '나린']

/** Fixed seed for the 종합 랭킹 tab's synthetic roster — one shared leaderboard, not per-gameId like buildRivalScorePool. */
const OVERALL_RIVAL_SEED = 'overall-ranking'
const OVERALL_RIVAL_COUNT = 39

/** Fixed seed for the XP 랭킹 tab's synthetic roster. */
const XP_RIVAL_SEED = 'xp-ranking'
const XP_RIVAL_COUNT = 39
/** Loose upper bound for a synthesized rival's totalXp — plausible "long-time player" ceiling, not derived from anything real. */
const XP_RIVAL_MAX = 4000

/** FNV-1a-ish string hash — deterministic, so the same seed always produces the same placeholder pool (no reshuffling on every remount/session). */
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — tiny deterministic PRNG driven by hashSeed, so a given seed's pool is stable across sessions/devices without needing a stored seed anywhere. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap central-limit approximation of a bell curve in [0, 1) from a PRNG. */
function bellSample(rng: () => number): number {
  return (rng() + rng() + rng()) / 3
}

/** Bell-samples a value inside `[min, max]` — used to synthesize a placeholder rival's raw metric value from a game-ranking-metrics.config.ts range. */
function sampleInRange(rng: () => number, [min, max]: [number, number]): number {
  return min + bellSample(rng) * (max - min)
}

/** 'asc' (lower is better) sorts ascending, 'desc' (higher is better) sorts descending — returns a standard Array#sort comparator result. */
function compareByDirection(a: number, b: number, direction: MetricDirection): number {
  return direction === 'asc' ? a - b : b - a
}

/**
 * One gameId's deterministic placeholder rival scores (0-100 gameScore) —
 * feeds ONLY the internal 종합 랭킹 percentile math (see getOverallRanking),
 * never shown directly. Pool size varies per game (20-140) so the
 * "참가자 수를 고려한" weighting in combineGamePercentiles actually has
 * something to weight. Scores are drawn from three averaged uniforms (a
 * cheap central-limit approximation of a bell curve) centered in the 45-65
 * range, clamped to 0-100.
 */
function buildRivalScorePool(gameId: string): number[] {
  const rng = mulberry32(hashSeed(gameId))
  const participantCount = 20 + Math.floor(rng() * 121) // 20-140
  const center = 45 + Math.floor(rng() * 21) // 45-65
  const scores: number[] = []
  for (let i = 0; i < participantCount; i++) {
    const spread = (bellSample(rng) - 0.5) * 70
    scores.push(Math.min(100, Math.max(0, Math.round(center + spread))))
  }
  return scores
}

/**
 * The 종합 랭킹 tab's synthetic roster — each rival gets its own composite
 * percentile (0-100) directly, rather than being built up from a fake
 * per-game history: these stand-ins have no underlying mini-game records to
 * derive one from, same as buildRivalScorePool's per-game rivals don't have
 * real trial data behind their scores.
 */
function buildOverallRivalPercentiles(): number[] {
  const rng = mulberry32(hashSeed(OVERALL_RIVAL_SEED))
  const percentiles: number[] = []
  for (let i = 0; i < OVERALL_RIVAL_COUNT; i++) {
    percentiles.push(Math.min(100, Math.max(0, Math.round(bellSample(rng) * 100))))
  }
  return percentiles
}

/** The XP 랭킹 탭's synthetic roster — skewed toward lower XP with a long tail toward XP_RIVAL_MAX, roughly how a real cumulative-play metric distributes across a player base. */
function buildXpRivalPool(): number[] {
  const rng = mulberry32(hashSeed(XP_RIVAL_SEED))
  const values: number[] = []
  for (let i = 0; i < XP_RIVAL_COUNT; i++) {
    values.push(Math.round(XP_RIVAL_MAX * rng() ** 2))
  }
  return values
}

function placeholderNameFor(seed: string, index: number): string {
  const base = PLACEHOLDER_NAMES[(hashSeed(seed) + index) % PLACEHOLDER_NAMES.length]
  const cycle = Math.floor((hashSeed(seed) + index) / PLACEHOLDER_NAMES.length)
  return cycle > 0 ? `${base} #${cycle + 1}` : base
}

class LocalRankingProvider implements RankingProvider {
  /**
   * Sorts "나" (when she has at least one Hard-tier mini-game record)
   * together with a synthetic rival roster by an internal composite
   * percentile. Deliberately reads getAllRecordsAtDifficulty(state, 'hard')
   * rather than "whatever tier was last attempted" — Extreme records are
   * excluded from this composite entirely per spec (Extreme stays a
   * separate per-game leaderboard only, see getGameRanking) so a handful of
   * Extreme clears can't skew 종합 랭킹 against players who've only reached
   * Hard. The composite itself is stripped from every entry before
   * returning, so OverallRankingEntry (and therefore the UI) never sees it.
   */
  async getOverallRanking(query: OverallRankingQuery): Promise<OverallRankingEntry[]> {
    const hardRecords = getAllRecordsAtDifficulty(loadPlayerSkillState(), 'hard')
    // Same Ranking Season gate as getGameRanking below — a Hard record set
    // under an old, no-longer-comparable game-rules version never feeds the
    // composite percentile either.
    const gameIds = Object.keys(hardRecords).filter((gameId) => hardRecords[gameId].recordVersion === CURRENT_RANKING_SEASON)

    const rivalEntries = buildOverallRivalPercentiles().map((percentile, i) => ({
      id: `overall_rival_${i}`,
      displayName: placeholderNameFor(OVERALL_RIVAL_SEED, i),
      isMe: false,
      percentile,
    }))

    let myEntry: (typeof rivalEntries)[number] | null = null
    if (gameIds.length > 0) {
      const percentileInputs: GamePercentileInput[] = gameIds.map((gameId) => {
        const rivalScores = buildRivalScorePool(gameId)
        return {
          percentile: computeParticipantAwarePercentile(hardRecords[gameId].normalizedScore, rivalScores),
          participantCount: rivalScores.length,
        }
      })
      const composite = combineGamePercentiles(percentileInputs)
      if (composite != null) {
        myEntry = {
          id: query.userId ?? getOrCreateDeviceId(),
          displayName: query.displayName || '게스트',
          isMe: true,
          percentile: composite,
        }
      }
    }

    const all = myEntry ? [...rivalEntries, myEntry] : rivalEntries
    return all
      .sort((a, b) => b.percentile - a.percentile)
      .map(({ id, displayName, isMe }) => ({ id, displayName, isMe }))
  }

  /**
   * Ranked by the game's own raw metric (lib/ranking/game-ranking-metrics.
   * config.ts), e.g. reaction's median ms or memory's accuracy — never a
   * 0-100 score. Hard and Extreme are always queried (and therefore ranked)
   * completely separately: the synthetic rival pool is seeded per
   * `${gameId}:${difficulty}`, and "나"'s row reads
   * getRecordAtDifficulty(state, gameId, difficulty), which never falls
   * back to a different tier. "나" only appears once she has a saved
   * `metrics` bag for that exact game+tier (see lib/game/
   * player-skill-storage.ts#MiniGamePerformanceRecord.metrics) — a record
   * saved before that field existed, or no record at that tier at all,
   * both mean she's simply absent from this list, same as a real player
   * with no submitted score.
   */
  async getGameRanking(query: GameRankingQuery): Promise<GameRankingEntry[]> {
    const metricConfig = getGameRankingMetricConfig(query.gameId, query.difficulty)
    if (!metricConfig) return []

    const seed = `${query.gameId}:${query.difficulty}`
    const rng = mulberry32(hashSeed(seed))
    const participantCount = 20 + Math.floor(rng() * 81) // 20-100

    interface RivalRow {
      id: string
      displayName: string
      isMe: boolean
      primary: number
      tiebreaker?: number
    }

    const rivalEntries: RivalRow[] = Array.from({ length: participantCount }, (_, i) => ({
      id: `${seed}_rival_${i}`,
      displayName: placeholderNameFor(seed, i),
      isMe: false,
      primary: sampleInRange(rng, metricConfig.primary.syntheticRange),
      tiebreaker: metricConfig.tiebreaker ? sampleInRange(rng, metricConfig.tiebreaker.syntheticRange) : undefined,
    }))

    // Ranking Season gate: a record set before the current game-rules rework
    // (recordVersion missing or stale) never enters the CURRENT leaderboard —
    // "나" simply won't show up here until she replays and sets a fresh
    // record, same as a real player with no submitted score. This is
    // deliberately separate from Hard/Extreme unlock (lib/game/
    // difficulty-unlock.ts), which reads gameDifficultyBestRecords directly
    // and never checks recordVersion — an old record still counts for
    // unlock, it just can't win a new-season leaderboard. See
    // lib/ranking/ranking-season.ts.
    const myRecord = getCurrentSeasonRecordAtDifficulty(loadPlayerSkillState(), query.gameId, query.difficulty)
    const myPrimary = myRecord?.metrics?.[metricConfig.primary.key]
    const myEntry: RivalRow | null =
      myRecord && typeof myPrimary === 'number'
        ? {
            id: query.userId ?? getOrCreateDeviceId(),
            displayName: query.displayName || '게스트',
            isMe: true,
            primary: myPrimary,
            tiebreaker: metricConfig.tiebreaker ? myRecord.metrics?.[metricConfig.tiebreaker.key] : undefined,
          }
        : null

    const all = myEntry ? [...rivalEntries, myEntry] : rivalEntries
    all.sort((a, b) => {
      const primaryCmp = compareByDirection(a.primary, b.primary, metricConfig.primary.direction)
      if (primaryCmp !== 0 || !metricConfig.tiebreaker) return primaryCmp
      return compareByDirection(a.tiebreaker ?? 0, b.tiebreaker ?? 0, metricConfig.tiebreaker.direction)
    })

    return all.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      isMe: entry.isMe,
      primaryDisplay: metricConfig.primary.format(entry.primary),
      tiebreakerDisplay:
        metricConfig.tiebreaker && entry.tiebreaker != null ? metricConfig.tiebreaker.format(entry.tiebreaker) : undefined,
    }))
  }

  async getXpRanking(query: XpRankingQuery): Promise<XpRankingEntry[]> {
    const rivalEntries: XpRankingEntry[] = buildXpRivalPool().map((totalXp, i) => ({
      id: `xp_rival_${i}`,
      displayName: placeholderNameFor(XP_RIVAL_SEED, i),
      totalXp,
      isMe: false,
    }))

    const myEntry: XpRankingEntry = {
      id: query.userId ?? getOrCreateDeviceId(),
      displayName: query.displayName || '게스트',
      totalXp: loadXpState().totalXp,
      isMe: true,
    }

    return [...rivalEntries, myEntry].sort((a, b) => b.totalXp - a.totalXp)
  }
}

export const rankingProvider: RankingProvider = new LocalRankingProvider()
