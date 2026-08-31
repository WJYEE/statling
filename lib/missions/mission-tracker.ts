import type { CareActionId } from '@/lib/pet-care/types'
import { loadPetCareState } from '@/lib/pet-care/pet-care-storage'
import { loadPetMemory } from '@/lib/pet-care/pet-memory-storage'
import { loadDex } from '@/lib/pets/dex-storage'
import { totalMiniGamePlays } from '@/lib/pets/pet-growth-summary'
import { audioManager } from '@/lib/audio/audio-manager'
import { addXp, loadXpState, saveXpState } from '@/lib/ranking/xp-ledger'
import {
  loadActivityCounters,
  saveActivityCounters,
  recordGamePlayed as recordGamePlayedCounter,
  recordCareInteraction as recordCareInteractionCounter,
  recordShare as recordShareCounter,
  recordRoomDecorSaved as recordRoomDecorSavedCounter,
  recordStatlingDecorSaved as recordStatlingDecorSavedCounter,
  recordFirstLogin as recordFirstLoginCounter,
  type ActivityCounters,
} from '@/lib/missions/activity-counters'
import { loadAttendanceState, saveAttendanceState, recordDailyVisit } from '@/lib/missions/attendance-storage'
import {
  loadDailyMissionState,
  saveDailyMissionState,
  recordDailyProgress,
  claimDailyMission,
  type DailyMissionState,
} from '@/lib/missions/daily-mission-storage'
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS_FLAT, RANK_ACHIEVEMENT_METRICS, findAchievementTier, type AchievementMetricKey } from '@/lib/missions/achievements.config'
import { evaluateAchievementFamilies, type AchievementTierProgress } from '@/lib/missions/achievement-evaluator'
import { loadAchievementState, saveAchievementState } from '@/lib/missions/achievement-storage'
import { publishAchievementUnlocked } from '@/lib/missions/achievement-notifications'
import { grantRoomReward, loadRoomInventoryState, saveRoomInventoryState } from '@/lib/room-inventory-storage'
import { trackEvent } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { scheduleSync, flushSync } from '@/lib/sync/sync-dispatcher'

/**
 * Every tracked gameplay event's single entry point — the ONLY file
 * game-flow.tsx / hooks/use-pet-care.ts / theme-screen.tsx /
 * statling-screen.tsx / my-page-screen.tsx import from for mission/
 * achievement tracking. Each track* call updates the relevant lifetime
 * counter(s) (lib/missions/activity-counters.ts), bumps today's daily
 * mission progress where relevant (lib/missions/daily-mission-storage.ts),
 * then re-evaluates every SYNC achievement family (lib/missions/
 * achievements.config.ts) and marks anything newly-completed as unlocked
 * (condition met, reward still pending — see claimAchievementReward for the
 * actual XP/Room-reward grant, a separate user-initiated step triggered from
 * MissionScreen's "보상 받기"). Rank-based achievement families
 * (bestGameRank/overallRank) are deliberately NOT checked here — see
 * lib/missions/ranking-achievements.ts, called only when the 업적 tab is
 * actually opened, since they need an async ranking-provider call this
 * synchronous choke point can't await.
 */

const SYNC_FAMILIES = ACHIEVEMENT_FAMILIES.filter((family) => !RANK_ACHIEVEMENT_METRICS.includes(family.metric))

