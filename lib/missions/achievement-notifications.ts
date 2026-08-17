import type { AchievementTierProgress } from '@/lib/missions/achievement-evaluator'

type UnlockListener = (tier: AchievementTierProgress) => void

const listeners = new Set<UnlockListener>()

/**
 * Minimal in-memory pub-sub bridging mission-tracker.ts (a plain module,
 * called from every screen/hook that tracks a gameplay event — game-flow.tsx,
 * use-pet-care.ts, theme-screen.tsx, statling-screen.tsx, my-page-screen.tsx)
 * to the one place that can actually show a toast for "you just unlocked an
 * achievement": GameFlow, the always-mounted root component (see its own
 * subscribeToAchievementUnlocks effect). Deliberately NOT persisted — this
 * is a transient "heads up" nudge, not a durable notification. If the tab
 * closes before it fires, nothing is lost: the unlock itself
 * (AchievementState.unlockedTierIds) is already safely persisted by the
 * time this publishes, so the Achievement tab shows the tier as
 * completed/미수령 regardless of whether the toast was ever seen.
 */
export function subscribeToAchievementUnlocks(listener: UnlockListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishAchievementUnlocked(tiers: readonly AchievementTierProgress[]): void {
  if (tiers.length === 0 || listeners.size === 0) return
  for (const tier of tiers) {
    for (const listener of listeners) listener(tier)
  }
}
