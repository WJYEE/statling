import type { RawRecord } from '@/lib/brain-bet'
import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { getAllRepresentativeRecords, getRepresentativeRecord, loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import {
  combineGamePercentiles,
  computeParticipantAwarePercentile,
  percentileToOverallRank,
  type GamePercentileInput,
} from '@/lib/ranking/ranking-calculator'

export interface OverallRankingQuery {
  displayName: string
  /** Real Supabase user id when logged in, null for a guest. */
  userId?: string | null
}

export interface OverallRankingResult {
  /** Null when the player hasn't completed a single mini-game yet — there is nothing to rank. RankingScreen shows an empty state in that case, never "0위"/"N/A위". */
  rank: number | null
}

/** One row of a single game's leaderboard — ranked by that game's own normalizedScore (see LocalRankingProvider.getGameRanking's doc comment for why that counts as "raw record 기준"). */
export interface GameRankingEntry {
  id: string
  displayName: string
  normalizedScore: number
  /** This entry's real display record (e.g. "평균 205ms"), when known — placeholder rivals never have one, only "나" (once she has a saved record — see lib/game/player-skill-storage.ts#MiniGamePerformanceRecord.raw). */
  raw: RawRecord | null
  isMe: boolean
}

export interface GameRankingQuery {
  gameId: string
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
 * doesn't change either; only the score pools fed into it stop being
 * synthesized locally and start coming from real rows.
 *
 * XP (lib/ranking/xp-ledger.ts) is deliberately never read anywhere in this
 * file — per spec, XP is a personal growth/profile number only and must
 * never feed into any ranking computation.
 */
export interface RankingProvider {
  /** "종합 랭킹 N위" — computed from every mini-game the player has a representative record for, never from XP. See lib/ranking/ranking-calculator.ts for the percentile/combine math. */
  getOverallRanking(query: OverallRankingQuery): Promise<OverallRankingResult>
  /** One specific game's leaderboard, sorted by that game's own normalizedScore (its own raw-record-derived gameScore) — descending, best first. */
  getGameRanking(query: GameRankingQuery): Promise<GameRankingEntry[]>
}

/** Stand-ins for "other players" until a real leaderboard exists — cycled through when a game's synthesized pool is larger than this list. */
const PLACEHOLDER_NAMES = ['몽글이', '또리', '살구', '두부', '콩콩이', '보리', '구름이', '또랑이', '마루', '방울이', '토실이', '나린']

/** Synthesized "how many players exist server-side" — swapped for a real count once a backend can supply one. See percentileToOverallRank. */
const OVERALL_POOL_SIZE = 500

/** FNV-1a-ish string hash — deterministic, so the same gameId always seeds the same placeholder pool (no reshuffling on every remount/session). */
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — tiny deterministic PRNG driven by hashSeed, so a given gameId's rival pool is stable across sessions/devices without needing a stored seed anywhere. */
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

/**
 * One gameId's deterministic placeholder rival scores (0-100). Pool size
 * varies per game (20-140) so the "참가자 수를 고려한" weighting in
 * combineGamePercentiles actually has something to weight — some games
 * read as more established than others, same as a real leaderboard would
 * look before every game has equal play counts. Scores are drawn from three
 * averaged uniforms (a cheap central-limit approximation of a bell curve)
 * centered in the 45-65 range, clamped to 0-100.
 */
function buildRivalScorePool(gameId: string): number[] {
  const seed = hashSeed(gameId)
  const rng = mulberry32(seed)
  const participantCount = 20 + Math.floor(rng() * 121) // 20-140
  const center = 45 + Math.floor(rng() * 21) // 45-65
  const scores: number[] = []
  for (let i = 0; i < participantCount; i++) {
    const bell = (rng() + rng() + rng()) / 3 // ~triangular, biased toward center
    const spread = (bell - 0.5) * 70
    scores.push(Math.min(100, Math.max(0, Math.round(center + spread))))
  }
  return scores
}

function placeholderNameFor(gameId: string, index: number): string {
  const base = PLACEHOLDER_NAMES[(hashSeed(gameId) + index) % PLACEHOLDER_NAMES.length]
  const cycle = Math.floor((hashSeed(gameId) + index) / PLACEHOLDER_NAMES.length)
  return cycle > 0 ? `${base} #${cycle + 1}` : base
}

class LocalRankingProvider implements RankingProvider {
  async getOverallRanking(_query: OverallRankingQuery): Promise<OverallRankingResult> {
    const representatives = getAllRepresentativeRecords(loadPlayerSkillState())
    const gameIds = Object.keys(representatives)
    if (gameIds.length === 0) return { rank: null }

    const percentileInputs: GamePercentileInput[] = gameIds.map((gameId) => {
      const rivals = buildRivalScorePool(gameId)
      return {
        percentile: computeParticipantAwarePercentile(representatives[gameId].normalizedScore, rivals),
        participantCount: rivals.length,
      }
    })

    const composite = combineGamePercentiles(percentileInputs)
    if (composite == null) return { rank: null }
    return { rank: percentileToOverallRank(composite, OVERALL_POOL_SIZE) }
  }

  /**
   * Ranked by normalizedScore (each game's own 0-100 gameScore), not a
   * fabricated cross-game composite: gameScore is already computed
   * per-game from exactly the raw metric that game promises to measure
   * (e.g. reaction's is 70% median-ms-based, judgment's is accuracy-based —
   * see lib/scoring/*.ts), so ranking by it here IS ranking by "해당 게임
   * 기준의 raw record", just already normalized to a comparable 0-100
   * scale. "나"'s row additionally carries her real formatted raw text
   * (raw.primary, e.g. "평균 205ms") when a saved record has one; synthetic
   * placeholder rivals have no real raw text to show, since there is no
   * real backend yet.
   */
  async getGameRanking(query: GameRankingQuery): Promise<GameRankingEntry[]> {
    const rivalScores = buildRivalScorePool(query.gameId)
    const rivalEntries: GameRankingEntry[] = rivalScores.map((score, i) => ({
      id: `${query.gameId}_rival_${i}`,
      displayName: placeholderNameFor(query.gameId, i),
      normalizedScore: score,
      raw: null,
      isMe: false,
    }))

    const myRecord = getRepresentativeRecord(loadPlayerSkillState(), query.gameId)
    const myEntry: GameRankingEntry | null = myRecord
      ? {
          id: query.userId ?? getOrCreateDeviceId(),
          displayName: query.displayName || '게스트',
          normalizedScore: myRecord.normalizedScore,
          raw: myRecord.raw ?? null,
          isMe: true,
        }
      : null

    const entries = myEntry ? [...rivalEntries, myEntry] : rivalEntries
    return entries.sort((a, b) => b.normalizedScore - a.normalizedScore)
  }
}

export const rankingProvider: RankingProvider = new LocalRankingProvider()
