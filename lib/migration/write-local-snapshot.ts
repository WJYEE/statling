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
  LocalDataSnapshot,
  PetCareStateRow,
  PetMemoryRow,
  PetsRow,
  PlayerSkillRecordRow,
  RoomCareStateRow,
  RoomInventoryRow,
  RoomItemRow,
  RoomStateRow,
  UserNoteRow,
  XpTotalsRow,
} from '@/lib/migration/snapshot-types'

/**
 * Phase 2B-2 / 2B-2.5 — writes a LocalDataSnapshot (Phase 2B-1's pure
 * output) into Phase 1 Supabase tables. NOT wired into login/GameFlow/
 * orchestration — callers decide when this runs. Never touches
 * localStorage, never touches `profiles.migrated_at`, never imports
 * lib/auth/*.
 *
 * Covers all 18 non-profiles domains in the snapshot. 15 write directly via
 * upsert (Groups A/B/C below); the remaining 3 — room_items,
 * deco_placement_items, user_notes — have a surrogate `uuid` PK with no
 * natural conflict key, so a client-side upsert/delete-then-insert can't be
 * made atomic or concurrency-safe (see the Phase 2B-2 report). Those three
 * go through the transactional `replace_room_items` /
 * `replace_deco_placement_items` / `replace_user_notes` RPCs added in
 * supabase/migrations/20260820000000_phase2b_replace_rpcs.sql (Group D
 * below) instead of a raw table upsert — live-account-verified per the
 * Phase 2B-2.5 report (self-replace, idempotent rerun, malformed-payload
 * rollback, anon block, cross-user isolation, concurrent-call
 * serialization all passed against the real project).
 */

export class SnapshotUserMismatchError extends Error {
  constructor(table: string) {
    super(`Refusing to write "${table}": row.user_id does not match the authenticated session's user id.`)
    this.name = 'SnapshotUserMismatchError'
  }
}

export interface TableWriteResult {
  table: string
  ok: boolean
  /** True when there was nothing local to write (e.g. no pet yet, or an empty N-row array) — never attempted a network call. */
  skipped: boolean
  rowCount: number
  error?: string
}

export interface SnapshotWriteReport {
  results: TableWriteResult[]
  /** True iff every table either succeeded or was legitimately skipped — false if any table errored. */
  ok: boolean
}

function assertOwnRow(userId: string, expectedUserId: string, table: string): void {
  if (userId !== expectedUserId) throw new SnapshotUserMismatchError(table)
}

function ok(table: string, rowCount: number): TableWriteResult {
  return { table, ok: true, skipped: false, rowCount }
}

function skipped(table: string): TableWriteResult {
  return { table, ok: true, skipped: true, rowCount: 0 }
}

function failed(table: string, error: unknown): TableWriteResult {
  // Supabase's PostgrestError is a plain object, not an Error instance — it
  // still carries a real `.message` (and often `.code`/`.details`), so
  // reading that explicitly avoids collapsing every failure into the
  // useless "[object Object]" that `String(error)` would otherwise produce.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  return { table, ok: false, skipped: false, rowCount: 0, error: message }
}

// ---------------------------------------------------------------------------
// Group A — single row per user (PK = user_id). Real upsert: insert-or-
// update, always converges to the snapshot's current value on retry.
// ---------------------------------------------------------------------------

/**
 * pets — PK user_id. On a genuine first migration there is no existing row,
 * so this is a plain insert. On a retry with the SAME snapshot, the values
 * sent equal the values already stored, so guard_pet_identity_immutable()
 * (which only blocks a CHANGE to character_id/top_stat/second_stat/
 * initial_finals/statling_name once confirmed=true) never fires — identical
 * values always pass. It WOULD fire if the local pet genuinely changed
 * between two migration attempts (e.g. the user replayed the assessment),
 * which is an edge case outside a one-time migration's scope, not a bug in
 * this function.
 */
export async function writePetRow(client: SupabaseClient, row: PetsRow | null, expectedUserId: string): Promise<TableWriteResult> {
  if (!row) return skipped('pets')
  assertOwnRow(row.user_id, expectedUserId, 'pets')
  const { error } = await client.from('pets').upsert(row, { onConflict: 'user_id' })
  return error ? failed('pets', error) : ok('pets', 1)
}

export async function writeXpTotalsRow(client: SupabaseClient, row: XpTotalsRow, expectedUserId: string): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'xp_totals')
  const { error } = await client.from('xp_totals').upsert(row, { onConflict: 'user_id' })
  return error ? failed('xp_totals', error) : ok('xp_totals', 1)
}

export async function writeAttendanceRow(client: SupabaseClient, row: AttendanceRow, expectedUserId: string): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'attendance')
  const { error } = await client.from('attendance').upsert(row, { onConflict: 'user_id' })
  return error ? failed('attendance', error) : ok('attendance', 1)
}

