/**
 * Cross-account contamination fix — this device's local game state (pet
 * profile, XP, achievements, activity counters, ...) has never carried any
 * notion of WHICH account it belongs to. Logout (see
 * lib/auth/supabase-auth-provider.tsx#signOut) never clears it either — it
 * only clears the in-memory sync-session registry, by design, so a plain
 * reload while still signed in doesn't lose anything. That combination is
 * exactly what let account A's local Statling get silently uploaded into
 * account B's Supabase rows: A logs out, B signs up on the SAME device, B
 * has no server pet yet (Case D/E in restore-conflict.ts), and both the
 * migration gate (migration-orchestrator.ts#isLocalPetMigrationReady) and
 * game-flow.tsx's own phase-routing effect trusted whatever
 * loadStoredPetProfile() returned as if it always belonged to whoever is
 * CURRENTLY authenticated.
 *
 * This one small marker fixes both call sites without adding a new
 * migration or touching the other 17 restore/migration domains: `null`
 * means "unclaimed" (a guest's own data, or a device from before this
 * marker existed) — eligible for the FIRST account that legitimately claims
 * it, preserving guest -> first signup migration. A real value means "this
 * device's local game state currently reflects exactly this account" — set
 * once local and server are known to agree (a successful migration, a
 * successful restore, or an explicit Case C conflict resolution — see each
 * call site). Any authenticated user whose id doesn't match an existing
 * marker must never have that local data trusted or migrated for them.
 */

const STORAGE_KEY = 'statling.localDataOwner.v1'

export function loadLocalDataOwner(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setLocalDataOwner(userId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, userId)
}

export function clearLocalDataOwner(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/**
 * True iff this device's local pet/game data is safe to trust or migrate
 * for `userId` — either unclaimed (a real guest, or a pre-existing device
 * with no marker yet) or already claimed by this exact account. False means
 * the local data was left behind by a DIFFERENT, now-logged-out account.
 */
export function isLocalDataOwnedBy(userId: string): boolean {
  const owner = loadLocalDataOwner()
  return owner === null || owner === userId
}
