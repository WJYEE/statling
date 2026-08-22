import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityCountersRow,
  AchievementRow,
  AttendanceRow,
  DailyMissionRow,
  DecoInventoryRow,
  DecoPlacementItemRow,
  DexEntryRow,
  DialogueMemoryRow,
  PetCareStateRow,
  PetMemoryRow,
  PetsRow,
  PlayerSkillRecordRow,
  RoomCareStateRow,
  RoomInventoryRow,
  RoomItemRow,
  RoomStateRow,
  ServerDataSnapshot,
  UserNoteRow,
  XpTotalsRow,
} from '@/lib/migration/snapshot-types'

/**
 * Phase 2C-1 — reads the CURRENT authenticated user's own rows across all 18
 * Phase 1 migration domains and assembles them into one ServerDataSnapshot.
 * Pure read, no writes anywhere (not to Supabase, not to localStorage), and
 * NOT wired into any real app flow yet — see restore-local-snapshot.ts /
 * restore-conflict.ts for the rest of the Phase 2C-1 foundation and the
 * Phase 2C-1 report for why auto-restore is deliberately not connected yet.
 *
 * Security posture (verified against the actual Phase 1 grants/RLS, not
 * assumed):
 *   - userId is NEVER accepted as a parameter — the only identity source is
 *     client.auth.getUser(), which re-validates the JWT against Supabase
 *     Auth (same choice migration-orchestrator.ts's write path already
 *     makes, for the same reason: a caller can never ask this to read
 *     someone else's data by passing a different id).
 *   - Every query also carries an explicit `.eq('user_id', user.id)` filter
 *     on top of RLS — belt-and-suspenders, not a substitute for it. RLS
 *     alone (supabase/migrations/20260819000000_phase1_schema_and_rls.sql's
 *     `*_select_own` policies, all `auth.uid() = user_id`) already makes a
 *     cross-user read structurally impossible; this file adds no new
 *     policy, no service_role client, no RPC that bypasses RLS.
 *   - `client` is whatever the caller already has (the browser's
 *     getSupabaseBrowserClient() in every real call site) — this file never
 *     constructs its own client and never touches env vars directly.
 */

export interface ReadSnapshotFailure {
  table: string
  error: string
}

export type ReadServerSnapshotResult =
  | { status: 'not_authenticated' }
  | { status: 'failed'; userId: string; failures: ReadSnapshotFailure[] }
  | { status: 'ok'; snapshot: ServerDataSnapshot }

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

function failureMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export async function readServerDataSnapshot(client: SupabaseClient): Promise<ReadServerSnapshotResult> {
  const { data: userData, error: userError } = await client.auth.getUser()
  const user = userData?.user
  if (userError || !user) return { status: 'not_authenticated' }
  const userId = user.id

  const [
    profile,
    pet,
    playerSkillRecords,
    xpTotals,
    achievements,
    dailyMissions,
    attendance,
    activityCounters,
    petCareState,
    petMemory,
    roomCareState,
    userNotes,
    dialogueMemory,
    roomState,
    roomItems,
    decoPlacementItems,
    decoInventory,
    roomInventory,
    dexEntries,
  ] = await Promise.all([
    // Phase 2D-6 Follow-up — profiles.sync_updated_at, read alongside the 18
    // domain tables so this stays the ONE network round-trip a login/reload
    // pays for restore-related reads.
    client.from('profiles').select('sync_updated_at').eq('id', userId).maybeSingle<{ sync_updated_at: string | null }>(),
    client.from('pets').select('*').eq('user_id', userId).maybeSingle<PetsRow>(),
    client.from('player_skill_records').select('*').eq('user_id', userId).returns<PlayerSkillRecordRow[]>(),
    client.from('xp_totals').select('*').eq('user_id', userId).maybeSingle<XpTotalsRow>(),
    client.from('achievements').select('*').eq('user_id', userId).returns<AchievementRow[]>(),
    client.from('daily_missions').select('*').eq('user_id', userId).returns<DailyMissionRow[]>(),
    client.from('attendance').select('*').eq('user_id', userId).maybeSingle<AttendanceRow>(),
    client.from('activity_counters').select('*').eq('user_id', userId).maybeSingle<ActivityCountersRow>(),
    client.from('pet_care_state').select('*').eq('user_id', userId).maybeSingle<PetCareStateRow>(),
    client.from('pet_memory').select('*').eq('user_id', userId).maybeSingle<PetMemoryRow>(),
    client.from('room_care_state').select('*').eq('user_id', userId).maybeSingle<RoomCareStateRow>(),
    client.from('user_notes').select('*').eq('user_id', userId).returns<UserNoteRow[]>(),
    client.from('dialogue_memory').select('*').eq('user_id', userId).maybeSingle<DialogueMemoryRow>(),
    client.from('room_state').select('*').eq('user_id', userId).maybeSingle<RoomStateRow>(),
    client.from('room_items').select('*').eq('user_id', userId).returns<RoomItemRow[]>(),
    client.from('deco_placement_items').select('*').eq('user_id', userId).returns<DecoPlacementItemRow[]>(),
    client.from('deco_inventory').select('*').eq('user_id', userId).returns<DecoInventoryRow[]>(),
    client.from('room_inventory').select('*').eq('user_id', userId).returns<RoomInventoryRow[]>(),
    client.from('dex_entries').select('*').eq('user_id', userId).returns<DexEntryRow[]>(),
  ])

  const named = [
    ['pets', pet],
    ['player_skill_records', playerSkillRecords],
    ['xp_totals', xpTotals],
    ['achievements', achievements],
    ['daily_missions', dailyMissions],
    ['attendance', attendance],
    ['activity_counters', activityCounters],
    ['pet_care_state', petCareState],
    ['pet_memory', petMemory],
    ['room_care_state', roomCareState],
    ['user_notes', userNotes],
    ['dialogue_memory', dialogueMemory],
    ['room_state', roomState],
    ['room_items', roomItems],
    ['deco_placement_items', decoPlacementItems],
    ['deco_inventory', decoInventory],
    ['room_inventory', roomInventory],
    ['dex_entries', dexEntries],
  ] as const

  const failures: ReadSnapshotFailure[] = named
    .filter(([, result]) => result.error)
    .map(([table, result]) => ({ table, error: failureMessage(result.error) }))

  if (failures.length > 0) {
    return { status: 'failed', userId, failures }
  }

  // Phase 2D-6 Follow-up — deliberately NOT folded into the `named`/
  // `failures` treatment above: profiles.sync_updated_at is account-level
  // metadata, not one of the 18 migration-domain tables, and the whole
  // freshness feature already has a safe, well-defined behavior for "no
  // marker" (restore-conflict.ts#compareSyncFreshness's 'in_sync' fallback).
  // Until the Phase 2D-6 Follow-up schema migration is actually applied,
  // this column does not exist yet — a query error here (e.g. "column does
  // not exist") must never fail the ENTIRE snapshot read (and therefore
  // every login/reload's restore) over one account-level field the rest of
  // this function doesn't otherwise depend on.
  if (profile.error) {
    devWarn('[read-server-snapshot] profiles.sync_updated_at read failed (treating as no marker):', failureMessage(profile.error))
  }

  const snapshot: ServerDataSnapshot = {
    userId,
    readAt: new Date().toISOString(),
    syncUpdatedAt: profile.error ? null : (profile.data?.sync_updated_at ?? null),
    pet: pet.data,
    playerSkillRecords: playerSkillRecords.data ?? [],
    xpTotals: xpTotals.data,
    achievements: achievements.data ?? [],
    dailyMissions: dailyMissions.data ?? [],
    attendance: attendance.data,
    activityCounters: activityCounters.data,
    petCareState: petCareState.data,
    petMemory: petMemory.data,
    roomCareState: roomCareState.data,
    userNotes: userNotes.data ?? [],
    dialogueMemory: dialogueMemory.data,
    roomState: roomState.data,
    roomItems: roomItems.data ?? [],
    decoPlacementItems: decoPlacementItems.data ?? [],
    decoInventory: decoInventory.data ?? [],
    roomInventory: roomInventory.data ?? [],
    dexEntries: dexEntries.data ?? [],
  }

  return { status: 'ok', snapshot }
}
