import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLocalDataSnapshot } from '@/lib/migration/build-local-snapshot'
import { writeLocalDataSnapshot, type SnapshotWriteReport } from '@/lib/migration/write-local-snapshot'
import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { loadStoredPetProfile } from '@/lib/pets/pet-storage'
import { setLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'
import { clearOutstandingDomainFailures } from '@/lib/sync/sync-dispatcher'

/**
 * Phase 2B-3/2B-4 — the one-time localStorage -> Supabase migration
 * orchestrator. Wired into two real user-facing entry points, both via the
 * shared lib/migration/trigger-background-migration.ts helper:
 *   - lib/auth/supabase-auth-provider.tsx, on session restore and on every
 *     SIGNED_IN event (the original Phase 2B-4 wiring).
 *   - game-flow.tsx's NamingScreen onConfirm, which retries a run that
 *     isLocalPetMigrationReady() deferred below (see its doc comment) once
 *     the Statling actually has a name.
 * Never touches localStorage (only buildLocalDataSnapshot/getOrCreateDeviceId/
 * loadStoredPetProfile, all already read-only with respect to game data),
 * never modifies Auth, never touches game/XP/achievement read/write paths.
 */

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

export interface MigrationFailure {
  table: string
  error: string
}

export type MigrationResult =
  | { status: 'not_authenticated' }
  | { status: 'already_migrated'; userId: string; migratedAt: string }
  | { status: 'not_ready'; userId: string }
  | { status: 'migrated'; userId: string; legacyDeviceId: string; migratedAt: string; writeReport: SnapshotWriteReport }
  | { status: 'failed'; userId: string; failures: MigrationFailure[] }

/**
 * A pet that's confirmed but not yet named is mid-flow (Reveal confirms it
 * -> SaveScreen offers signup -> NamingScreen sets the name — see
 * game-flow.tsx). Migrating right now (e.g. a fresh signup on SaveScreen)
 * would write a nameless pets row and then immediately set migrated_at,
 * which permanently short-circuits every FUTURE call via the
 * already_migrated check below — so the name the player types two screens
 * later would never reach the server; nothing would ever call writePetRow
 * again to offer it one. (guard_pet_identity_immutable() in
 * supabase/migrations/20260819000000_phase1_schema_and_rls.sql would still
 * happily accept that later name, since it only locks a NON-null
 * statling_name — the actual blocker is migrated_at, not the DB trigger.)
 *
 * Deferring the ENTIRE migration (not just the pets row) keeps the
 * invariant simple: the one run that succeeds is always a complete, final
 * snapshot. See game-flow.tsx's NamingScreen onConfirm for the retry that
 * fires once the name is actually saved locally.
 *
 * Returns true (ready) for the overwhelming majority of real logins: no
 * local pet at all, a not-yet-confirmed pet (nothing name-sensitive is
 * locked yet — and in practice every screen that can reach a login/signup
 * form requires a confirmed pet already, see game-flow.tsx's phase guards),
 * or a confirmed pet that already has its name (an existing localStorage
 * user logging into/restoring an account for the first time). Only a
 * confirmed-but-unnamed pet — the SaveScreen/NamingScreen gap itself —
 * blocks a run.
 */
function isLocalPetMigrationReady(): boolean {
  const pet = loadStoredPetProfile()
  if (!pet) return true
  if (!pet.confirmed) return true
  return Boolean(pet.statlingName)
}

/**
 * Same-tab-only in-flight guard: if a second call comes in while one is
 * already running IN THIS JS RUNTIME (e.g. a QA button double-clicked, or a
 * duplicate effect invocation), it gets the SAME promise instead of kicking
 * off a second redundant run. This is a UX/efficiency nicety, not a
 * correctness requirement — see the Phase 2B-3 report's concurrency
 * analysis for why the write layer is already safe against genuinely
 * separate tabs/devices without this.
 */
let inFlight: Promise<MigrationResult> | null = null

export async function runLocalDataMigration(client: SupabaseClient): Promise<MigrationResult> {
  if (inFlight) return inFlight
  const promise = runLocalDataMigrationInner(client)
  inFlight = promise
  try {
    return await promise
  } finally {
    inFlight = null
  }
}

async function runLocalDataMigrationInner(client: SupabaseClient): Promise<MigrationResult> {
  // getUser() re-validates the JWT against Supabase Auth (unlike getSession(),
  // which only reads whatever is cached locally) — the migration's user
  // identity is deliberately never something a caller can pass in, it is
  // always exactly whoever the CURRENT server-validated session says it is.
  const { data: userData, error: userError } = await client.auth.getUser()
  const user = userData?.user
  if (userError || !user) return { status: 'not_authenticated' }

  const { data: profile, error: profileSelectError } = await client
    .from('profiles')
    .select('migrated_at')
    .eq('id', user.id)
    .single()

  if (profileSelectError) {
    return { status: 'failed', userId: user.id, failures: [{ table: 'profiles', error: profileSelectError.message }] }
  }
  if (profile?.migrated_at) {
    return { status: 'already_migrated', userId: user.id, migratedAt: profile.migrated_at as string }
  }

  if (!isLocalPetMigrationReady()) {
    return { status: 'not_ready', userId: user.id }
  }

  const snapshot = buildLocalDataSnapshot(user.id)
  const report = await writeLocalDataSnapshot(client, snapshot, user.id)

  if (!report.ok) {
    const failures: MigrationFailure[] = report.results
      .filter((r) => !r.ok)
      .map((r) => ({ table: r.table, error: r.error ?? 'unknown error' }))
    return { status: 'failed', userId: user.id, failures }
  }

  // Only reached once every table write above has succeeded — this is the
  // ONE place in the whole pipeline that ever writes migrated_at, and it is
  // always the LAST write of a run, never the first.
  const legacyDeviceId = getOrCreateDeviceId()
  const migratedAt = new Date().toISOString()
  const { error: profileUpdateError } = await client
    .from('profiles')
    .update({ legacy_device_id: legacyDeviceId, migrated_at: migratedAt })
    .eq('id', user.id)

  if (profileUpdateError) {
    return { status: 'failed', userId: user.id, failures: [{ table: 'profiles', error: profileUpdateError.message }] }
  }

  // Phase 2D-6 Follow-up — this migration snapshot IS the first coherent
  // "local and server agree" moment, so it's also the natural birth point
  // for the sync_updated_at freshness marker (its own column, deliberately
  // never folded into the migrated_at update above — see
  // restore-conflict.ts#compareSyncFreshness). A SEPARATE, best-effort call:
  // until the Phase 2D-6 Follow-up schema migration is actually applied,
  // this column doesn't exist yet, and that must never fail the migration
  // itself (migrated_at above is already durably set at this point) — a
  // missing/failed marker here just means Case B keeps its current
  // trust-local behavior for this account a little longer, never that the
  // migration silently didn't happen. Local is aligned to the SAME value
  // right here rather than left to whatever it happened to accumulate
  // during guest play beforehand. Also clears any leftover
  // outstanding-failure flags (Safety Fix follow-up) — vanishingly unlikely
  // this early (nothing has touched continuous sync yet for a brand-new
  // account), but harmless and correct if it ever did.
  clearOutstandingDomainFailures()
  setLocalSyncUpdatedAt(migratedAt)
  const { error: syncMarkerError } = await client.from('profiles').update({ sync_updated_at: migratedAt }).eq('id', user.id)
  if (syncMarkerError) {
    devWarn('[migration-orchestrator] sync_updated_at marker write failed after a successful migration (migrated_at is already set; will retry via the next continuous-sync push):', syncMarkerError.message)
  }

  return { status: 'migrated', userId: user.id, legacyDeviceId, migratedAt, writeReport: report }
}
