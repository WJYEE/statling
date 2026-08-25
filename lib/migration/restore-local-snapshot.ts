import type { StatId } from '@/lib/brain-bet'
import type { CharacterAnchorKey } from '@/lib/character-anchor.config'
import type { CareActionId, CooldownState, PetCareState, RoomCareState } from '@/lib/pet-care/types'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { DialogueMemoryKey } from '@/lib/pet-care/dialogue-memory-storage'
import type { ServerDataSnapshot } from '@/lib/migration/snapshot-types'

import { loadStoredPetProfile, saveStoredPetProfile, type StoredPetProfile } from '@/lib/pets/pet-storage'
import {
  loadPlayerSkillState,
  savePlayerSkillState,
  createDefaultPlayerSkillState,
  type PlayerSkillState,
  type MiniGamePerformanceRecord,
} from '@/lib/game/player-skill-storage'
import { loadXpState, saveXpState, type XpState } from '@/lib/ranking/xp-ledger'
import {
  loadAchievementState,
  saveAchievementState,
  createDefaultAchievementState,
  type AchievementState,
} from '@/lib/missions/achievement-storage'
import { getNotifiedTierIds, restoreNotifiedTierIds } from '@/lib/missions/achievement-notifications'
import {
  loadDailyMissionState,
  saveDailyMissionState,
  createDefaultDailyMissionState,
  ensureToday,
  type DailyMissionState,
} from '@/lib/missions/daily-mission-storage'
import { loadAttendanceState, saveAttendanceState, type AttendanceState } from '@/lib/missions/attendance-storage'
import { loadActivityCounters, saveActivityCounters, type ActivityCounters } from '@/lib/missions/activity-counters'
import { loadPetCareState, savePetCareState } from '@/lib/pet-care/pet-care-storage'
import { loadPetMemory, savePetMemory } from '@/lib/pet-care/pet-memory-storage'
import type { PetMemory } from '@/lib/pet-care/pet-memory'
import { loadRoomCareState, saveRoomCareState } from '@/lib/pet-care/room-care-storage'
import { loadDialogueMemory, saveDialogueMemory, type DialogueMemory } from '@/lib/pet-care/dialogue-memory-storage'
import { loadSavedRoomState, saveRoomState } from '@/lib/room/room-storage'
import type { RoomState, RoomItem } from '@/lib/room/room-state'
import { loadSavedDecoPlacementState, saveDecoPlacementState } from '@/lib/deco-placement-storage'
import { createDefaultDecoPlacementState, type DecoPlacementState, type DecoPlacementItem } from '@/lib/deco-placement-state'
import {
  loadDecoInventoryState,
  saveDecoInventoryState,
  createDefaultDecoInventoryState,
  type DecoInventoryState,
} from '@/lib/deco-inventory-storage'
import {
  loadRoomInventoryState,
  saveRoomInventoryState,
  createDefaultRoomInventoryState,
  type RoomInventoryState,
} from '@/lib/room-inventory-storage'
import { loadDex, saveDex, type DexRecord } from '@/lib/pets/dex-storage'
import { loadUserNotes, saveUserNotes, type UserNote } from '@/lib/pet-care/user-notes-storage'

