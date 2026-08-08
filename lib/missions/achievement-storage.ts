/** Permanent record of every achievement tier ever unlocked+rewarded — see lib/missions/achievement-tracker.ts, the only writer. */
export interface AchievementState {
  version: 1
  unlockedTierIds: string[]
  updatedAt: string
}

const STORAGE_KEY = 'statling.achievements.v1'

export function createDefaultAchievementState(): AchievementState {
  return { version: 1, unlockedTierIds: [], updatedAt: new Date(0).toISOString() }
}

export function loadAchievementState(): AchievementState {
  if (typeof window === 'undefined') return createDefaultAchievementState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultAchievementState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || !Array.isArray(parsed.unlockedTierIds)) return createDefaultAchievementState()
    return {
      version: 1,
      unlockedTierIds: (parsed.unlockedTierIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return createDefaultAchievementState()
  }
}

export function saveAchievementState(state: AchievementState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
