import { clearStoredPetProfile } from '@/lib/pets/pet-storage'
import { clearDex } from '@/lib/pets/dex-storage'
import { clearLocalDataOwner } from '@/lib/pets/local-data-owner'
import { clearPetCareState } from '@/lib/pet-care/pet-care-storage'
import { clearPetMemory } from '@/lib/pet-care/pet-memory-storage'
import { clearDialogueMemory } from '@/lib/pet-care/dialogue-memory-storage'
import { clearUserNotes } from '@/lib/pet-care/user-notes-storage'
import { clearRoomCareState } from '@/lib/pet-care/room-care-storage'
import { clearXpState } from '@/lib/ranking/xp-ledger'
import { clearPlayerSkillState } from '@/lib/game/player-skill-storage'
import { clearIntroProgress } from '@/lib/game/intro-progress-storage'
import { clearAchievementState } from '@/lib/missions/achievement-storage'
import { restoreNotifiedTierIds } from '@/lib/missions/achievement-notifications'
import { clearDailyMissionState } from '@/lib/missions/daily-mission-storage'
import { clearAttendanceState } from '@/lib/missions/attendance-storage'
import { clearActivityCounters } from '@/lib/missions/activity-counters'
import { clearSavedRoomState } from '@/lib/room/room-storage'
import { clearRoomInventoryState } from '@/lib/room-inventory-storage'
import { clearDecoInventoryState } from '@/lib/deco-inventory-storage'
import { clearDecoPlacementState } from '@/lib/deco-placement-storage'
import { clearFeedbackRecord } from '@/lib/feedback/feedback-storage'

/**
 * Cross-account contamination fix, part 2 — lib/pets/local-data-owner.ts's
 * own doc comment already explains WHY this exists (account A logs out on
 * this device without anything being cleared — supabase-auth-provider.tsx's
 * signOut() only clears the in-memory sync-session registry, by design — and
 * account B signs up on the SAME device afterward) and its `isLocalDataOwnedBy`
 * guard already protected 3 things: the pet profile itself (this file's one
 * caller, components/brain-bet/game-flow.tsx), the one-time bundled
 * migration (lib/migration/migration-orchestrator.ts), and feedback's own
 * migration (lib/feedback/feedback-storage.ts#migrateLocalFeedbackToRemote).
 *
 * Everything else this device's local game state touches was never gated at
 * all: every one of the ~17 other domains lib/migration/build-local-snapshot.ts
 * mirrors to Supabase is either a single global localStorage key (XP,
 * player-skill records, achievements, daily missions, attendance, activity
 * counters, dex) or keyed by the device-global id from
 * lib/room/room-storage.ts#getOrCreateDeviceId (pet care/level, pet memory,
 * dialogue memory, room state, room care, room/deco inventory, deco
 * placement, user notes, feedback) — none of which has ever carried any
 * notion of WHICH account it belongs to. A newly authenticated account whose
 * local device data belongs to someone else would otherwise inherit that
 * stranger's XP/level/skill records/missions/achievements/room, and once
 * this account is sync-ready, lib/sync/sync-dispatcher.ts pushes exactly
 * that contaminated local state to ITS OWN (correctly-authorized, RLS-valid)
 * Supabase row the next time any of those domains fires — not merely a
 * display bug.
 *
 * Called from the SAME spot game-flow.tsx already detects
 * `!isLocalDataOwnedBy(user.id)` — this widens that one moment to wipe every
 * account-owned domain instead of only the pet profile, so a newly
 * authenticated account starts every one of them completely empty instead of
 * inheriting a stranger's progress. Finishes by clearing the owner marker
 * itself back to "unclaimed" (lib/pets/local-data-owner.ts's own null case)
 * rather than claiming it for the new user right away — local doesn't
 * actually reflect this account's server state yet at this exact moment
 * (nothing has migrated/restored for them here), so leaving it unclaimed
 * lets this device's normal migration/restore flow (migration-orchestrator.ts
 * / session-sync.ts) claim it properly, later, once local and server are
 * genuinely known to agree for THIS account — exactly the same lifecycle a
 * truly fresh device already goes through, and exactly what
 * local-data-owner.ts's own doc comment describes ("preserving guest -> first
 * signup migration").
 *
 * Deliberately does NOT clear (none of these are account game progress, and
 * none has a Supabase mirror to ever leak into):
 *   - statling.deviceId.v1 (lib/room/room-storage.ts#getOrCreateDeviceId) —
 *     the device identity itself; every device-scoped key above depends on
 *     this staying put, including the ones this very function just wiped.
 *   - audio/BGM/SFX settings, statling.landingVariant.v1 (A/B assignment),
 *     statling.onboardingSeen.v1, statling.pendingFriendCode.v1 (a friend
 *     invite this browser is mid-redeeming, meant for whoever signs up next
 *     regardless of who used this device before) — genuine device/browser
 *     preferences, not per-account progress.
 *   - statling.syncUpdatedAt.v1 (lib/sync/sync-freshness.ts) — realigned
 *     naturally by whichever restore/migration path runs next for the new
 *     owner; no manual clear needed here.
 */
export function resetForeignAccountOwnedLocalState(): void {
  clearStoredPetProfile()
  clearDex()
  clearPetCareState()
  clearPetMemory()
  clearDialogueMemory()
  clearUserNotes()
  clearRoomCareState()
  clearXpState()
  clearPlayerSkillState()
  clearIntroProgress()
  clearAchievementState()
  restoreNotifiedTierIds([])
  clearDailyMissionState()
  clearAttendanceState()
  clearActivityCounters()
  clearSavedRoomState()
  clearRoomInventoryState()
  clearDecoInventoryState()
  clearDecoPlacementState()
  clearFeedbackRecord()
  clearLocalDataOwner()
}
