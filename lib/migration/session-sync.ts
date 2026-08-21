import type { SupabaseClient } from '@supabase/supabase-js'
import { readServerDataSnapshot, type ReadSnapshotFailure } from '@/lib/migration/read-server-snapshot'
import { restoreLocalDataFromSnapshot, type RestoreReport } from '@/lib/migration/restore-local-snapshot'
import { determineRestoreSituation } from '@/lib/migration/restore-conflict'
import { triggerBackgroundMigration } from '@/lib/migration/trigger-background-migration'
import { loadStoredPetProfile, type StoredPetProfile } from '@/lib/pets/pet-storage'
import type { ServerDataSnapshot } from '@/lib/migration/snapshot-types'

/**
 * Phase 2C-2 — the single entry point every real session-confirm moment
 * (lib/auth/supabase-auth-provider.tsx's session-restore-on-reload and
 * SIGNED_IN handling) goes through to decide "restore from server, upload
 * to server, or do nothing" for the CURRENT authenticated user. Replaces
 * those two call sites' direct use of triggerBackgroundMigration — this
 * function still delegates to it (unchanged) for the cases that actually
 * need Phase 2B's upload, so game-flow.tsx's NamingScreen retry (which
 * calls triggerBackgroundMigration directly, not this function — see its
 * own call site) keeps working exactly as it did in Phase 2B-4.
 *
 * Ordering / race analysis (why this file exists instead of running
 * Phase 2B migration and Phase 2C restore independently, per session-confirm
 * event, in parallel):
 *
 *   1. read (readServerDataSnapshot) always happens FIRST and by itself
 *      decides which of the two paths applies — migration and restore are
 *      mutually exclusive within one runSessionSync call, never both.
 *   2. `snapshot.pet === null` (Case D/E — determineRestoreSituation) means
 *      this account has no server pet yet. That is exactly Phase 2B's
 *      territory (upload local -> server), so this delegates to
 *      triggerBackgroundMigration and returns immediately — nothing local
 *      is touched here, so nothing to block the caller on.
 *   3. `snapshot.pet !== null` (Case A/B/C) means restore territory instead
 *      — Phase 2B's migration is deliberately NEVER invoked in this branch.
 *      This matters because Phase 2B's own migrated_at gate makes it a
 *      guaranteed no-op once an account has migrated once — so skipping it
 *      here isn't a functional change, but it does keep this function's
 *      contract simple and auditable ("has a server pet" and "might upload"
 *      are never true at the same time for the same call).
 *
 * This is what actually prevents the race named in the Phase 2C-2 task
 * ("서버에 기존 데이터가 있는데 빈 localStorage를 먼저 Phase 2B가 서버로
 * 올려버리는 race"): a device with server data always takes the restore
 * branch, never the upload branch, so there is no window where an empty
 * local snapshot could overwrite an existing server pet.
 */

export type SessionSyncResult =
  | { status: 'not_authenticated' }
  | { status: 'read_failed'; failures: ReadSnapshotFailure[] }
  /** Case D/E — delegated to the existing Phase 2B path; nothing local was touched here. */
  | { status: 'migration_delegated' }
  /** Case A — restoreLocalDataFromSnapshot ran; check report.ok/rolledBack for the outcome. */
  | { status: 'restored'; report: RestoreReport }
  /** Case B — deliberately NOT auto-restored, see the risk analysis in this file's own restoreLocalSnapshotForCaseB-adjacent comment below. */
  | { status: 'in_sync' }
  /** Case C — nothing written; caller must show conflict UX and call resolveRestoreConflict* before proceeding. */
  | { status: 'conflict'; snapshot: ServerDataSnapshot; localPet: StoredPetProfile }

/** Bounds how long a hung network call can block `restoreReady` from ever settling — see the Phase 2C-2 report's "무한 loading 금지" requirement. Treated identically to a real read failure. */
const READ_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(onTimeout())
    }, ms)
    promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(onTimeout())
      })
  })
}

/** Same same-runtime in-flight dedup convention as migration-orchestrator.ts#runLocalDataMigration. */
let inFlight: Promise<SessionSyncResult> | null = null

export async function runSessionSync(client: SupabaseClient): Promise<SessionSyncResult> {
  if (inFlight) return inFlight
  const promise = runSessionSyncInner(client)
  inFlight = promise
  try {
    return await promise
  } finally {
    inFlight = null
  }
}

async function runSessionSyncInner(client: SupabaseClient): Promise<SessionSyncResult> {
  const readResult = await withTimeout(readServerDataSnapshot(client), READ_TIMEOUT_MS, () => ({
    status: 'failed' as const,
    userId: '',
    failures: [{ table: '(timeout)', error: `no response within ${READ_TIMEOUT_MS}ms` }],
  }))

  if (readResult.status === 'not_authenticated') return { status: 'not_authenticated' }
  if (readResult.status === 'failed') {
    // Failure policy (Phase 2C-2 §5): never touch localStorage, never touch
    // the session, never re-throw — the caller (auth provider) only needs
    // to know restore-related work is DONE (so it can stop blocking), not
    // that it succeeded.
    return { status: 'read_failed', failures: readResult.failures }
  }

  const snapshot = readResult.snapshot
  const localPet = loadStoredPetProfile()
  const situation = determineRestoreSituation(snapshot, localPet)

  if (situation.case === 'D' || situation.case === 'E') {
    triggerBackgroundMigration(client)
    return { status: 'migration_delegated' }
  }

  if (situation.case === 'A') {
    const report = restoreLocalDataFromSnapshot(snapshot)
    // report.ok === false means restore-local-snapshot.ts already rolled
    // local state back to exactly what it was before this call — nothing
    // further to do here; the caller surfaces this via a dev warning only
    // (see supabase-auth-provider.tsx), same as a migration failure always has.
    return { status: 'restored', report }
  }

  if (situation.case === 'B') {
    // Deliberately NOT auto-restoring. Phase 2B's migration is one-time
    // only (gated by profiles.migrated_at, never re-runs), so the server
    // row for an already-matching pet reflects whatever this account's
    // state was AT THE MOMENT of its original migration — it never gets
    // refreshed afterward. A device that reaches Case B is either (a) a
    // freshly-restored device with nothing new yet (restoring again would
    // be a harmless no-op), or (b) the ORIGINAL device that has kept
    // playing since migration (restoring would overwrite real, newer local
    // progress with a stale snapshot). Nothing in the 4-field identity
    // fingerprint (lib/migration/restore-conflict.ts) can tell these two
    // apart, and (b) is hit on EVERY reload of the origin device while
    // logged in — so "restore on every Case B" would mean silently
    // reverting the origin device's progress on every page load. Trusting
    // local as-is is the only safe default until a real
    // "server may be stale" merge/refresh design exists (explicitly out of
    // scope for this phase — see the Phase 2C-2 report).
    return { status: 'in_sync' }
  }

  // situation.case === 'C'
  return { status: 'conflict', snapshot, localPet: localPet as StoredPetProfile }
}