function collectSyncMetricValues(counters: ActivityCounters): Partial<Record<AchievementMetricKey, number>> {
  const attendance = loadAttendanceState()
  const petCare = loadPetCareState()
  const dex = loadDex()
  // counters.totalGamesPlayed only started counting the day this missions
  // system shipped — a player with real history from before that (tracked
  // all along in PetMemory.gamePlayCountsByStat, see lib/pet-care/pet-memory.ts
  // and lib/pets/pet-growth-summary.ts#totalMiniGamePlays, the same sum
  // MyPage's share card already uses) would otherwise see "게임 판수" tiers
  // sitting at a misleadingly low count. Both tallies increment together on
  // every completion going forward, so PetMemory's is always >= the
  // counter's — max() just picks whichever actually reflects reality.
  const gamesPlayed = Math.max(counters.totalGamesPlayed, totalMiniGamePlays(loadPetMemory()))
  return {
    attendanceFirstVisit: attendance.totalDays >= 1 ? 1 : 0,
    firstLogin: counters.hasLoggedInEver ? 1 : 0,
    attendanceTotalDays: attendance.totalDays,
    attendanceStreak: attendance.longestStreak,
    gamesPlayed,
    personalBestFirst: counters.totalPersonalBests >= 1 ? 1 : 0,
    personalBestCount: counters.totalPersonalBests,
    totalInteractions: counters.totalInteractions,
    feedCount: counters.feedCount,
    washCount: counters.showerCount,
    playCount: counters.playCount,
    talkCount: counters.talkCount,
    petCount: counters.petCount,
    intimacyLevel: petCare.intimacyLevel,
    dexCount: dex.metPetIds.length,
    roomDecorSaved: counters.roomDecorSaved ? 1 : 0,
    statlingDecorSaved: counters.statlingDecorSaved ? 1 : 0,
    shareCount: counters.shareCount,
  }
}

/**
 * Backfills a Room Decoration reward for any tier that's already in
 * `claimedTierIds` (its reward was actually granted in a past session —
 * possibly before that tier even had a `roomReward` attached, or before
 * this device's RoomInventoryState existed) but whose reward isn't in
 * inventory yet. Deliberately keyed off `claimedTierIds`, not
 * `unlockedTierIds` — an unlocked-but-not-yet-claimed tier must NOT have its
 * Room reward leak into inventory ahead of the player actually pressing
 * "보상 받기" (see claimAchievementReward). Never touches XP — that's only
 * ever granted once, inside claimAchievementReward. Self-terminating: once
 * backfilled, the reward is in inventory, so the very next call finds
 * nothing left to reconcile for that tier — no separate "migration already
 * ran" flag needed, so this is safe to call on every evaluation pass (see
 * applyNewlyUnlockedAchievements).
 */
function reconcileRoomRewards(claimedTierIds: readonly string[]): void {
  const owned = new Set(claimedTierIds)
  const missing = ACHIEVEMENT_TIERS_FLAT.filter((tier) => tier.roomReward && owned.has(tier.id))
  if (missing.length === 0) return

  let inventory = loadRoomInventoryState()
  let changed = false
  for (const tier of missing) {
    if (inventory.unlockedIds.includes(tier.roomReward as string)) continue
    inventory = grantRoomReward(inventory, tier.roomReward as string)
    changed = true
  }
  if (changed) saveRoomInventoryState(inventory)
}

/**
 * Diffs freshly-evaluated progress against what's already been unlocked and
 * marks each newly-completed tier as unlocked (condition met) — persists
 * `unlockedTierIds`, fires the existing `achievement_unlock` GA4 event
 * (relocated here from the old auto-grant path; same event name/params as
 * before, now fired at the moment that's actually true to its name — see
 * lib/analytics/ga.ts, untouched), and notifies GameFlow's toast
 * subscription (see achievement-notifications.ts) so the player gets a
 * small "업적을 달성했어요!" nudge even if they never open the 업적 tab.
 * Deliberately grants NO XP and NO Room reward here — see
 * claimAchievementReward for that, now a separate user-initiated step.
 */
export function applyNewlyUnlockedAchievements(progressList: AchievementTierProgress[]): AchievementTierProgress[] {
  const state = loadAchievementState()
  const unlockedSet = new Set(state.unlockedTierIds)
  const newlyUnlocked = progressList.filter((p) => p.completed && !unlockedSet.has(p.tierId))

  // Runs regardless of whether anything is newly-unlocked this call — a
  // returning player's pre-existing CLAIMED tiers may still be missing a
  // Room reward that didn't exist when they first claimed the tier.
  reconcileRoomRewards(state.claimedTierIds)

  if (newlyUnlocked.length === 0) return newlyUnlocked

  saveAchievementState({
    version: 1,
    unlockedTierIds: [...state.unlockedTierIds, ...newlyUnlocked.map((p) => p.tierId)],
    claimedTierIds: state.claimedTierIds,
    updatedAt: new Date().toISOString(),
  })
  // newlyUnlocked is already the "did anything actually change" signal —
  // evaluateSyncAchievements() runs on every track* call, but this branch
  // (and therefore this sync push) only executes when a tier's condition
  // was ACTUALLY just met, never on a no-op re-evaluation.
  scheduleSync('achievements')

  for (const p of newlyUnlocked) {
    trackEvent('achievement_unlock', { achievement_id: p.tierId, achievement_type: p.category })
    trackProductEvent('achievement_unlocked', { achievement_id: p.tierId, achievement_type: p.category })
  }
  publishAchievementUnlocked(newlyUnlocked)
  return newlyUnlocked
}

