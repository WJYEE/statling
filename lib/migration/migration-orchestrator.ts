import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLocalDataSnapshot } from '@/lib/migration/build-local-snapshot'
import { writeLocalDataSnapshot, type SnapshotWriteReport } from '@/lib/migration/write-local-snapshot'
import { getOrCreateDeviceId } from '@/lib/room/room-storage'

/**
 * Phase 2B-3 — the one-time localStorage -> Supabase migration orchestrator.
 * NOT wired into login/GameFlow/any real user-facing flow — nothing in the
 * app currently imports this module, which is what actually satisfies
 * "must never auto-run for production users" (see the Phase 2B-3 report for
 * why a flag/env check alone wouldn't be enough). Only a QA-only
 * page/button is meant to call this. Never touches localStorage (only
 * buildLocalDataSnapshot/getOrCreateDeviceId, both already read-only with
 * respect to game data), never modifies Auth, never touches game/XP/
 * achievement read/write paths.
 */

export interface MigrationFailure {
  table: string
  error: string
}

export type MigrationResult =
  | { status: 'not_authenticated' }
  | { status: 'already_migrated'; userId: string; migratedAt: string }
  | { status: 'migrated'; userId: string; legacyDeviceId: string; migratedAt: string; writeReport: SnapshotWriteReport }
  | { status: 'failed'; userId: string; failures: MigrationFailure[] }

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

  return { status: 'migrated', userId: user.id, legacyDeviceId, migratedAt, writeReport: report }
}
