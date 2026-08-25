'use client'

import { createContext, useContext } from 'react'
import type { ServerDataSnapshot } from '@/lib/migration/snapshot-types'
import type { StoredPetProfile } from '@/lib/pets/pet-storage'

/**
 * Minimal user shape shared by every auth backend this app can plug in —
 * deliberately just `id`/`email` (not Supabase's full `User` type) so a
 * localStorage-only implementation and a real Supabase implementation can
 * both satisfy the same contract. Every call site only ever reads `.email`
 * (see MyPageScreen), so this is not a narrowing in practice today.
 */
export interface AuthUser {
  id: string
  email: string
}

export interface AuthResult {
  error: string | null
  /** true when sign-up succeeded but a confirmation step is still needed before a session exists (unused by the localStorage backend — always false there). */
  needsEmailConfirmation?: boolean
}

/**
 * Case C (lib/migration/restore-conflict.ts) frozen at the moment it was
 * detected — a different (or unconfirmed) Statling already exists on this
 * device while the server also has one for this account. Neither side is
 * touched until useServerStatling()/keepLocalStatling() resolves it.
 */
export interface RestoreConflictInfo {
  snapshot: ServerDataSnapshot
  localPet: StoredPetProfile
}

/**
 * The one contract every auth provider implementation must satisfy —
 * see lib/auth/local-auth-provider.tsx (current default, localStorage-backed)
 * and lib/auth/supabase-auth-provider.tsx (Supabase-backed, ready to swap
 * back in). Swapping which one is active is a one-line change in
 * lib/auth/auth-provider.tsx; no consumer (AuthForm, MyPageScreen,
 * SaveScreen) needs to change since they only ever import from there.
 */
export interface AuthContextValue {
  user: AuthUser | null
  /** true until the initial session check resolves. */
  loading: boolean
  /** false when this backend isn't usable yet (e.g. Supabase env vars missing). The localStorage backend is always true — it needs no external config. */
  isConfigured: boolean
  signInWithGoogle: () => Promise<AuthResult>
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  /**
   * Phase 2C-2 — true once this session's server-restore check (if any —
   * see lib/migration/session-sync.ts) has settled, one way or another
   * (nothing to check, restored, in sync, delegated to upload, or even a
   * read failure — every outcome eventually sets this, so it can never
   * hang forever). game-flow.tsx gates its initial phase decision on this
   * (see its bootReady) so it never reads localStorage before a pending
   * restore has had a chance to write to it. Always true immediately for
   * the localStorage-only backend and for a signed-out user — this never
   * adds latency for a guest.
   */
  restoreReady: boolean
  /**
   * True exactly when THIS authenticated session's server read or restore
   * did not complete successfully (lib/migration/session-sync.ts's
   * SessionSyncResult status 'read_failed', or 'restored' with
   * report.ok === false) — distinct from "restoreReady is true because
   * there was genuinely nothing to restore" (a real new user, or an
   * in-sync/migration-delegated outcome), which leaves this false. Exists
   * so a consumer that only gates on restoreReady (like game-flow.tsx's
   * bootReady) can't mistake "restore attempted and failed" for "nothing to
   * restore" — see post_login_auto's own guard for why that distinction
   * matters. Reset to false at the start of every new session-sync attempt,
   * so a stale failure from a previous login never lingers into the next
   * one. Always false on the localStorage-only backend (there is no server
   * to fail against).
   */
  restoreFailed: boolean
  /** Non-null exactly while a Case C conflict is awaiting the user's choice. Always null on the localStorage-only backend. */
  restoreConflict: RestoreConflictInfo | null
  /** Case C resolution: adopt the server's Statling — overwrites this device's local state via restoreLocalDataFromSnapshot (with its own backup/rollback). No-op on the localStorage-only backend. */
  useServerStatling: () => void
  /** Case C resolution: keep this device's local Statling as-is; the server's conflicting data is left untouched. No-op on the localStorage-only backend. */
  keepLocalStatling: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
