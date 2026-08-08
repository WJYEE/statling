import { localDateKey } from '@/lib/missions/attendance-storage'

/** Today's per-mission progress + claimed set — reset the moment `now` rolls into a new local date (see ensureToday). */
export interface DailyMissionState {
  version: 1
  dateKey: string
  /** missionId -> progress count accumulated today. */
  progress: Record<string, number>
  /** missionIds whose reward has already been collected today. */
  claimed: string[]
}

const STORAGE_KEY = 'statling.dailyMissions.v1'

export function createDefaultDailyMissionState(now: Date = new Date()): DailyMissionState {
  return { version: 1, dateKey: localDateKey(now), progress: {}, claimed: [] }
}

function isWellFormed(value: Record<string, unknown>): value is Record<string, unknown> & { dateKey: string } {
  return typeof value.dateKey === 'string'
}

export function loadDailyMissionState(): DailyMissionState {
  if (typeof window === 'undefined') return createDefaultDailyMissionState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultDailyMissionState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultDailyMissionState()
    return {
      version: 1,
      dateKey: parsed.dateKey,
      progress: parsed.progress && typeof parsed.progress === 'object' ? (parsed.progress as Record<string, number>) : {},
      claimed: Array.isArray(parsed.claimed) ? (parsed.claimed as unknown[]).filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return createDefaultDailyMissionState()
  }
}

export function saveDailyMissionState(state: DailyMissionState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** Resets progress/claimed to empty the moment `now`'s local date no longer matches the stored one — every mutator below runs this first so a stale day's leftovers never leak into today. */
export function ensureToday(state: DailyMissionState, now: Date): DailyMissionState {
  const today = localDateKey(now)
  if (state.dateKey === today) return state
  return createDefaultDailyMissionState(now)
}

export function recordDailyProgress(state: DailyMissionState, missionId: string, now: Date, amount = 1): DailyMissionState {
  const fresh = ensureToday(state, now)
  return { ...fresh, progress: { ...fresh.progress, [missionId]: (fresh.progress[missionId] ?? 0) + amount } }
}

export interface ClaimDailyMissionResult {
  state: DailyMissionState
  /** False when the mission isn't complete yet or was already claimed today — nothing changes in that case. */
  claimed: boolean
}

export function claimDailyMission(state: DailyMissionState, missionId: string, target: number, now: Date): ClaimDailyMissionResult {
  const fresh = ensureToday(state, now)
  const progress = fresh.progress[missionId] ?? 0
  if (progress < target || fresh.claimed.includes(missionId)) {
    return { state: fresh, claimed: false }
  }
  return { state: { ...fresh, claimed: [...fresh.claimed, missionId] }, claimed: true }
}
