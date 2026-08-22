import type { SupabaseClient } from '@supabase/supabase-js'
import { readServerDataSnapshot, type ReadSnapshotFailure } from '@/lib/migration/read-server-snapshot'
import { restoreLocalDataFromSnapshot, type RestoreReport } from '@/lib/migration/restore-local-snapshot'
import { determineRestoreSituation, compareSyncFreshness } from '@/lib/migration/restore-conflict'
import { triggerBackgroundMigration } from '@/lib/migration/trigger-background-migration'
import { runSessionCatchupSync } from '@/lib/migration/session-catchup'
import { loadStoredPetProfile, type StoredPetProfile } from '@/lib/pets/pet-storage'
import { loadLocalSyncUpdatedAt, setLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'
import type { ServerDataSnapshot } from '@/lib/migration/snapshot-types'

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

/**
 * Phase 2D-6 Follow-up — copies the server's own freshness marker down after
 * ANY restore (Case A, or Case B's new "server newer" branch below).
 * Deliberately NEVER stamps "now" when the server actually has a real
 * marker — that would fabricate a claim this device's restored content is
 * newer than what it truly mirrors. Only falls back to "now" when the
 * server has none at all (a legacy account, migrated before this column
 * existed) — at that point "now" is simply true: this device's local state
 * genuinely does match the server as of this moment, and leaving the local
 * marker null would just leave this account stuck in the null-fallback
 * (compareSyncFreshness's 'in_sync') path forever.
 */
function alignLocalMarkerAfterRestore(serverSyncUpdatedAt: string | null): void {
  setLocalSyncUpdatedAt(serverSyncUpdatedAt ?? new Date().toISOString())
}

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
  /**
   * Case A, or Case B once compareSyncFreshness finds the server newer —
   * restoreLocalDataFromSnapshot ran; check report.ok/rolledBack for the
   * outcome. `viaFreshness` distinguishes the two for logging/QA only, the
   * caller's handling is identical either way.
   */
  | { status: 'restored'; report: RestoreReport; viaFreshness: boolean }
  /**
   * Case B, either genuinely in sync or with a freshness verdict that
   * doesn't call for a restore — see the risk analysis in this file's Case B
   * branch below. `catchUp` is set when local was found newer and a
   * fire-and-forget lib/migration/session-catchup.ts push was started (not
   * awaited — never blocks restoreReady).
   */
  | { status: 'in_sync'; catchUp: boolean }
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

/**
 * `localMarkerOverride` (Phase 2D-6 Follow-up Safety Fix) — when provided
 * (including explicitly `null`), Case B's freshness comparison below uses
 * THIS value instead of a live lib/sync/sync-freshness.ts#loadLocalSyncUpdatedAt()
 * call. supabase-auth-provider.tsx passes its own pre-captured value for the
 * reload path specifically, where a live read here can lose a race against
 * another component's mount effect (pet_care_state/pet_memory) touching the
 * SAME marker moments earlier — see that call site's own comment for the
 * full trace of the live-QA regression this closes. Omitted (undefined) for
 * the SIGNED_IN path, where a live read is correct instead.
 */
export async function runSessionSync(client: SupabaseClient, localMarkerOverride?: string | null): Promise<SessionSyncResult> {
  if (inFlight) return inFlight
  const promise = runSessionSyncInner(client, localMarkerOverride)
  inFlight = promise
  try {
    return await promise
  } finally {
    inFlight = null
  }
}

async function runSessionSyncInner(client: SupabaseClient, localMarkerOverride?: string | null): Promise<SessionSyncResult> {
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
    if (report.ok) alignLocalMarkerAfterRestore(snapshot.syncUpdatedAt)
    return { status: 'restored', report, viaFreshness: false }
  }

  if (situation.case === 'B') {
    // Phase 2B's migration is one-time only (gated by profiles.migrated_at,
    // never re-runs), so before Phase 2D-6 Follow-up the server row for an
    // already-matching pet reflected whatever this account's state was AT
    // THE MOMENT of its original migration and never got refreshed
    // afterward — nothing here could tell "a freshly-restored device with
    // nothing new yet" apart from "the origin device, still ahead of the
    // last sync" (Phase 2D-6's own multi-device QA reproduced the resulting
    // regression: a stale device's next action silently overwrote a
    // genuinely newer server value). profiles.sync_updated_at now gives
    // Case B a real, if deliberately coarse, way to tell the two apart —
    // see restore-conflict.ts#compareSyncFreshness for the tolerance/
    // clock-skew reasoning and lib/sync/sync-dispatcher.ts's
    // `_account_marker` pseudo-domain for how the server side of this
    // advances.
    const localSyncUpdatedAt = localMarkerOverride !== undefined ? localMarkerOverride : loadLocalSyncUpdatedAt()
    const freshness = compareSyncFreshness(localSyncUpdatedAt, snapshot.syncUpdatedAt)

    if (freshness === 'server_newer') {
      const report = restoreLocalDataFromSnapshot(snapshot)
      if (report.ok) alignLocalMarkerAfterRestore(snapshot.syncUpdatedAt)
      return { status: 'restored', report, viaFreshness: true }
    }

    if (freshness === 'local_newer') {
      // Fire-and-forget — never awaited, never blocks restoreReady from
      // settling (same "local-first, background push" rule every other
      // continuous-sync call already follows).
      runSessionCatchupSync(client, snapshot.userId).catch((err) =>
        devWarn('[session-sync] Case B catch-up sync threw unexpectedly (local state unaffected):', err),
      )
      return { status: 'in_sync', catchUp: true }
    }

    // 'in_sync': equal within tolerance, or either marker missing (legacy
    // account / never-touched device) — the same conservative trust-local
    // no-op this whole system has always defaulted to.
    return { status: 'in_sync', catchUp: false }
  }

  // situation.case === 'C'
  return { status: 'conflict', snapshot, localPet: localPet as StoredPetProfile }
}
