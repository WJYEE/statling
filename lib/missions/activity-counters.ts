import type { CareActionId } from '@/lib/pet-care/types'

/**
 * Lifetime activity counters — the raw material both 업적 (achievements,
 * lib/missions/achievement-evaluator.ts) and a few 일일 미션 triggers
 * (lib/missions/daily-missions.config.ts) read from. Deliberately separate
 * from lib/game/player-skill-storage.ts (best-score-per-tier, not a play
 * COUNT) and from lib/pet-care/pet-care-storage.ts (current stat/mood
 * values, not cumulative interaction counts) — this file only ever adds,
 * never overwrites, so it stays a pure lifetime ledger.
 */
export interface ActivityCounters {
  version: 1
  totalGamesPlayed: number
  totalPersonalBests: number
  freePlayCompletions: number
  totalInteractions: number
  feedCount: number
  showerCount: number
  cleanCount: number
  playCount: number
  petCount: number
  talkCount: number
  shareCount: number
  roomDecorSaved: boolean
  statlingDecorSaved: boolean
  hasLoggedInEver: boolean
  updatedAt: string
}

const STORAGE_KEY = 'statling.activityCounters.v1'

export function createDefaultActivityCounters(): ActivityCounters {
  return {
    version: 1,
    totalGamesPlayed: 0,
    totalPersonalBests: 0,
    freePlayCompletions: 0,
    totalInteractions: 0,
    feedCount: 0,
    showerCount: 0,
    cleanCount: 0,
    playCount: 0,
    petCount: 0,
    talkCount: 0,
    shareCount: 0,
    roomDecorSaved: false,
    statlingDecorSaved: false,
    hasLoggedInEver: false,
    updatedAt: new Date(0).toISOString(),
  }
}

function isWellFormed(value: Record<string, unknown>): value is Record<string, unknown> & { version: number } {
  return typeof value.version === 'number'
}

export function loadActivityCounters(): ActivityCounters {
  if (typeof window === 'undefined') return createDefaultActivityCounters()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultActivityCounters()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultActivityCounters()
    // Merge onto the default so a field added in a later release (still v1,
    // additive-only) is never `undefined` for an existing saved record.
    return { ...createDefaultActivityCounters(), ...parsed, version: 1 }
  } catch {
    return createDefaultActivityCounters()
  }
}

export function saveActivityCounters(state: ActivityCounters): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function recordGamePlayed(
  state: ActivityCounters,
  opts: { isFreePlay: boolean; isPersonalBest: boolean },
): ActivityCounters {
  return {
    ...state,
    totalGamesPlayed: state.totalGamesPlayed + 1,
    totalPersonalBests: state.totalPersonalBests + (opts.isPersonalBest ? 1 : 0),
    freePlayCompletions: state.freePlayCompletions + (opts.isFreePlay ? 1 : 0),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * One pet-care action press (see hooks/use-pet-care.ts's ACTION_IDS +
 * answerTalk) — bumps that action's own counter, and (for every action
 * EXCEPT `clean`) the shared totalInteractions tally too. `clean` tidies the
 * Room, not a direct interaction with the Statling itself, so it's excluded
 * from totalInteractions (lib/missions/achievements.config.ts's
 * total-interactions family) — it still increments its own `cleanCount`.
 * Only affects future presses: a returning player's already-accumulated
 * totalInteractions is never migrated/decremented.
 */
export function recordCareInteraction(state: ActivityCounters, actionId: CareActionId): ActivityCounters {
  const updatedAt = new Date().toISOString()
  if (actionId === 'clean') {
    return { ...state, cleanCount: state.cleanCount + 1, updatedAt }
  }
  const next: ActivityCounters = { ...state, totalInteractions: state.totalInteractions + 1, updatedAt }
  switch (actionId) {
    case 'feed':
      return { ...next, feedCount: next.feedCount + 1 }
    case 'shower':
      return { ...next, showerCount: next.showerCount + 1 }
    case 'play':
      return { ...next, playCount: next.playCount + 1 }
    case 'pet':
      return { ...next, petCount: next.petCount + 1 }
    case 'talk':
      return { ...next, talkCount: next.talkCount + 1 }
  }
}

export function recordShare(state: ActivityCounters): ActivityCounters {
  return { ...state, shareCount: state.shareCount + 1, updatedAt: new Date().toISOString() }
}

/** Idempotent — only the FIRST save ever flips this, later saves are no-ops (see ThemeScreen's "방 꾸미기 첫 저장" achievement). */
export function recordRoomDecorSaved(state: ActivityCounters): ActivityCounters {
  if (state.roomDecorSaved) return state
  return { ...state, roomDecorSaved: true, updatedAt: new Date().toISOString() }
}

/** Idempotent — only the FIRST save ever flips this (see StatlingScreen's "Statling 꾸미기 첫 저장" achievement). */
export function recordStatlingDecorSaved(state: ActivityCounters): ActivityCounters {
  if (state.statlingDecorSaved) return state
  return { ...state, statlingDecorSaved: true, updatedAt: new Date().toISOString() }
}

/** Idempotent — only the FIRST successful auth login ever flips this (see "첫 로그인" achievement, distinct from "첫 출석"). */
export function recordFirstLogin(state: ActivityCounters): ActivityCounters {
  if (state.hasLoggedInEver) return state
  return { ...state, hasLoggedInEver: true, updatedAt: new Date().toISOString() }
}