export async function writeActivityCountersRow(
  client: SupabaseClient,
  row: ActivityCountersRow,
  expectedUserId: string,
): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'activity_counters')
  const { error } = await client.from('activity_counters').upsert(row, { onConflict: 'user_id' })
  return error ? failed('activity_counters', error) : ok('activity_counters', 1)
}

export async function writePetCareStateRow(
  client: SupabaseClient,
  row: PetCareStateRow,
  expectedUserId: string,
): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'pet_care_state')
  const { error } = await client.from('pet_care_state').upsert(row, { onConflict: 'user_id' })
  return error ? failed('pet_care_state', error) : ok('pet_care_state', 1)
}

export async function writeRoomStateRow(client: SupabaseClient, row: RoomStateRow, expectedUserId: string): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'room_state')
  const { error } = await client.from('room_state').upsert(row, { onConflict: 'user_id' })
  return error ? failed('room_state', error) : ok('room_state', 1)
}

export async function writeRoomCareStateRow(
  client: SupabaseClient,
  row: RoomCareStateRow,
  expectedUserId: string,
): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'room_care_state')
  const { error } = await client.from('room_care_state').upsert(row, { onConflict: 'user_id' })
  return error ? failed('room_care_state', error) : ok('room_care_state', 1)
}

export async function writePetMemoryRow(client: SupabaseClient, row: PetMemoryRow, expectedUserId: string): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'pet_memory')
  const { error } = await client.from('pet_memory').upsert(row, { onConflict: 'user_id' })
  return error ? failed('pet_memory', error) : ok('pet_memory', 1)
}

export async function writeDialogueMemoryRow(
  client: SupabaseClient,
  row: DialogueMemoryRow,
  expectedUserId: string,
): Promise<TableWriteResult> {
  assertOwnRow(row.user_id, expectedUserId, 'dialogue_memory')
  const { error } = await client.from('dialogue_memory').upsert(row, { onConflict: 'user_id' })
  return error ? failed('dialogue_memory', error) : ok('dialogue_memory', 1)
}

// ---------------------------------------------------------------------------
// Group B — natural-key N-row tables whose VALUE can legitimately differ
// between retries ("record" data). Real upsert (overwrite-on-conflict), NOT
// ignoreDuplicates — otherwise a retry with an updated snapshot would keep
// stale values forever. All three have UPDATE grants (see migration SQL),
// so this is also grant-compatible, not just semantically correct.
// ---------------------------------------------------------------------------

export async function writePlayerSkillRecords(
  client: SupabaseClient,
  rows: PlayerSkillRecordRow[],
  expectedUserId: string,
): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('player_skill_records')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'player_skill_records')
  const { error } = await client.from('player_skill_records').upsert(rows, { onConflict: 'user_id,game_id,difficulty' })
  return error ? failed('player_skill_records', error) : ok('player_skill_records', rows.length)
}

export async function writeAchievements(client: SupabaseClient, rows: AchievementRow[], expectedUserId: string): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('achievements')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'achievements')
  const { error } = await client.from('achievements').upsert(rows, { onConflict: 'user_id,tier_id' })
  return error ? failed('achievements', error) : ok('achievements', rows.length)
}

export async function writeDailyMissions(client: SupabaseClient, rows: DailyMissionRow[], expectedUserId: string): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('daily_missions')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'daily_missions')
  const { error } = await client.from('daily_missions').upsert(rows, { onConflict: 'user_id,date_key,mission_id' })
  return error ? failed('daily_missions', error) : ok('daily_missions', rows.length)
}

// ---------------------------------------------------------------------------
// Group C — natural-key, append-only membership tables (grant is SELECT +
// INSERT only — no UPDATE, so a real upsert isn't even possible here; this
// is required by the grant model, not just a style choice). unlocked_at/
// met_at are already-synthesized approximations (see Phase 2B-1 report), so
// there is no "more correct" value to converge to on retry anyway.
// ---------------------------------------------------------------------------

export async function writeRoomInventory(
  client: SupabaseClient,
  rows: RoomInventoryRow[],
  expectedUserId: string,
): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('room_inventory')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'room_inventory')
  const { error } = await client.from('room_inventory').upsert(rows, { onConflict: 'user_id,asset_id', ignoreDuplicates: true })
  return error ? failed('room_inventory', error) : ok('room_inventory', rows.length)
}

export async function writeDecoInventory(
  client: SupabaseClient,
  rows: DecoInventoryRow[],
  expectedUserId: string,
): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('deco_inventory')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'deco_inventory')
  const { error } = await client.from('deco_inventory').upsert(rows, { onConflict: 'user_id,asset_id', ignoreDuplicates: true })
  return error ? failed('deco_inventory', error) : ok('deco_inventory', rows.length)
}

export async function writeDexEntries(client: SupabaseClient, rows: DexEntryRow[], expectedUserId: string): Promise<TableWriteResult> {
  if (rows.length === 0) return skipped('dex_entries')
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'dex_entries')
  const { error } = await client.from('dex_entries').upsert(rows, { onConflict: 'user_id,character_id', ignoreDuplicates: true })
  return error ? failed('dex_entries', error) : ok('dex_entries', rows.length)
}

