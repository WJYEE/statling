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

/**
 * Tier ids whose "업적 달성!" toast has actually been shown at least once —
 * deliberately a separate key from AchievementState's unlockedTierIds/
 * claimedTierIds (lib/missions/achievement-storage.ts): this is a pure UI
 * dedupe for the toast nudge, unrelated to unlock/reward bookkeeping, so it
 * can never affect that migration or the claim flow. Written to as each
 * toast actually fires (see game-flow.tsx), not at unlock time — a tier can
 * be unlocked for a while with no matching entry here yet, while its toast
 * sits deferred during Initial Assessment.
 */
const NOTIFIED_STORAGE_KEY = 'statling.achievements.notified.v1'

function loadNotifiedTierIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(NOTIFIED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function isAchievementNotified(tierId: string): boolean {
  return loadNotifiedTierIds().has(tierId)
}

/**
 * Login/restore regression fix — the full current notified set, for two
 * cross-module readers that need more than a single-tier check:
 * lib/migration/build-local-snapshot.ts#buildAchievementRows (to populate
 * achievements.notified_at per tier on sync) and, transitively, whoever backs
 * up this domain before a restore (lib/migration/restore-local-snapshot.ts).
 * Callers must treat the result as read-only — mutate via
 * markAchievementNotified/restoreNotifiedTierIds only.
 */
export function getNotifiedTierIds(): Set<string> {
  return loadNotifiedTierIds()
}

export function markAchievementNotified(tierId: string): void {
  if (typeof window === 'undefined') return
  const ids = loadNotifiedTierIds()
  if (ids.has(tierId)) return
  ids.add(tierId)
  try {
    window.localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable — the in-memory toast still fired this session, which is what matters most.
  }
}

/**
 * Login/restore regression fix — restore-only wholesale REPLACE of the local
 * notified set, used exclusively by lib/migration/restore-local-snapshot.ts
 * to seed this device with exactly the tier ids whose server-side
 * achievements.notified_at is non-null. Deliberately not built on top of
 * markAchievementNotified's incremental add: a restore means "the server is
 * the source of truth for what this account has already been shown," so a
 * tier NOT in `tierIds` here must end up NOT notified locally either (e.g. a
 * tier this account unlocked on another device but was never actually shown
 * a toast for yet) — an incremental add could never remove a stale local
 * entry. Never fires a toast and never touches AchievementState
 * (unlockedTierIds/claimedTierIds) — purely the "have I shown this toast"
 * bookkeeping this file already owns.
 */
export function restoreNotifiedTierIds(tierIds: readonly string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify([...new Set(tierIds)]))
  } catch {
    // Storage unavailable — same best-effort posture as markAchievementNotified.
  }
}
