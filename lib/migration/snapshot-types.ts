import type { RawRecord } from '@/lib/brain-bet'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { PendingGameReaction } from '@/lib/pet-care/types'

/**
 * Row shapes for Phase 2B's one-time localStorage -> Supabase migration.
 * Every field here mirrors a real column in
 * supabase/migrations/20260819000000_phase1_schema_and_rls.sql, column for
 * column — this file has no other purpose than keeping that mapping
 * explicit and typo-checked at compile time. Nothing here talks to
 * Supabase; see build-local-snapshot.ts for the pure read-only transform,
 * and the Phase 2B-1 report for the PK/uniqueness caveats these types don't
 * (and can't) enforce on their own — notably `instance_id`/`id` below are
 * typed `string`, not a branded "real uuid" type, because the local values
 * they carry are not guaranteed to parse as one.
 */

/** supabase.pets — one row per user, matches lib/pets/pet-storage.ts#StoredPetProfile exactly (petId -> character_id). */
export interface PetsRow {
  user_id: string
  character_id: string
  statling_name: string | null
  confirmed: boolean
  top_stat: string
  second_stat: string
  initial_finals: Record<string, number>
  latest_finals: Record<string, number>
  created_at: string
  confirmed_at: string | null
  updated_at: string
}

/** supabase.player_skill_records — up to 48 rows (12 games x 4 difficulties), one per lib/game/player-skill-storage.ts#MiniGamePerformanceRecord. */
export interface PlayerSkillRecordRow {
  user_id: string
  game_id: string
  difficulty: GameDifficulty
  stat_category: string
  normalized_score: number
  raw: RawRecord | null
  metrics: Record<string, number> | null
  record_version: number
  completion_id: string
  completed_at: string
  updated_at: string
}

/** supabase.xp_totals — one row per user. */
export interface XpTotalsRow {
  user_id: string
  total_xp: number
  weekly_xp: number
  week_key: string
  updated_at: string
}

/**
 * supabase.achievements — one row per tier, transformed from
 * lib/missions/achievement-storage.ts#AchievementState's two flat id
 * arrays. `unlocked_at`/`claimed_at` are NOT real per-tier timestamps —
 * localStorage never recorded one, only a single `updatedAt` for the whole
 * record — see build-local-snapshot.ts#buildAchievementRows.
 */
export interface AchievementRow {
  user_id: string
  tier_id: string
  unlocked_at: string
  claimed_at: string | null
  notified_at: string | null
}

/** supabase.daily_missions — TODAY's rows only; localStorage never kept mission history for past days. */
export interface DailyMissionRow {
  user_id: string
  date_key: string
  mission_id: string
  progress: number
  claimed_at: string | null
}

/** supabase.attendance — one row per user. */
export interface AttendanceRow {
  user_id: string
  total_days: number
  current_streak: number
  longest_streak: number
  last_visit_date: string | null
}

/** supabase.activity_counters — one row per user. */
export interface ActivityCountersRow {
  user_id: string
  total_games_played: number
  total_personal_bests: number
  free_play_completions: number
  total_interactions: number
  feed_count: number
  shower_count: number
  clean_count: number
  play_count: number
  pet_count: number
  talk_count: number
  share_count: number
  room_decor_saved: boolean
  statling_decor_saved: boolean
  has_logged_in_ever: boolean
  updated_at: string
}

/** supabase.pet_care_state — one row per user; field-for-field identical to lib/pet-care/types.ts#PetCareState, no gaps either direction. */
export interface PetCareStateRow {
  user_id: string
  satiety: number
  cleanliness: number
  affection: number
  energy: number
  happiness: number
  intimacy_level: number
  intimacy_exp: number
  unlocked_reward_levels: number[]
  gift_ready_level: number | null
  cooldowns: Record<string, number>
  last_play_variant_id: string | null
  last_updated_at: string
}

/** supabase.room_state — background only; placed items live in room_items below. */
export interface RoomStateRow {
  user_id: string
  background_id: string
  updated_at: string
}

/**
 * supabase.room_items — one row per lib/room/room-state.ts#RoomItem.
 * `instance_id` is `uuid primary key` server-side; the local `instanceId`
 * carried here is a free-form string (real UUID from crypto.randomUUID()
 * for items placed through the UI, but a `${assetId}_${random}` fallback
 * string for anything reconstructed by migrateRoomItem) — see report.
 */