// ---------------------------------------------------------------------------
// Group D — surrogate-uuid tables, written via the transactional replace_*
// RPCs (supabase/migrations/20260820000000_phase2b_replace_rpcs.sql), not a
// raw table upsert. Each RPC deletes-then-inserts the caller's own rows
// inside one Postgres transaction and derives the owner strictly from
// auth.uid() server-side — the client never sends user_id/instance_id/id,
// so those columns are stripped before the call (the RPC ignores them even
// if present, but omitting them keeps the payload honest about what's
// actually used). A malformed row makes the whole call fail and roll back
// (the pre-existing rows are left exactly as they were — see the Phase
// 2B-2.5 report), which is exactly the atomicity Group A/B/C get for free
// from Postgres's own single-statement upsert but these three could not get
// from the client alone.
// ---------------------------------------------------------------------------

export async function writeRoomItemsRpc(client: SupabaseClient, rows: RoomItemRow[], expectedUserId: string): Promise<TableWriteResult> {
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'room_items')
  const items = rows.map(({ user_id: _user_id, instance_id: _instance_id, ...rest }) => rest)
  const { error } = await client.rpc('replace_room_items', { items })
  return error ? failed('room_items', error) : ok('room_items', rows.length)
}

export async function writeDecoPlacementItemsRpc(
  client: SupabaseClient,
  rows: DecoPlacementItemRow[],
  expectedUserId: string,
): Promise<TableWriteResult> {
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'deco_placement_items')
  const items = rows.map(({ user_id: _user_id, instance_id: _instance_id, ...rest }) => rest)
  const { error } = await client.rpc('replace_deco_placement_items', { items })
  return error ? failed('deco_placement_items', error) : ok('deco_placement_items', rows.length)
}

export async function writeUserNotesRpc(client: SupabaseClient, rows: UserNoteRow[], expectedUserId: string): Promise<TableWriteResult> {
  for (const row of rows) assertOwnRow(row.user_id, expectedUserId, 'user_notes')
  const notes = rows.map(({ user_id: _user_id, id: _id, ...rest }) => rest)
  const { error } = await client.rpc('replace_user_notes', { notes })
  return error ? failed('user_notes', error) : ok('user_notes', rows.length)
}

/**
 * Writes every domain in the snapshot (all 18 non-profiles tables — Groups
 * A/B/C via direct upsert, Group D via the transactional replace_* RPCs).
 * Does NOT touch profiles.migrated_at — that belongs to the orchestrator (a
 * later phase), not this write layer. Runs every table write regardless of
 * an earlier one failing (each is independently idempotent/atomic, so a
 * caller can just re-run the whole snapshot on retry — see the Phase 2B-2
 * and 2B-2.5 reports for why that's safe for every table written here).
 */
export async function writeLocalDataSnapshot(
  client: SupabaseClient,
  snapshot: LocalDataSnapshot,
  expectedUserId: string,
): Promise<SnapshotWriteReport> {
  if (snapshot.userId !== expectedUserId) throw new SnapshotUserMismatchError('(snapshot.userId)')

  const results: TableWriteResult[] = []
  results.push(await writePetRow(client, snapshot.pet, expectedUserId))
  results.push(await writePlayerSkillRecords(client, snapshot.playerSkillRecords, expectedUserId))
  results.push(await writeXpTotalsRow(client, snapshot.xpTotals, expectedUserId))
  results.push(await writeAchievements(client, snapshot.achievements, expectedUserId))
  results.push(await writeDailyMissions(client, snapshot.dailyMissions, expectedUserId))
  results.push(await writeAttendanceRow(client, snapshot.attendance, expectedUserId))
  results.push(await writeActivityCountersRow(client, snapshot.activityCounters, expectedUserId))
  results.push(await writePetCareStateRow(client, snapshot.petCareState, expectedUserId))
  results.push(await writePetMemoryRow(client, snapshot.petMemory, expectedUserId))
  results.push(await writeRoomCareStateRow(client, snapshot.roomCareState, expectedUserId))
  results.push(await writeDialogueMemoryRow(client, snapshot.dialogueMemory, expectedUserId))
  results.push(await writeRoomStateRow(client, snapshot.roomState, expectedUserId))
  results.push(await writeRoomInventory(client, snapshot.roomInventory, expectedUserId))
  results.push(await writeDecoInventory(client, snapshot.decoInventory, expectedUserId))
  results.push(await writeDexEntries(client, snapshot.dexEntries, expectedUserId))
  results.push(await writeRoomItemsRpc(client, snapshot.roomItems, expectedUserId))
  results.push(await writeDecoPlacementItemsRpc(client, snapshot.decoPlacementItems, expectedUserId))
  results.push(await writeUserNotesRpc(client, snapshot.userNotes, expectedUserId))

  return { results, ok: results.every((r) => r.ok) }
}
