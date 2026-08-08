import type { AchievementCategory, AchievementFamilyDef, AchievementMetricKey } from '@/lib/missions/achievements.config'

/** One tier's evaluated state — pure output, no storage/reward/SFX side effects (see lib/missions/achievement-tracker.ts for those). */
export interface AchievementTierProgress {
  familyId: string
  category: AchievementCategory
  tierId: string
  tier: number
  title: string
  description: string
  target: number
  rewardXp: number
  /** The metric's current live value — undefined when that metric wasn't included in this evaluation pass (e.g. a sync-only pass skipping rank metrics). */
  currentValue: number | undefined
  completed: boolean
}

function tierCompleted(direction: 'atLeast' | 'atMost', value: number, target: number): boolean {
  return direction === 'atLeast' ? value >= target : value <= target
}

/**
 * Pure metric-values -> tier-progress mapping — no localStorage, no
 * network, no rewards. Families whose metric isn't present in
 * `metricValues` are simply skipped (not marked incomplete), so a
 * sync-only pass and a full pass can both call this safely with whatever
 * subset of metrics they actually collected.
 */
export function evaluateAchievementFamilies(
  families: AchievementFamilyDef[],
  metricValues: Partial<Record<AchievementMetricKey, number>>,
): AchievementTierProgress[] {
  const progress: AchievementTierProgress[] = []
  for (const family of families) {
    const value = metricValues[family.metric]
    if (value == null) continue
    for (const tier of family.tiers) {
      progress.push({
        familyId: family.familyId,
        category: family.category,
        tierId: tier.id,
        tier: tier.tier,
        title: tier.title,
        description: tier.description,
        target: tier.target,
        rewardXp: tier.rewardXp,
        currentValue: value,
        completed: tierCompleted(family.direction, value, tier.target),
      })
    }
  }
  return progress
}
