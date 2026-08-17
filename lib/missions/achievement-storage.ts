/** Permanent record of every achievement tier ever unlocked/claimed — see lib/missions/mission-tracker.ts, the only writer. */
export interface AchievementState {
  version: 1
  /** Tier ids whose condition has been met — set the instant a metric crosses the target, independent of whether the reward has actually been collected yet (see claimedTierIds). "Unlocked" here means "completed," not "rewarded." */
  unlockedTierIds: string[]
  /** Tier ids whose XP/Room reward has actually been granted, via mission-tracker.ts#claimAchievementReward — always a subset of unlockedTierIds. */
  claimedTierIds: string[]
  updatedAt: string
}

const STORAGE_KEY = 'statling.achievements.v1'

export function createDefaultAchievementState(): AchievementState {
  return { version: 1, unlockedTierIds: [], claimedTierIds: [], updatedAt: new Date(0).toISOString() }
}

/**
 * One-time migration for AchievementState persisted before the unlock/claim
 * split shipped: every tier already in `unlockedTierIds` at that point was,
 * under the old system, ALSO already auto-granted its XP and Room reward the
 * instant it unlocked — so it must be treated as already claimed here, or
 * the player could claim (and re-earn) a reward they already have. Detected
 * by the `claimedTierIds` FIELD being absent, not merely empty, so a
 * genuinely fresh player who hasn't unlocked anything yet (both arrays
 * legitimately empty, field present) is never mistaken for pre-migration
 * data. Never calls addXp/grantRoomReward/SFX/toast — those already ran,
 * once, historically; this only backfills the bookkeeping field.
 */
function needsClaimedMigration(parsed: Record<string, unknown>): boolean {
  return !Array.isArray(parsed.claimedTierIds)
}

export function loadAchievementState(): AchievementState {
  if (typeof window === 'undefined') return createDefaultAchievementState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultAchievementState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || !Array.isArray(parsed.unlockedTierIds)) return createDefaultAchievementState()

    const unlockedTierIds = (parsed.unlockedTierIds as unknown[]).filter((id): id is string => typeof id === 'string')
    const migrating = needsClaimedMigration(parsed)
    const claimedTierIds = migrating
      ? [...unlockedTierIds] // pre-split data — every already-unlocked tier was already auto-rewarded
      : (parsed.claimedTierIds as unknown[]).filter((id): id is string => typeof id === 'string')

    const state: AchievementState = {
      version: 1,
      unlockedTierIds,
      claimedTierIds,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
    // Persist immediately so this migration runs at most once per device —
    // the next load() will see claimedTierIds already present and skip it.
    if (migrating) saveAchievementState(state)
    return state
  } catch {
    return createDefaultAchievementState()
  }
}

export function saveAchievementState(state: AchievementState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
