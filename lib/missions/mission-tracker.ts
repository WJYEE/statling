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
import { ACHIEVEMENT_FAMILIES, RANK_ACHIEVEMENT_METRICS, type AchievementMetricKey } from '@/lib/missions/achievements.config'
import { evaluateAchievementFamilies, type AchievementTierProgress } from '@/lib/missions/achievement-evaluator'
import { loadAchievementState, saveAchievementState } from '@/lib/missions/achievement-storage'

/**
 * Every tracked gameplay event's single entry point — the ONLY file
 * game-flow.tsx / hooks/use-pet-care.ts / theme-screen.tsx /
 * statling-screen.tsx / my-page-screen.tsx import from for mission/
 * achievement tracking. Each track* call updates the relevant lifetime
 * counter(s) (lib/missions/activity-counters.ts), bumps today's daily
 * mission progress where relevant (lib/missions/daily-mission-storage.ts),
 * then re-evaluates every SYNC achievement family (lib/missions/
 * achievements.config.ts) and unlocks+rewards+plays SFX for anything newly
 * completed. Rank-based achievement families (bestGameRank/overallRank) are
 * deliberately NOT checked here — see lib/missions/ranking-achievements.ts,
 * called only when the 업적 tab is actually opened, since they need an
 * async ranking-provider call this synchronous choke point can't await.
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
 * Diffs freshly-evaluated progress against what's already been unlocked,
 * grants each newly-completed tier's rewardXp, persists the updated
 * unlocked set, and plays the Achievement SFX exactly once for the whole
 * batch (audioManager.play already no-ops when SFX is off — see
 * lib/audio/audio-manager.ts — so no extra mute check is needed here).
 */
export function applyNewlyUnlockedAchievements(progressList: AchievementTierProgress[]): AchievementTierProgress[] {
  const state = loadAchievementState()
  const unlockedSet = new Set(state.unlockedTierIds)
  const newlyUnlocked = progressList.filter((p) => p.completed && !unlockedSet.has(p.tierId))
  if (newlyUnlocked.length === 0) return newlyUnlocked

  let xp = loadXpState()
  for (const p of newlyUnlocked) xp = addXp(xp, p.rewardXp)
  saveXpState(xp)

  saveAchievementState({
    version: 1,
    unlockedTierIds: [...state.unlockedTierIds, ...newlyUnlocked.map((p) => p.tierId)],
    updatedAt: new Date().toISOString(),
  })

  audioManager.play('achievement')
  return newlyUnlocked
}

/** Re-evaluates every sync achievement family against current storage and unlocks/rewards any newly-completed tier. Safe to call often — pure reads until something actually changed. */
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
  }
  evaluateSyncAchievements()
}

/** Auth choke point — call whenever useAuth()'s `user` becomes non-null. Idempotent (see recordFirstLogin). */
export function trackFirstLogin(): void {
  saveActivityCounters(recordFirstLoginCounter(loadActivityCounters()))
  evaluateSyncAchievements()
}

/** game-flow.tsx#recordSkillCompletion's choke point — call once per *valid* mini-game completion (Intro or Free Play). */
export function trackGamePlayed(opts: { isFreePlay: boolean; isPersonalBest: boolean }, now: Date = new Date()): void {
  saveActivityCounters(recordGamePlayedCounter(loadActivityCounters(), opts))
  let daily: DailyMissionState = recordDailyProgress(loadDailyMissionState(), 'daily-play-game', now, 1)
  if (opts.isFreePlay) daily = recordDailyProgress(daily, 'daily-free-play', now, 1)
  saveDailyMissionState(daily)
  evaluateSyncAchievements()
}

/** hooks/use-pet-care.ts's choke point — call once per pet-care action press (performAction's 5 cases + answerTalk's 'talk'). */
export function trackCareInteraction(actionId: CareActionId, now: Date = new Date()): void {
  saveActivityCounters(recordCareInteractionCounter(loadActivityCounters(), actionId))
  let daily: DailyMissionState = recordDailyProgress(loadDailyMissionState(), 'daily-interact-3', now, 1)
  if (actionId === 'feed' || actionId === 'shower' || actionId === 'play') {
    daily = recordDailyProgress(daily, 'daily-care-action', now, 1)
  }
  if (actionId === 'talk') {
    daily = recordDailyProgress(daily, 'daily-talk', now, 1)
  }
  saveDailyMissionState(daily)
  evaluateSyncAchievements()
}

/** my-page-screen.tsx's share-link-copy choke point. */
export function trackShare(): void {
  saveActivityCounters(recordShareCounter(loadActivityCounters()))
  evaluateSyncAchievements()
}

/** theme-screen.tsx's "방 저장" choke point. */
export function trackRoomDecorSaved(): void {
  saveActivityCounters(recordRoomDecorSavedCounter(loadActivityCounters()))
  evaluateSyncAchievements()
}

/** statling-screen.tsx's "꾸미기 저장" choke point. */
export function trackStatlingDecorSaved(): void {
  saveActivityCounters(recordStatlingDecorSavedCounter(loadActivityCounters()))
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
  if (result.claimed) saveXpState(addXp(loadXpState(), rewardXp))
  return { claimed: result.claimed }
}
