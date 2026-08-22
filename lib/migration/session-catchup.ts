import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLocalDataSnapshot } from '@/lib/migration/build-local-snapshot'
import { writeLocalDataSnapshot, type SnapshotWriteReport } from '@/lib/migration/write-local-snapshot'
import { touchLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'
import { clearOutstandingDomainFailures } from '@/lib/sync/sync-dispatcher'

/**
 * Phase 2D-6 Follow-up — fired from session-sync.ts's Case B branch when the
 * freshness comparison (restore-conflict.ts#compareSyncFreshness) finds
 * THIS device's local sync_updated_at newer than the server's, meaning the
 * server is missing real local progress this account already has (the
 * inverse of Phase 2D-6's original repro: PC A stays local-newer instead of
 * silently regressing a fresher server).
 *
 * Deliberately reuses Phase 2B's own buildLocalDataSnapshot/
 * writeLocalDataSnapshot — the exact same whole-state, table-by-table,
 * self-idempotent write path every continuous-sync push and the original
 * migration already use — instead of inventing a second upload mechanism.
 * Just as deliberately does NOT call runLocalDataMigration()
 * (migration-orchestrator.ts): that function is one-time-only, gated on
 * profiles.migrated_at, and carries the NamingScreen race guard
 * (isLocalPetMigrationReady) that only makes sense for a brand-new,
 * not-yet-confirmed pet. A Case B account's pet is by definition already
 * confirmed and identity-matched (see isSameConfirmedPet in
 * restore-conflict.ts), so none of that applies here — this function never
 * touches profiles.migrated_at.
 *
 * Fire-and-forget from the caller's perspective (session-sync.ts never
 * awaits this before letting restoreReady settle) — matches every other
 * continuous-sync push's "never block the UI on a network write" rule.
 */

export type CatchupResult =
  | { status: 'ok'; writeReport: SnapshotWriteReport }
  | { status: 'failed'; writeReport: SnapshotWriteReport }

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

/** Same same-runtime in-flight dedup convention as migration-orchestrator.ts#runLocalDataMigration / session-sync.ts#runSessionSync. */
let inFlight: Promise<CatchupResult> | null = null

export async function runSessionCatchupSync(client: SupabaseClient, userId: string): Promise<CatchupResult> {
  if (inFlight) return inFlight
  const promise = runSessionCatchupSyncInner(client, userId)
  inFlight = promise
  try {
    return await promise
  } finally {
    inFlight = null
  }
}

async function runSessionCatchupSyncInner(client: SupabaseClient, userId: string): Promise<CatchupResult> {
  const snapshot = buildLocalDataSnapshot(userId)
  const report = await writeLocalDataSnapshot(client, snapshot, userId)
  if (!report.ok) {
    devWarn('[session-catchup] catch-up sync incomplete (local state unaffected, will retry on next session/action):', report.results)
    return { status: 'failed', writeReport: report }
  }

  // Only reached once every table write above succeeded — mirrors
  // migration-orchestrator.ts's own "advance the marker only after a fully
  // successful batch" rule (see the Phase 2D-6 Follow-up report's analysis
  // of why a per-domain-push marker update would be unsafe). This batch
  // necessarily included every domain that might have had a lingering
  // outstanding-failure flag from an earlier partial push, so it's now
  // safe to clear that gate too — see sync-dispatcher.ts's
  // domainsWithOutstandingFailure doc comment (Safety Fix follow-up).
  clearOutstandingDomainFailures()
  const nowIso = new Date().toISOString()
  touchLocalSyncUpdatedAt(new Date(nowIso))
  const { error: profileError } = await client.from('profiles').update({ sync_updated_at: nowIso }).eq('id', userId)
  if (profileError) {
    devWarn('[session-catchup] domain data caught up but profiles.sync_updated_at write failed (will retry next session):', profileError.message)
  }
  return { status: 'ok', writeReport: report }
}