export interface RoomItemRow {
  instance_id: string
  user_id: string
  asset_id: string
  category: string
  x: number
  y: number
  width: number
  height: number
  z_index: number
  rotation: number
  flipped: boolean
}

/** supabase.room_inventory — append-only; unlocked_at reuses the whole-state updatedAt (no per-asset timestamp exists locally). */
export interface RoomInventoryRow {
  user_id: string
  asset_id: string
  unlocked_at: string
}

/** supabase.room_care_state — one row per user. */
export interface RoomCareStateRow {
  user_id: string
  cleanliness: number
  last_cleaned_at: string
}

/** supabase.deco_placement_items — one row per lib/deco-placement-state.ts#DecoPlacementItem. Same non-uuid `instance_id` caveat as RoomItemRow. */
export interface DecoPlacementItemRow {
  instance_id: string
  user_id: string
  item_id: string
  anchor: string
  offset_x: number
  offset_y: number
  width: number
  height: number
  scale: number
  rotation: number
  layer: 'behind' | 'front'
  flipped: boolean
}

/** supabase.deco_inventory — append-only; same reused-timestamp caveat as RoomInventoryRow. */
export interface DecoInventoryRow {
  user_id: string
  asset_id: string
  unlocked_at: string
}

/** supabase.pet_memory — one row per user, field-for-field from lib/pet-care/pet-memory.ts#PetMemory. */
export interface PetMemoryRow {
  user_id: string
  first_met_at: string
  last_visited_at: string
  total_visits: number
  consecutive_visit_days: number
  longest_visit_streak: number
  last_visit_date: string | null
  care_action_counts: Record<string, number>
  favorite_care_action: string | null
  recent_care_actions: string[]
  recent_initiated_dialogue_ids: string[]
  recent_game_ids: string[]
  recent_game_stats: string[]
  most_played_stat: string | null
  game_play_counts_by_stat: Record<string, number>
  last_autonomous_action_at: string | null
  last_initiated_dialogue_at: string | null
  last_state_request_dialogue_at: string | null
  last_welcome_dialogue_at: string | null
  last_game_reaction_at: string | null
  last_memory_comment_date: string | null
  /** jsonb, no server-side sub-schema — inner keys kept camelCase verbatim, same shape the client itself will read back. */
  autonomy_bonus_today: { date: string; energyGained: number; happinessGained: number }
  pending_game_reaction: PendingGameReaction | null
}

/** supabase.dialogue_memory — one row per user. */
export interface DialogueMemoryRow {
  user_id: string
  answers: Record<string, string>
  answered_question_ids: string[]
}

/**
 * supabase.user_notes — one row per lib/pet-care/user-notes-storage.ts#UserNote.
 * `id` is `uuid primary key` server-side; the local id
 * (`note_${timestamp}_${random}`) is never a real UUID — see report.
 */
export interface UserNoteRow {
  id: string
  user_id: string
  text: string
  created_at: string
}

/**
 * supabase.dex_entries — append-only. `met_at` has no local source at all
 * (lib/pets/dex-storage.ts#DexRecord is just `{ metPetIds: string[] }`,
 * no timestamp ever recorded) — stamped at snapshot build time instead.
 */
export interface DexEntryRow {
  user_id: string
  character_id: string
  met_at: string
}

/** The full pure-function output of build-local-snapshot.ts#buildLocalDataSnapshot. */
export interface LocalDataSnapshot {
  userId: string
  /** When this snapshot object was built — NOT a per-row timestamp, see individual row fields. */
  builtAt: string
  pet: PetsRow | null
  playerSkillRecords: PlayerSkillRecordRow[]
  xpTotals: XpTotalsRow
  achievements: AchievementRow[]
  dailyMissions: DailyMissionRow[]
  attendance: AttendanceRow
  activityCounters: ActivityCountersRow
  petCareState: PetCareStateRow
  petMemory: PetMemoryRow
  roomCareState: RoomCareStateRow
  userNotes: UserNoteRow[]
  dialogueMemory: DialogueMemoryRow
  roomState: RoomStateRow
  roomItems: RoomItemRow[]
  decoPlacementItems: DecoPlacementItemRow[]
  decoInventory: DecoInventoryRow[]
  roomInventory: RoomInventoryRow[]
  dexEntries: DexEntryRow[]
}
