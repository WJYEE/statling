/**
 * Attendance/streak ledger — local-CALENDAR-DATE based (not xp-ledger.ts's
 * UTC Monday-anchored week key), because "출석"/streak is inherently a
 * per-device "did you open the app today" concept where the player's own
 * clock is what "오늘"/"어제" should mean, unlike XP's week reset which
 * intentionally avoids timezone quirks for a shared reset point.
 */
export interface AttendanceState {
  version: 1
  /** Cumulative distinct days ever visited — what "누적 7일/30일 접속" checks. */
  totalDays: number
  /** Consecutive days ending at lastVisitDate. */
  currentStreak: number
  /** Highest currentStreak ever reached — what "연속 3일/7일 접속" checks, so a later broken streak never revokes an already-earned achievement. */
  longestStreak: number
  /** Local 'YYYY-MM-DD' of the most recent recorded visit, or null before the first one. */
  lastVisitDate: string | null
}

const STORAGE_KEY = 'statling.attendance.v1'

/** Local calendar date key (device timezone) — deliberately NOT toISOString().slice(0,10), which would use UTC and could roll over at the wrong local moment. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function createDefaultAttendanceState(): AttendanceState {
  return { version: 1, totalDays: 0, currentStreak: 0, longestStreak: 0, lastVisitDate: null }
}

export function loadAttendanceState(): AttendanceState {
  if (typeof window === 'undefined') return createDefaultAttendanceState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultAttendanceState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed.totalDays !== 'number') return createDefaultAttendanceState()
    return {
      version: 1,
      totalDays: parsed.totalDays,
      currentStreak: typeof parsed.currentStreak === 'number' ? parsed.currentStreak : 0,
      longestStreak: typeof parsed.longestStreak === 'number' ? parsed.longestStreak : 0,
      lastVisitDate: typeof parsed.lastVisitDate === 'string' ? parsed.lastVisitDate : null,
    }
  } catch {
    return createDefaultAttendanceState()
  }
}

export function saveAttendanceState(state: AttendanceState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * Pure reducer: no-ops (returns the identical reference) when today's visit
 * was already recorded, so callers can tell "already recorded" apart from
 * "just recorded" via reference equality — see
 * lib/missions/mission-tracker.ts#trackDailyVisit, which only bumps the
 * daily-mission progress bar on an actual change.
 */
export function recordDailyVisit(state: AttendanceState, now: Date): AttendanceState {
  const today = localDateKey(now)
  if (state.lastVisitDate === today) return state

  const yesterday = localDateKey(new Date(now.getTime() - 86_400_000))
  const currentStreak = state.lastVisitDate === yesterday ? state.currentStreak + 1 : 1

  return {
    version: 1,
    totalDays: state.totalDays + 1,
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastVisitDate: today,
  }
}
