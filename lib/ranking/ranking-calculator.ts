/**
 * Pure ranking math — no localStorage, no player-skill-storage, no network.
 * Deliberately separate from lib/ranking/ranking-provider.ts (which owns
 * *where the numbers come from* — local placeholder rivals today, a real
 * Supabase leaderboard later) so that swap never has to touch this file:
 * a SupabaseRankingProvider only needs to feed real rival scores and real
 * participant counts into the exact same functions below.
 */

/** One mini-game's contribution to the overall rank — never shown to the user directly, only fed into combineGamePercentiles. */
export interface GamePercentileInput {
  /** This game's participant-count-aware percentile (0-100, higher = better) for the player. */
  percentile: number
  /** How many players (real + placeholder) that percentile was computed against. */
  participantCount: number
}

/**
 * Percentile of `myScore` within `rivalScores` (0-100, higher = better).
 * Counts rivals strictly below as full credit and ties as half credit,
 * divided by the pool size — NOT a naive "index in sorted list" rank, so
 * the result is comparable across games with very different pool sizes
 * (participant-count aware, per spec: "참가자 수를 고려한 백분위").
 */
export function computeParticipantAwarePercentile(myScore: number, rivalScores: number[]): number {
  if (rivalScores.length === 0) return 100
  let below = 0
  let tied = 0
  for (const score of rivalScores) {
    if (score < myScore) below++
    else if (score === myScore) tied++
  }
  return ((below + tied * 0.5) / rivalScores.length) * 100
}

/**
 * Combines every played game's percentile into ONE internal composite
 * (0-100) — the "종합 랭킹 계산용" number spec explicitly forbids showing
 * to the user (see percentileToOverallRank, the only thing derived from
 * this that ever reaches the UI). Weighted by participantCount rather than
 * a simple average, so a game with a deep rival pool (a well-established
 * leaderboard) counts for more than one almost nobody has played yet —
 * this is the "단순 순위 평균은 사용하지 말고" requirement.
 * Returns null when there is nothing to combine (player hasn't completed
 * any mini-game yet) — callers should treat that as "no rank yet", not 0.
 */
export function combineGamePercentiles(inputs: GamePercentileInput[]): number | null {
  if (inputs.length === 0) return null
  const totalWeight = inputs.reduce((sum, g) => sum + g.participantCount, 0)
  if (totalWeight === 0) return null
  const weightedSum = inputs.reduce((sum, g) => sum + g.percentile * g.participantCount, 0)
  return weightedSum / totalWeight
}

/**
 * Maps an internal composite percentile to a 1-based rank within a
 * synthesized total-player pool (`totalPoolSize`) — the ONLY number
 * RankingScreen is allowed to render ("종합 랭킹 N위"), never the
 * composite percentile itself. `totalPoolSize` stands in for "however many
 * players actually exist" until a real backend can supply the true count;
 * swapping to Supabase later only means passing a real count here instead
 * of a constant.
 */
export function percentileToOverallRank(compositePercentile: number, totalPoolSize: number): number {
  const clamped = Math.min(100, Math.max(0, compositePercentile))
  const rank = Math.round(((100 - clamped) / 100) * (totalPoolSize - 1)) + 1
  return Math.min(totalPoolSize, Math.max(1, rank))
}