/**
 * Phase 2C-1 — writes a ServerDataSnapshot (read-server-snapshot.ts's
 * output) into this browser's localStorage, going through each domain's own
 * existing public save API (savePlayerSkillState, saveXpState, ...) rather
 * than writing raw JSON to a storage key directly — see the module-level
 * exception below for the one domain where that wasn't possible.
 *
 * NOT wired into any real app flow — a caller (today: the QA harness) must
 * first call determineRestoreSituation() (restore-conflict.ts) and only
 * invoke this when it says `action: 'restore'`. This function itself does
 * not re-check that; it trusts the snapshot it's given and always attempts
 * every restorable domain.
 *
 * Backup + rollback (Phase 2C-1 task's atomicity requirement): every
 * domain's CURRENT local value is read via its own load()/create-default()
 * before anything is written (cheap — these are already pure reads this app
 * calls constantly). Domains are applied in a fixed order; if any save call
 * throws, every domain already written in this run is restored to its
 * backed-up value (best-effort — see the catch block in
 * restoreLocalDataFromSnapshot) and the whole run reports rolledBack:true.
 * Verified against the actual save() implementations: none of the 18
 * restorable domains' save functions swallow a write failure (audited
 * below, module by module) — every one calls `window.localStorage.setItem`
 * with no surrounding try/catch, so a QuotaExceededError (the realistic
 * failure mode) always surfaces as a thrown exception this function can
 * catch. (audio/BGM/SFX/local-auth DO swallow write failures, but none of
 * those are part of this restore's 18 domains.)
 *
 * user_notes (Phase 2C-2): lib/pet-care/user-notes-storage.ts previously
 * only exported saveUserNote(text, now) — a single-note APPEND that mints
 * its own new id/timestamp, unusable for a clean bulk restore (see the
 * Phase 2C-1 report). That module now also exports saveUserNotes(notes),
 * a real bulk-set that replaces the whole list — restoring through it
 * preserves the server's actual id/created_at per note and is idempotent
 * (re-running restore always converges to the same list, never duplicates).
 * All 18 migration domains are restorable through a public API as of this
 * change.
 */

export interface RestoreDomainResult {
  domain: string
  ok: boolean
  skipped: boolean
  reason?: string
  error?: string
}

