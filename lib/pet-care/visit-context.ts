import { PET_AUTONOMY_CONFIG } from '@/lib/config/pet-autonomy.config'
import type { PetMemory } from '@/lib/pet-care/pet-memory'

export type EntryEventType =
  | 'firstMeeting'
  | 'longAbsenceReturn'
  | 'todayFirstVisit'
  | 'pendingGameReaction'
  | 'regularRevisit'

/** Phase 3D-2 — sub-tier of a `longAbsenceReturn` event, see PET_AUTONOMY_CONFIG's mid/farAbsenceHours doc comment. Never set outside of `isLongAbsence` (null there) — this refines *how* long, not *whether*, so `computeEntryEvent`'s own `isLongAbsence` check and priority stay exactly as they were. */
export type AbsenceTier = 'short' | 'mid' | 'long'

export interface VisitContext {
  isFirstEverVisit: boolean
  isFirstVisitToday: boolean
  elapsedHoursSinceLastVisit: number
  isLongAbsence: boolean
  /** Non-null exactly when isLongAbsence is true. */
  absenceTier: AbsenceTier | null
  streak: number
}

function computeAbsenceTier(elapsedHours: number): AbsenceTier {
  if (elapsedHours >= PET_AUTONOMY_CONFIG.farAbsenceHours) return 'long'
  if (elapsedHours >= PET_AUTONOMY_CONFIG.midAbsenceHours) return 'mid'
  return 'short'
}

/**
 * Phase 3D-2 — whole calendar days between an ISO timestamp and `now`, in
 * the browser's local timezone (via toLocalDateKey's own date-part-only
 * construction, so "3일째" always lands on the actual 3rd local calendar
 * day regardless of what time of day the pet was first met). Used for both
 * "함께한 기간" milestones and the Stage 4 daysTogether gate — never a new
 * stored field, always derived from `firstMetAt` on read.
 */
export function daysSince(isoDate: string, now: Date): number {
  const then = new Date(isoDate)
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startOfNow.getTime() - startOfThen.getTime()) / (24 * 60 * 60 * 1000))
}

/** "함께한 기간" milestones this Phase supports — exact-day-only (see getMilestoneDay's own doc comment for why that's the anti-repeat strategy, not a stored flag). */
export const MILESTONE_DAYS = [3, 7, 30] as const
export type MilestoneDay = (typeof MILESTONE_DAYS)[number]

/**
 * Phase 3D-2 — returns the milestone reached TODAY (and only today), or
 * null. Deliberately an exact match (`daysTogether === day`), never `>=`:
 * that's what lets this run with zero new persistent state — a milestone
 * can only ever be a candidate on the one calendar day it's exactly true,
 * and the entry-greeting effect that calls this is already gated to at
 * most once per day via `lastWelcomeDialogueAt` (see
 * hooks/use-pet-initiated-dialogue.ts), so "already shown today" can never
 * happen without a dedicated flag. A day where no exact milestone matches
 * (the overwhelming majority of days) returns null and the caller falls
 * back to its normal entry greeting.
 */
export function getMilestoneDay(daysTogether: number): MilestoneDay | null {
  return (MILESTONE_DAYS as readonly number[]).includes(daysTogether) ? (daysTogether as MilestoneDay) : null
}

/** YYYY-MM-DD in the browser's local timezone — never UTC, so "today" matches what the player actually sees. */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function computeVisitContext(memory: PetMemory, now: Date): VisitContext {
  const isFirstEverVisit = memory.totalVisits === 0
  const lastVisit = new Date(memory.lastVisitedAt)
  const elapsedHoursSinceLastVisit = isFirstEverVisit
    ? 0
    : Math.max(0, (now.getTime() - lastVisit.getTime()) / (60 * 60 * 1000))
  const todayKey = toLocalDateKey(now)

  return {
    isFirstEverVisit,
    isFirstVisitToday: memory.lastVisitDate !== todayKey,
    elapsedHoursSinceLastVisit,
    isLongAbsence: !isFirstEverVisit && elapsedHoursSinceLastVisit >= PET_AUTONOMY_CONFIG.longAbsenceHours,
    absenceTier:
      !isFirstEverVisit && elapsedHoursSinceLastVisit >= PET_AUTONOMY_CONFIG.longAbsenceHours
        ? computeAbsenceTier(elapsedHoursSinceLastVisit)
        : null,
    streak: memory.consecutiveVisitDays,
  }
}

/**
 * Priority per spec: first meeting > long-absence return > today's first
 * visit > a waiting minigame reaction > a plain revisit. A pending game
 * reaction never preempts the first two (a returning-after-days pet still
 * greets first) but does preempt a plain "today's first visit" greeting —
 * the two never show at once.
 */
export function computeEntryEvent(visit: VisitContext, hasPendingGameReaction: boolean): EntryEventType {
  if (visit.isFirstEverVisit) return 'firstMeeting'
  if (visit.isLongAbsence) return 'longAbsenceReturn'
  if (visit.isFirstVisitToday) return 'todayFirstVisit'
  if (hasPendingGameReaction) return 'pendingGameReaction'
  return 'regularRevisit'
}

/**
 * Advances visit bookkeeping for "entering the Room now" — called once per
 * mount by hooks/use-pet-memory.ts. Same-day re-entry only bumps
 * `totalVisits`; a next-calendar-day entry bumps the streak; any gap of
 * more than one calendar day resets the streak to 1.
 */
export function updateVisitMemory(memory: PetMemory, now: Date): PetMemory {
  const todayKey = toLocalDateKey(now)

  if (memory.totalVisits === 0) {
    return {
      ...memory,
      firstMetAt: now.toISOString(),
      lastVisitedAt: now.toISOString(),
      lastVisitDate: todayKey,
      totalVisits: 1,
      consecutiveVisitDays: 1,
      longestVisitStreak: 1,
    }
  }

  if (memory.lastVisitDate === todayKey) {
    return { ...memory, lastVisitedAt: now.toISOString(), totalVisits: memory.totalVisits + 1 }
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isConsecutiveDay = memory.lastVisitDate === toLocalDateKey(yesterday)
  const nextStreak = isConsecutiveDay ? memory.consecutiveVisitDays + 1 : 1

  return {
    ...memory,
    lastVisitedAt: now.toISOString(),
    lastVisitDate: todayKey,
    totalVisits: memory.totalVisits + 1,
    consecutiveVisitDays: nextStreak,
    longestVisitStreak: Math.max(memory.longestVisitStreak, nextStreak),
  }
}