export interface ClaimAchievementResult {
  claimed: boolean
  rewardXp?: number
  roomReward?: string
}

/**
 * MissionScreen's "보상 받기" — grants a tier's rewardXp (and Room reward,
 * if any) exactly once. Mirrors claimDailyMissionReward's guard style: a
 * tier must already be unlocked (condition met) and NOT already claimed, or
 * this is a silent no-op (`{ claimed: false }`), never a throw — a stray
 * double-click or a stale UI render racing a fresh claim must never
 * double-grant XP. This double guard (unlocked-but-not-claimed) is the only
 * thing standing between a re-click and a duplicate XP grant, since addXp
 * itself has no idempotency of its own (see lib/ranking/xp-ledger.ts) —
 * unlike grantRoomReward, which is additionally safe to call twice on its
 * own. SFX plays only here, on an actual grant — never at unlock time.
 */
export function claimAchievementReward(tierId: string): ClaimAchievementResult {
  const tier = findAchievementTier(tierId)
  if (!tier) return { claimed: false }

  const state = loadAchievementState()
  if (!state.unlockedTierIds.includes(tierId)) return { claimed: false }
  if (state.claimedTierIds.includes(tierId)) return { claimed: false }

  saveXpState(addXp(loadXpState(), tier.rewardXp))
  // Phase 2D-4 — closes the gap noted in the Phase 2D-3 report: this write
  // was never followed by a sync of its own, so a reward claim's XP only
  // ever reached the server as a side effect of the NEXT game completion
  // (game-flow.tsx's recordSkillCompletion). xp_totals was already a
  // continuous-sync domain since Phase 2D-3 (0-debounce, immediate) — this
  // is just the missing trigger for it, not a new domain.
  scheduleSync('xp_totals')

  if (tier.roomReward) {
    saveRoomInventoryState(grantRoomReward(loadRoomInventoryState(), tier.roomReward))
  }

  saveAchievementState({
    version: 1,
    unlockedTierIds: state.unlockedTierIds,
    claimedTierIds: [...state.claimedTierIds, tierId],
    updatedAt: new Date().toISOString(),
  })
  scheduleSync('achievements')

  audioManager.play('achievement')

  return { claimed: true, rewardXp: tier.rewardXp, roomReward: tier.roomReward }
}

/** Re-evaluates every sync achievement family against current storage and unlocks (marks completed) any newly-completed tier — rewards are granted separately via claimAchievementReward. Safe to call often — pure reads until something actually changed. */
export function evaluateSyncAchievements(): AchievementTierProgress[] {
  const counters = loadActivityCounters()
  const values = collectSyncMetricValues(counters)
  const progress = evaluateAchievementFamilies(SYNC_FAMILIES, values)
  applyNewlyUnlockedAchievements(progress)
  return progress
}

/** App-open choke point — call once per mount. Skips the daily-mission bump (but still re-evaluates achievements, so retroactive/already-earned tiers get credited) if today's visit was already recorded. */
export function trackDailyVisit(now: Date = new Date()): void {
  const attendance = loadAttendanceState()
  const next = recordDailyVisit(attendance, now)
  if (next !== attendance) {
    saveAttendanceState(next)
    saveDailyMissionState(recordDailyProgress(loadDailyMissionState(), 'daily-attendance', now, 1))
    scheduleSync('daily_missions')
    // Phase 3J-3 — attendance is now a continuous-sync domain too (was
    // previously written only once, by the initial migration, then never
    // updated again — see ANALYTICS_GAP_AUDIT.md §8/§14 P0). Inside this
    // same `next !== attendance` guard, so a repeat same-day visit never
    // schedules a redundant write.
    scheduleSync('attendance')
  }
  evaluateSyncAchievements()
}