export interface RestoreReport {
  results: RestoreDomainResult[]
  /** True iff every attempted (non-skipped) domain succeeded. */
  ok: boolean
  /** True iff a failure mid-run triggered a rollback of everything already applied. */
  rolledBack: boolean
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One reversible domain write. `backup`/`restoreBackup` share a type
 * parameter at construction time (makeStep<T> below) so pairing them is
 * type-safe where it's actually written; storing heterogeneous steps in one
 * array then necessarily erases that to `unknown` — safe here because each
 * step's own closures are the only thing that ever calls them, always with
 * the exact value that step itself produced.
 */
interface RestoreStepRuntime {
  domain: string
  applicable: boolean
  backup: () => unknown
  restoreBackup: (value: unknown) => void
  applyServer: () => void
}

function makeStep<T>(
  domain: string,
  applicable: boolean,
  backup: () => T,
  restoreBackup: (value: T) => void,
  applyServer: () => void,
): RestoreStepRuntime {
  return {
    domain,
    applicable,
    backup: backup as () => unknown,
    restoreBackup: restoreBackup as (value: unknown) => void,
    applyServer,
  }
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b
}

// ---------------------------------------------------------------------------
// Per-domain server -> local transforms
// ---------------------------------------------------------------------------

function petFromServer(row: NonNullable<ServerDataSnapshot['pet']>): StoredPetProfile {
  return {
    petId: row.character_id,
    confirmed: row.confirmed,
    topStat: row.top_stat as StatId,
    secondStat: row.second_stat as StatId,
    initialFinals: row.initial_finals as Record<StatId, number>,
    latestFinals: row.latest_finals as Record<StatId, number>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? undefined,
    statlingName: row.statling_name ?? undefined,
  }
}

/** Mirrors player-skill-storage.ts's own (unexported) recordKey format — must stay in sync with it. */
function playerSkillRecordKey(gameId: string, difficulty: GameDifficulty): string {
  return `${gameId}:${difficulty}`
}

/** Mirrors player-skill-storage.ts's own (unexported) MAX_PROCESSED_IDS — must stay in sync with it. */
const MAX_PROCESSED_IDS = 200

function playerSkillStateFromServer(rows: ServerDataSnapshot['playerSkillRecords']): PlayerSkillState {
  if (rows.length === 0) return createDefaultPlayerSkillState()
  const gameDifficultyBestRecords: Record<string, MiniGamePerformanceRecord> = {}
  let updatedAt = new Date(0).toISOString()
  for (const row of rows) {
    gameDifficultyBestRecords[playerSkillRecordKey(row.game_id, row.difficulty)] = {
      completionId: row.completion_id,
      gameId: row.game_id,
      statCategory: row.stat_category as StatId,
      difficulty: row.difficulty,
      normalizedScore: row.normalized_score,
      completedAt: row.completed_at,
      raw: row.raw ?? undefined,
      metrics: row.metrics ?? undefined,
      recordVersion: row.record_version,
    }
    updatedAt = maxIso(updatedAt, row.updated_at)
  }
  // A fresh device has no in-flight duplicate-submission risk to guard
  // against, but seeding with the restored completion ids (capped the same
  // way the live ledger caps itself) keeps the invariant "processedCompletionIds
  // is a superset of every id in gameDifficultyBestRecords" true immediately
  // after restore, rather than leaving it empty and technically inconsistent.
  const processedCompletionIds = rows.map((r) => r.completion_id).slice(-MAX_PROCESSED_IDS)
  return { version: 2, gameDifficultyBestRecords, processedCompletionIds, updatedAt }
}

function xpStateFromServer(row: NonNullable<ServerDataSnapshot['xpTotals']>): XpState {
  return { version: 1, totalXp: row.total_xp, weeklyXp: row.weekly_xp, weekKey: row.week_key, updatedAt: row.updated_at }
}

function achievementStateFromServer(rows: ServerDataSnapshot['achievements']): AchievementState {
  if (rows.length === 0) return createDefaultAchievementState()
  const unlockedTierIds = rows.map((r) => r.tier_id)
  const claimedTierIds = rows.filter((r) => r.claimed_at !== null).map((r) => r.tier_id)
  let updatedAt = new Date(0).toISOString()
  for (const row of rows) {
    updatedAt = maxIso(updatedAt, row.unlocked_at)
    if (row.claimed_at) updatedAt = maxIso(updatedAt, row.claimed_at)
  }
  return { version: 1, unlockedTierIds, claimedTierIds, updatedAt }
}

/**
 * Login/restore regression fix — tier ids whose achievements.notified_at is
 * non-null, i.e. "this account has already been shown the unlock toast for
 * this tier, on some device." A tier present in `rows` but with a null
 * notified_at is deliberately EXCLUDED here (not just left at its current
 * local value) — see restoreNotifiedTierIds's own doc comment for why a
 * restore is a wholesale replace, not a merge.
 */
function notifiedTierIdsFromServer(rows: ServerDataSnapshot['achievements']): string[] {
  return rows.filter((r) => r.notified_at !== null).map((r) => r.tier_id)
}

/** Bundles AchievementState with the separate notified-tracking set (lib/missions/achievement-notifications.ts) so the 'achievements' restore step's backup/restore/apply covers both as one unit — see that step's own comment in buildRestoreSteps. */
interface AchievementDomainBackup {
  state: AchievementState
  notifiedTierIds: string[]
}

/**
 * daily_missions rows are always "today, as of whenever Phase 2B/2C-1 wrote
 * them" — never a history (see snapshot-types.ts#DailyMissionRow). If that
 * date_key is no longer "today" on THIS device (e.g. restoring the next
 * calendar day after the server snapshot was taken), ensureToday() — the
 * exact same reducer daily-mission-storage.ts's own mutators already use —
 * resets it to a fresh, empty state for the restoring device's real today,
 * rather than presenting yesterday's stale progress/claims as current.
 */
function dailyMissionStateFromServer(rows: ServerDataSnapshot['dailyMissions'], now: Date): DailyMissionState {
  if (rows.length === 0) return createDefaultDailyMissionState(now)
  let dateKey = rows[0].date_key
  for (const row of rows) if (row.date_key > dateKey) dateKey = row.date_key
  const sameDay = rows.filter((r) => r.date_key === dateKey)
  const progress: Record<string, number> = {}
  const claimed: string[] = []
  for (const row of sameDay) {
    progress[row.mission_id] = row.progress
    if (row.claimed_at) claimed.push(row.mission_id)
  }
  return ensureToday({ version: 1, dateKey, progress, claimed }, now)
}

function attendanceStateFromServer(row: NonNullable<ServerDataSnapshot['attendance']>): AttendanceState {
  return {
    version: 1,
    totalDays: row.total_days,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastVisitDate: row.last_visit_date,
  }
}

function activityCountersFromServer(row: NonNullable<ServerDataSnapshot['activityCounters']>): ActivityCounters {
  return {
    version: 1,
    totalGamesPlayed: row.total_games_played,
    totalPersonalBests: row.total_personal_bests,
    freePlayCompletions: row.free_play_completions,
    totalInteractions: row.total_interactions,
    feedCount: row.feed_count,
    showerCount: row.shower_count,
    cleanCount: row.clean_count,
    playCount: row.play_count,
    petCount: row.pet_count,
    talkCount: row.talk_count,
    shareCount: row.share_count,
    roomDecorSaved: row.room_decor_saved,
    statlingDecorSaved: row.statling_decor_saved,
    hasLoggedInEver: row.has_logged_in_ever,
    updatedAt: row.updated_at,
  }
}

function petCareStateFromServer(row: NonNullable<ServerDataSnapshot['petCareState']>): PetCareState {
  return {
    stats: {
      satiety: row.satiety,
      cleanliness: row.cleanliness,
      affection: row.affection,
      energy: row.energy,
      happiness: row.happiness,
    },
    intimacyLevel: row.intimacy_level,
    intimacyExp: row.intimacy_exp,
    unlockedRewardLevels: [...row.unlocked_reward_levels],
    giftReadyLevel: row.gift_ready_level,
    lastUpdatedAt: row.last_updated_at,
    cooldowns: { ...row.cooldowns } as CooldownState,
    lastPlayVariantId: row.last_play_variant_id ?? undefined,
  }
}

function petMemoryFromServer(row: NonNullable<ServerDataSnapshot['petMemory']>): PetMemory {
  return {
    version: 1,
    firstMetAt: row.first_met_at,
    lastVisitedAt: row.last_visited_at,
    totalVisits: row.total_visits,
    consecutiveVisitDays: row.consecutive_visit_days,
    longestVisitStreak: row.longest_visit_streak,
    lastVisitDate: row.last_visit_date ?? undefined,
    careActionCounts: row.care_action_counts as Record<CareActionId, number>,
    favoriteCareAction: (row.favorite_care_action as CareActionId | null) ?? undefined,
    recentCareActions: [...row.recent_care_actions] as CareActionId[],
    recentInitiatedDialogueIds: [...row.recent_initiated_dialogue_ids],
    recentGameIds: [...row.recent_game_ids],
    recentGameStats: [...row.recent_game_stats] as StatId[],
    mostPlayedStat: (row.most_played_stat as StatId | null) ?? undefined,
    gamePlayCountsByStat: row.game_play_counts_by_stat as Partial<Record<StatId, number>>,
    lastAutonomousActionAt: row.last_autonomous_action_at ?? undefined,
    lastInitiatedDialogueAt: row.last_initiated_dialogue_at ?? undefined,
    lastStateRequestDialogueAt: row.last_state_request_dialogue_at ?? undefined,
    lastWelcomeDialogueAt: row.last_welcome_dialogue_at ?? undefined,
    lastGameReactionAt: row.last_game_reaction_at ?? undefined,
    lastMemoryCommentDate: row.last_memory_comment_date ?? undefined,
    autonomyBonusToday: { ...row.autonomy_bonus_today },
    pendingGameReaction: row.pending_game_reaction ? { ...row.pending_game_reaction } : null,
  }
}

function roomCareStateFromServer(row: NonNullable<ServerDataSnapshot['roomCareState']>): RoomCareState {
  return { cleanliness: row.cleanliness, lastCleanedAt: row.last_cleaned_at }
}

function dialogueMemoryFromServer(row: NonNullable<ServerDataSnapshot['dialogueMemory']>): DialogueMemory {
  return {
    version: 1,
    answers: row.answers as Partial<Record<DialogueMemoryKey, string>>,
    answeredQuestionIds: [...row.answered_question_ids],
  }
}

function roomItemFromServer(row: ServerDataSnapshot['roomItems'][number]): RoomItem {
  return {
    instanceId: row.instance_id,
    assetId: row.asset_id,
    category: row.category as RoomItem['category'],
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.z_index,
    rotation: row.rotation,
    flipped: row.flipped,
  }
}

function roomStateFromServer(
  stateRow: NonNullable<ServerDataSnapshot['roomState']>,
  itemRows: ServerDataSnapshot['roomItems'],
): RoomState {
  return {
    version: 1,
    backgroundId: stateRow.background_id,
    items: itemRows.map(roomItemFromServer),
    updatedAt: stateRow.updated_at,
  }
}

function roomInventoryStateFromServer(rows: ServerDataSnapshot['roomInventory']): RoomInventoryState {
  if (rows.length === 0) return createDefaultRoomInventoryState()
  let updatedAt = new Date(0).toISOString()
  for (const row of rows) updatedAt = maxIso(updatedAt, row.unlocked_at)
  return { version: 1, unlockedIds: rows.map((r) => r.asset_id), updatedAt }
}

function decoPlacementStateFromServer(rows: ServerDataSnapshot['decoPlacementItems']): DecoPlacementState {
  if (rows.length === 0) return createDefaultDecoPlacementState()
  let updatedAt = new Date(0).toISOString()
  const items: DecoPlacementItem[] = rows.map((row) => ({
    instanceId: row.instance_id,
    itemId: row.item_id,
    anchor: row.anchor as CharacterAnchorKey,
    offsetX: row.offset_x,
    offsetY: row.offset_y,
    width: row.width,
    height: row.height,
    scale: row.scale,
    rotation: row.rotation,
    layer: row.layer,
    flipped: row.flipped,
  }))
  return { version: 1, items, updatedAt }
}

function decoInventoryStateFromServer(rows: ServerDataSnapshot['decoInventory']): DecoInventoryState {
  if (rows.length === 0) return createDefaultDecoInventoryState()
  let updatedAt = new Date(0).toISOString()
  for (const row of rows) updatedAt = maxIso(updatedAt, row.unlocked_at)
  return { version: 1, unlockedIds: rows.map((r) => r.asset_id), updatedAt }
}

function dexFromServer(rows: ServerDataSnapshot['dexEntries']): DexRecord {
  return { metPetIds: rows.map((r) => r.character_id) }
}

function userNotesFromServer(rows: ServerDataSnapshot['userNotes']): UserNote[] {
  return rows.map((row) => ({ id: row.id, text: row.text, createdAt: row.created_at }))
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function buildRestoreSteps(snapshot: ServerDataSnapshot, now: Date): RestoreStepRuntime[] {
  return [
    makeStep(
      'pets',
      snapshot.pet !== null,
      loadStoredPetProfile,
      (v) => (v ? saveStoredPetProfile(v) : undefined),
      () => saveStoredPetProfile(petFromServer(snapshot.pet as NonNullable<ServerDataSnapshot['pet']>)),
    ),
    makeStep(
      'player_skill_records',
      true, // an empty array is still meaningful ("no records on server") and worth applying
      loadPlayerSkillState,
      savePlayerSkillState,
      () => savePlayerSkillState(playerSkillStateFromServer(snapshot.playerSkillRecords)),
    ),
    makeStep(
      'xp_totals',
      snapshot.xpTotals !== null,
      loadXpState,
      saveXpState,
      () => saveXpState(xpStateFromServer(snapshot.xpTotals as NonNullable<ServerDataSnapshot['xpTotals']>)),
    ),
    // Login/restore regression fix — bundles AchievementState with the
    // separate local notified-tracking set (see AchievementDomainBackup) so
    // both are backed up/restored/applied together as one atomic step: a
    // rollback of this domain must undo the notified set too, not just
    // unlockedTierIds/claimedTierIds, or a failed-and-rolled-back restore
    // could leave the two halves of "achievements" state inconsistent.
    makeStep<AchievementDomainBackup>(
      'achievements',
      true,
      () => ({ state: loadAchievementState(), notifiedTierIds: Array.from(getNotifiedTierIds()) }),
      (backup) => {
        saveAchievementState(backup.state)
        restoreNotifiedTierIds(backup.notifiedTierIds)
      },
      () => {
        saveAchievementState(achievementStateFromServer(snapshot.achievements))
        restoreNotifiedTierIds(notifiedTierIdsFromServer(snapshot.achievements))
      },
    ),
    makeStep(
      'daily_missions',
      true,
      loadDailyMissionState,
      saveDailyMissionState,
      () => saveDailyMissionState(dailyMissionStateFromServer(snapshot.dailyMissions, now)),
    ),
    makeStep(
      'attendance',
      snapshot.attendance !== null,
      loadAttendanceState,
      saveAttendanceState,
      () => saveAttendanceState(attendanceStateFromServer(snapshot.attendance as NonNullable<ServerDataSnapshot['attendance']>)),
    ),
    makeStep(
      'activity_counters',
      snapshot.activityCounters !== null,
      loadActivityCounters,
      saveActivityCounters,
      () =>
        saveActivityCounters(
          activityCountersFromServer(snapshot.activityCounters as NonNullable<ServerDataSnapshot['activityCounters']>),
        ),
    ),
    makeStep(
      'pet_care_state',
      snapshot.petCareState !== null,
      loadPetCareState,
      savePetCareState,
      () => savePetCareState(petCareStateFromServer(snapshot.petCareState as NonNullable<ServerDataSnapshot['petCareState']>)),
    ),
    makeStep(
      'pet_memory',
      snapshot.petMemory !== null,
      () => loadPetMemory(now),
      savePetMemory,
      () => savePetMemory(petMemoryFromServer(snapshot.petMemory as NonNullable<ServerDataSnapshot['petMemory']>)),
    ),
    makeStep(
      'room_care_state',
      snapshot.roomCareState !== null,
      loadRoomCareState,
      saveRoomCareState,
      () =>
        saveRoomCareState(roomCareStateFromServer(snapshot.roomCareState as NonNullable<ServerDataSnapshot['roomCareState']>)),
    ),
    makeStep(
      'dialogue_memory',
      snapshot.dialogueMemory !== null,
      loadDialogueMemory,
      saveDialogueMemory,
      () =>
        saveDialogueMemory(dialogueMemoryFromServer(snapshot.dialogueMemory as NonNullable<ServerDataSnapshot['dialogueMemory']>)),
    ),
    makeStep(
      // Combined room_state + room_items — see roomStateFromServer's doc.
      'room_state',
      snapshot.roomState !== null,
      loadSavedRoomState,
      saveRoomState,
      () =>
        saveRoomState(
          roomStateFromServer(snapshot.roomState as NonNullable<ServerDataSnapshot['roomState']>, snapshot.roomItems),
        ),
    ),
    makeStep(
      'room_inventory',
      true,
      loadRoomInventoryState,
      saveRoomInventoryState,
      () => saveRoomInventoryState(roomInventoryStateFromServer(snapshot.roomInventory)),
    ),
    makeStep(
      'deco_placement_items',
      true,
      loadSavedDecoPlacementState,
      saveDecoPlacementState,
      () => saveDecoPlacementState(decoPlacementStateFromServer(snapshot.decoPlacementItems)),
    ),
    makeStep(
      'deco_inventory',
      true,
      loadDecoInventoryState,
      saveDecoInventoryState,
      () => saveDecoInventoryState(decoInventoryStateFromServer(snapshot.decoInventory)),
    ),
    makeStep('dex_entries', true, loadDex, saveDex, () => saveDex(dexFromServer(snapshot.dexEntries))),
    makeStep('user_notes', true, loadUserNotes, saveUserNotes, () => saveUserNotes(userNotesFromServer(snapshot.userNotes))),
  ]
}

export function restoreLocalDataFromSnapshot(snapshot: ServerDataSnapshot, now: Date = new Date()): RestoreReport {
  const steps = buildRestoreSteps(snapshot, now)
  const results: RestoreDomainResult[] = []
  const applied: { step: RestoreStepRuntime; backupValue: unknown }[] = []

  for (const step of steps) {
    if (!step.applicable) {
      results.push({ domain: step.domain, ok: true, skipped: true, reason: 'no server row for this domain' })
      continue
    }

    const backupValue = step.backup()
    try {
      step.applyServer()
      applied.push({ step, backupValue })
      results.push({ domain: step.domain, ok: true, skipped: false })
    } catch (err) {
      results.push({ domain: step.domain, ok: false, skipped: false, error: failureMessage(err) })
      for (let i = applied.length - 1; i >= 0; i--) {
        try {
          applied[i].step.restoreBackup(applied[i].backupValue)
        } catch {
          // Best-effort rollback — see this function's doc comment.
        }
      }
      return { results, ok: false, rolledBack: true }
    }
  }

  return { results, ok: results.every((r) => r.ok), rolledBack: false }
}
