import { loadStoredPetProfile } from '@/lib/pets/pet-storage'
import { loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import { loadXpState } from '@/lib/ranking/xp-ledger'
import { loadAchievementState } from '@/lib/missions/achievement-storage'
import { loadDailyMissionState, ensureToday } from '@/lib/missions/daily-mission-storage'
import { loadAttendanceState } from '@/lib/missions/attendance-storage'
import { loadActivityCounters } from '@/lib/missions/activity-counters'
import { loadPetCareState } from '@/lib/pet-care/pet-care-storage'
import { loadPetMemory } from '@/lib/pet-care/pet-memory-storage'
import { loadRoomCareState } from '@/lib/pet-care/room-care-storage'
import { loadUserNotes } from '@/lib/pet-care/user-notes-storage'
import { loadDialogueMemory } from '@/lib/pet-care/dialogue-memory-storage'
import { loadSavedRoomState } from '@/lib/room/room-storage'
import { loadSavedDecoPlacementState } from '@/lib/deco-placement-storage'
import { loadDecoInventoryState } from '@/lib/deco-inventory-storage'
import { loadRoomInventoryState } from '@/lib/room-inventory-storage'
import { loadDex } from '@/lib/pets/dex-storage'
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
 * Phase 2B-1 — pure localStorage -> Phase 1 Supabase row transform.
 *
 * NO network calls, NO Supabase client import, NO localStorage writes: every
 * function below only ever calls an existing storage module's own `load*`
 * function (never touches `window.localStorage` directly) and returns plain
 * data. `userId` is supplied by the caller — this file has no opinion about
 * where it comes from and never imports anything from lib/auth/*.
 *
 * See the Phase 2B-1 report for the fields that can't be a lossless mirror
 * (achievements/inventory timestamps, room_items/deco_placement_items/
 * user_notes ids not guaranteed to be real UUIDs) — those are called out
 * inline below at the exact line that makes the tradeoff.
 */

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-2) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildPetRow(userId: string): PetsRow | null {
  const profile = loadStoredPetProfile()
  if (!profile) return null
  return {
    user_id: userId,
    character_id: profile.petId,
    statling_name: profile.statlingName ?? null,
    confirmed: profile.confirmed,
    top_stat: profile.topStat,
    second_stat: profile.secondStat,
    initial_finals: profile.initialFinals,
    latest_finals: profile.latestFinals,
    created_at: profile.createdAt,
    confirmed_at: profile.confirmedAt ?? null,
    updated_at: profile.updatedAt,
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-3) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildPlayerSkillRecordRows(userId: string): PlayerSkillRecordRow[] {
  const state = loadPlayerSkillState()
  return Object.values(state.gameDifficultyBestRecords).map((record) => ({
    user_id: userId,
    game_id: record.gameId,
    difficulty: record.difficulty,
    stat_category: record.statCategory,
    normalized_score: record.normalizedScore,
    raw: record.raw ?? null,
    metrics: record.metrics ?? null,
    record_version: record.recordVersion ?? 1,
    completion_id: record.completionId,
    completed_at: record.completedAt,
    updated_at: state.updatedAt,
  }))
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-3) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildXpTotalsRow(userId: string, now: Date): XpTotalsRow {
  const state = loadXpState(now)
  return {
    user_id: userId,
    total_xp: state.totalXp,
    weekly_xp: state.weeklyXp,
    week_key: state.weekKey,
    updated_at: state.updatedAt,
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-2) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildAchievementRows(userId: string): AchievementRow[] {
  const state = loadAchievementState()
  // unlockedTierIds/claimedTierIds are two flat id arrays with no per-tier
  // timestamp anywhere in localStorage — state.updatedAt (one value for the
  // whole record) is the only real signal available, so every row below
  // reuses it for both unlocked_at and (where claimed) claimed_at. This
  // keeps the DB's `claimed_at >= unlocked_at` check satisfied (equal
  // passes) but is not a genuine per-tier unlock/claim moment.
  const tierIds = Array.from(new Set([...state.unlockedTierIds, ...state.claimedTierIds]))
  return tierIds.map((tierId) => ({
    user_id: userId,
    tier_id: tierId,
    unlocked_at: state.updatedAt,
    claimed_at: state.claimedTierIds.includes(tierId) ? state.updatedAt : null,
    notified_at: null,
  }))
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildDailyMissionRows(userId: string, now: Date): DailyMissionRow[] {
  // loadDailyMissionState() does NOT roll a stale day over by itself — only
  // recordDailyProgress/claimDailyMission call ensureToday. Reusing the same
  // exported reducer here guarantees a snapshot built before today's first
  // mission action never uploads a stale (yesterday's) dateKey.
  const today = ensureToday(loadDailyMissionState(), now)
  const missionIds = new Set<string>([...Object.keys(today.progress), ...today.claimed])
  return Array.from(missionIds).map((missionId) => ({
    user_id: userId,
    date_key: today.dateKey,
    mission_id: missionId,
    progress: today.progress[missionId] ?? 0,
    // No local claim timestamp exists either — stamped at snapshot build time.
    claimed_at: today.claimed.includes(missionId) ? now.toISOString() : null,
  }))
}

function buildAttendanceRow(userId: string): AttendanceRow {
  const state = loadAttendanceState()
  return {
    user_id: userId,
    total_days: state.totalDays,
    current_streak: state.currentStreak,
    longest_streak: state.longestStreak,
    last_visit_date: state.lastVisitDate,
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildActivityCountersRow(userId: string): ActivityCountersRow {
  const c = loadActivityCounters()
  return {
    user_id: userId,
    total_games_played: c.totalGamesPlayed,
    total_personal_bests: c.totalPersonalBests,
    free_play_completions: c.freePlayCompletions,
    total_interactions: c.totalInteractions,
    feed_count: c.feedCount,
    shower_count: c.showerCount,
    clean_count: c.cleanCount,
    play_count: c.playCount,
    pet_count: c.petCount,
    talk_count: c.talkCount,
    share_count: c.shareCount,
    room_decor_saved: c.roomDecorSaved,
    statling_decor_saved: c.statlingDecorSaved,
    has_logged_in_ever: c.hasLoggedInEver,
    updated_at: c.updatedAt,
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildPetCareStateRow(userId: string): PetCareStateRow {
  const s = loadPetCareState()
  return {
    user_id: userId,
    satiety: s.stats.satiety,
    cleanliness: s.stats.cleanliness,
    affection: s.stats.affection,
    energy: s.stats.energy,
    happiness: s.stats.happiness,
    intimacy_level: s.intimacyLevel,
    intimacy_exp: s.intimacyExp,
    unlocked_reward_levels: [...s.unlockedRewardLevels],
    gift_ready_level: s.giftReadyLevel,
    cooldowns: { ...s.cooldowns },
    last_play_variant_id: s.lastPlayVariantId ?? null,
    last_updated_at: s.lastUpdatedAt,
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildRoomCareStateRow(userId: string): RoomCareStateRow {
  const s = loadRoomCareState()
  return { user_id: userId, cleanliness: s.cleanliness, last_cleaned_at: s.lastCleanedAt }
}

function buildUserNoteRows(userId: string): UserNoteRow[] {
  // note.id (`note_${timestamp}_${random}`) is carried through as-is — not a
  // real uuid, see snapshot-types.ts#UserNoteRow and the Phase 2B-1 report.
  return loadUserNotes().map((note) => ({ id: note.id, user_id: userId, text: note.text, created_at: note.createdAt }))
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildDialogueMemoryRow(userId: string): DialogueMemoryRow {
  const m = loadDialogueMemory()
  return {
    user_id: userId,
    answers: { ...m.answers } as Record<string, string>,
    answered_question_ids: [...m.answeredQuestionIds],
  }
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-4) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildPetMemoryRow(userId: string, now: Date): PetMemoryRow {
  const m = loadPetMemory(now)
  return {
    user_id: userId,
    first_met_at: m.firstMetAt,
    last_visited_at: m.lastVisitedAt,
    total_visits: m.totalVisits,
    consecutive_visit_days: m.consecutiveVisitDays,
    longest_visit_streak: m.longestVisitStreak,
    last_visit_date: m.lastVisitDate ?? null,
    care_action_counts: { ...m.careActionCounts },
    favorite_care_action: m.favoriteCareAction ?? null,
    recent_care_actions: [...m.recentCareActions],
    recent_initiated_dialogue_ids: [...m.recentInitiatedDialogueIds],
    recent_game_ids: [...m.recentGameIds],
    recent_game_stats: [...m.recentGameStats],
    most_played_stat: m.mostPlayedStat ?? null,
    game_play_counts_by_stat: { ...m.gamePlayCountsByStat } as Record<string, number>,
    last_autonomous_action_at: m.lastAutonomousActionAt ?? null,
    last_initiated_dialogue_at: m.lastInitiatedDialogueAt ?? null,
    last_state_request_dialogue_at: m.lastStateRequestDialogueAt ?? null,
    last_welcome_dialogue_at: m.lastWelcomeDialogueAt ?? null,
    last_game_reaction_at: m.lastGameReactionAt ?? null,
    last_memory_comment_date: m.lastMemoryCommentDate ?? null,
    autonomy_bonus_today: { ...m.autonomyBonusToday },
    pending_game_reaction: m.pendingGameReaction ? { ...m.pendingGameReaction } : null,
  }
}

function buildRoomStateRow(userId: string): RoomStateRow {
  const s = loadSavedRoomState()
  return { user_id: userId, background_id: s.backgroundId, updated_at: s.updatedAt }
}

function buildRoomItemRows(userId: string): RoomItemRow[] {
  // item.instanceId is carried through as-is — not guaranteed to be a real
  // uuid, see snapshot-types.ts#RoomItemRow and the Phase 2B-1 report.
  const s = loadSavedRoomState()
  return s.items.map((item) => ({
    instance_id: item.instanceId,
    user_id: userId,
    asset_id: item.assetId,
    category: item.category,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    z_index: item.zIndex,
    rotation: item.rotation ?? 0,
    flipped: item.flipped ?? false,
  }))
}

function buildDecoPlacementItemRows(userId: string): DecoPlacementItemRow[] {
  // item.instanceId is carried through as-is — same non-uuid caveat as room_items above.
  const s = loadSavedDecoPlacementState()
  return s.items.map((item) => ({
    instance_id: item.instanceId,
    user_id: userId,
    item_id: item.itemId,
    anchor: item.anchor,
    offset_x: item.offsetX,
    offset_y: item.offsetY,
    width: item.width,
    height: item.height,
    scale: item.scale,
    rotation: item.rotation,
    layer: item.layer,
    flipped: item.flipped ?? false,
  }))
}

function buildDecoInventoryRows(userId: string): DecoInventoryRow[] {
  const s = loadDecoInventoryState()
  // unlocked_at reuses the whole-state updatedAt — no per-asset timestamp exists locally.
  return s.unlockedIds.map((assetId) => ({ user_id: userId, asset_id: assetId, unlocked_at: s.updatedAt }))
}

function buildRoomInventoryRows(userId: string): RoomInventoryRow[] {
  const s = loadRoomInventoryState()
  return s.unlockedIds.map((assetId) => ({ user_id: userId, asset_id: assetId, unlocked_at: s.updatedAt }))
}

/** Exported for lib/sync/sync-dispatcher.ts (Phase 2D-2) — same pure row mapping reused for a single-domain continuous-sync push, not just the one-time snapshot below. */
export function buildDexEntryRows(userId: string, now: Date): DexEntryRow[] {
  const dex = loadDex()
  // DexRecord has no timestamp field at all — every entry is stamped at
  // snapshot build time, not the real "met" moment (never recorded locally).
  return dex.metPetIds.map((characterId) => ({ user_id: userId, character_id: characterId, met_at: now.toISOString() }))
}

/**
 * Reads the 17 server-bound localStorage modules for the current browser and
 * transforms them into Phase 1 Supabase row shapes. Pure and read-only: does
 * not write to localStorage, does not call Supabase, does not touch
 * lib/auth/*. `now` defaults to the real current time but is accepted as a
 * parameter so callers (and tests) can pin it for deterministic output.
 *
 * Deliberately excluded (see the Phase 2B Audit): intro progress, the
 * achievement-notified UI dedupe flag, audio/BGM/SFX settings, onboarding,
 * feedback, and the orphaned local-auth store — none of these have a Phase 1
 * table to migrate into.
 */
export function buildLocalDataSnapshot(userId: string, now: Date = new Date()): LocalDataSnapshot {
  return {
    userId,
    builtAt: now.toISOString(),
    pet: buildPetRow(userId),
    playerSkillRecords: buildPlayerSkillRecordRows(userId),
    xpTotals: buildXpTotalsRow(userId, now),
    achievements: buildAchievementRows(userId),
    dailyMissions: buildDailyMissionRows(userId, now),
    attendance: buildAttendanceRow(userId),
    activityCounters: buildActivityCountersRow(userId),
    petCareState: buildPetCareStateRow(userId),
    petMemory: buildPetMemoryRow(userId, now),
    roomCareState: buildRoomCareStateRow(userId),
    userNotes: buildUserNoteRows(userId),
    dialogueMemory: buildDialogueMemoryRow(userId),
    roomState: buildRoomStateRow(userId),
    roomItems: buildRoomItemRows(userId),
    decoPlacementItems: buildDecoPlacementItemRows(userId),
    decoInventory: buildDecoInventoryRows(userId),
    roomInventory: buildRoomInventoryRows(userId),
    dexEntries: buildDexEntryRows(userId, now),
  }
}
