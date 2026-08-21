/**
 * Phase 2D-2 — plain module-level runtime state answering "is continuous
 * background sync safe to run right now, and for which user." Deliberately
 * NOT a React hook/context: storage-layer choke points (mission-tracker.ts,
 * pet-storage call sites, dex-storage call sites) must be able to check this
 * without importing React or useAuth() (see the Phase 2D-1 report's
 * guidance against making storage modules depend on useAuth()).
 *
 * Never persisted to localStorage/sessionStorage — a reload always starts
 * back at { userId: null, ready: false } until SupabaseAuthProvider
 * re-confirms the session and its own Phase 2B/2C session-sync settles
 * again, exactly mirroring how AuthContextValue.restoreReady behaves today.
 *
 * "ready" is intentionally a stricter condition than "authenticated" — see
 * the Phase 2D-1 report's core finding: a Supabase session existing is NOT
 * the same as it being safe to start pushing continuous writes, because the
 * CURRENT session's Phase 2B migration (new signup) or Phase 2C restore
 * (existing account, new device) — or Case C conflict resolution — may
 * still be in flight. registerSyncSession() marks a session as "known but
 * not yet ready"; markSyncReady() is the only thing that flips it to ready,
 * and only lib/auth/supabase-auth-provider.tsx calls it, at the exact point
 * its own session-sync work (or conflict resolution) has settled.
 */

interface SyncSessionState {
  userId: string | null
  ready: boolean
}

let state: SyncSessionState = { userId: null, ready: false }

/** A session was confirmed but this session's initial Phase 2B/2C sync hasn't settled yet — continuous sync must stay a no-op until markSyncReady(sameUserId). */
export function registerSyncSession(userId: string): void {
  state = { userId, ready: false }
}

/** This session's Phase 2B migration / Phase 2C restore / Case C conflict resolution has fully settled — continuous sync may now run for this user. Ignored if a newer/different session has since been registered (stale-call guard). */
export function markSyncReady(userId: string): void {
  if (state.userId !== userId) return
  state = { userId, ready: true }
}

/** Logout (or any transition to "no session") — makes every in-flight/future scheduleSync() call for the old user a guaranteed no-op. */
export function clearSyncSession(): void {
  state = { userId: null, ready: false }
}

/** The current user id iff continuous sync is safe to run right now, else null (covers guest, not-yet-authenticated, and "authenticated but 2B/2C not settled yet"). */
export function getSyncReadyUserId(): string | null {
  return state.ready ? state.userId : null
}
