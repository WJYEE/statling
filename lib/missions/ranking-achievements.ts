import { getAllRecordsAtDifficulty, loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import { rankingProvider } from '@/lib/ranking/ranking-provider'
import { ACHIEVEMENT_FAMILIES, RANK_ACHIEVEMENT_METRICS, type AchievementMetricKey } from '@/lib/missions/achievements.config'
import { evaluateAchievementFamilies, type AchievementTierProgress } from '@/lib/missions/achievement-evaluator'
import { applyNewlyUnlockedAchievements } from '@/lib/missions/mission-tracker'

const RANK_FAMILIES = ACHIEVEMENT_FAMILIES.filter((family) => RANK_ACHIEVEMENT_METRICS.includes(family.metric))

/**
 * The one place bestGameRank/overallRank get read — both need an async
 * lib/ranking/ranking-provider.ts call, so this is kept out of
 * lib/missions/mission-tracker.ts's synchronous track* choke points and
 * only ever called from MissionScreen when 업적 tab is opened.
 * `bestGameRank` is the best (lowest) rank across every Hard-tier game the
 * player has a record for — matches the achievement's "특정 게임 Top N"
 * wording (at least one game, not every game).
 */
async function collectRankMetricValues(
  displayName: string,
  userId: string | null,
): Promise<Partial<Record<AchievementMetricKey, number>>> {
  const overallEntries = await rankingProvider.getOverallRanking({ displayName, userId })
  const overallIndex = overallEntries.findIndex((entry) => entry.isMe)
  const overallRank = overallIndex >= 0 ? overallIndex + 1 : Number.POSITIVE_INFINITY

  const hardRecords = getAllRecordsAtDifficulty(loadPlayerSkillState(), 'hard')
  let bestGameRank = Number.POSITIVE_INFINITY
  for (const gameId of Object.keys(hardRecords)) {
    const entries = await rankingProvider.getGameRanking({ gameId, difficulty: 'hard', displayName, userId })
    const index = entries.findIndex((entry) => entry.isMe)
    if (index >= 0) bestGameRank = Math.min(bestGameRank, index + 1)
  }

  return { overallRank, bestGameRank }
}

/**
 * Evaluates + unlocks (marks completed) ONLY the rank-based families
 * (bestGameRank/overallRank) — pair with lib/missions/mission-tracker.ts's
 * evaluateSyncAchievements for the full picture. Routes through the same
 * applyNewlyUnlockedAchievements as every sync family, so a rank tier
 * reaching its target here also lands in `completed_unclaimed` rather than
 * auto-granting — the player still has to open 업적 and press "보상 받기",
 * exactly like every other family.
 */
export async function evaluateRankAchievements(
  displayName: string,
  userId: string | null,
): Promise<AchievementTierProgress[]> {
  const values = await collectRankMetricValues(displayName, userId)
  const progress = evaluateAchievementFamilies(RANK_FAMILIES, values)
  applyNewlyUnlockedAchievements(progress)
  return progress
}