/** Auth choke point — call whenever useAuth()'s `user` becomes non-null. Idempotent (see recordFirstLogin). */
export function trackFirstLogin(): void {
  saveActivityCounters(recordFirstLoginCounter(loadActivityCounters()))
  scheduleSync('activity_counters')
  evaluateSyncAchievements()
}

/** game-flow.tsx#recordSkillCompletion's choke point — call once per *valid* mini-game completion (Intro or Free Play). */
export function trackGamePlayed(opts: { isFreePlay: boolean; isPersonalBest: boolean }, now: Date = new Date()): void {
  saveActivityCounters(recordGamePlayedCounter(loadActivityCounters(), opts))
  scheduleSync('activity_counters')
  let daily: DailyMissionState = recordDailyProgress(loadDailyMissionState(), 'daily-play-game', now, 1)
  if (opts.isFreePlay) daily = recordDailyProgress(daily, 'daily-free-play', now, 1)
  saveDailyMissionState(daily)
  scheduleSync('daily_missions')
  evaluateSyncAchievements()
}

/** hooks/use-pet-care.ts's choke point — call once per pet-care action press (performAction's 5 cases + answerTalk's 'talk'). */
export function trackCareInteraction(actionId: CareActionId, now: Date = new Date()): void {
  saveActivityCounters(recordCareInteractionCounter(loadActivityCounters(), actionId))
  scheduleSync('activity_counters')
  let daily: DailyMissionState = recordDailyProgress(loadDailyMissionState(), 'daily-interact-3', now, 1)
  if (actionId === 'feed' || actionId === 'shower' || actionId === 'play') {
    daily = recordDailyProgress(daily, 'daily-care-action', now, 1)
  }
  if (actionId === 'talk') {
    daily = recordDailyProgress(daily, 'daily-talk', now, 1)
  }
  saveDailyMissionState(daily)
  scheduleSync('daily_missions')
  evaluateSyncAchievements()
}

/** my-page-screen.tsx's share-link-copy choke point. */
export function trackShare(): void {
  saveActivityCounters(recordShareCounter(loadActivityCounters()))
  scheduleSync('activity_counters')
  evaluateSyncAchievements()
}

/** theme-screen.tsx's "방 저장" choke point. */
export function trackRoomDecorSaved(): void {
  saveActivityCounters(recordRoomDecorSavedCounter(loadActivityCounters()))
  scheduleSync('activity_counters')
  evaluateSyncAchievements()
}

/** statling-screen.tsx's "꾸미기 저장" choke point. */
export function trackStatlingDecorSaved(): void {
  saveActivityCounters(recordStatlingDecorSavedCounter(loadActivityCounters()))
  scheduleSync('activity_counters')
  evaluateSyncAchievements()
}

export interface ClaimResult {
  claimed: boolean
}

/** MissionScreen's 일일 미션 "받기" button — grants rewardXp exactly once per mission per day. */
export function claimDailyMissionReward(missionId: string, target: number, rewardXp: number, now: Date = new Date()): ClaimResult {
  const state = loadDailyMissionState()
  const result = claimDailyMission(state, missionId, target, now)
  saveDailyMissionState(result.state)
  if (result.claimed) {
    saveXpState(addXp(loadXpState(), rewardXp))
    // Phase 2D-4 — same XP-trigger gap claimAchievementReward had: xp_totals
    // has been continuous-sync (0-debounce) since Phase 2D-3, but nothing
    // here ever asked it to push this reward.
    scheduleSync('xp_totals')
    // A claim is a deliberate, important user action — flush any pending
    // daily_missions debounce window right now instead of waiting out its
    // usual 5s window, so `claimed_at`/progress reach the server promptly.
    flushSync('daily_missions')
  } else {
    // Not claimed doesn't mean "nothing changed" — result.state can still
    // differ from state via a stale-day rollover (see ensureToday in
    // daily-mission-storage.ts) — still a real write, just not urgent.
    scheduleSync('daily_missions')
  }
  return { claimed: result.claimed }
}
