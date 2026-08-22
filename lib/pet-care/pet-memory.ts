import {
  CARE_MEMORY_MIN_ACTION_COUNT,
  CARE_MEMORY_MIN_ACTION_RATIO,
  GAME_NAME_MEMORY_MIN_COUNT,
  GAME_NAME_MEMORY_MIN_RATIO,
  GROWTH_CALLBACK_MIN_DAYS_TOGETHER,
  MEMORY_COMMENT_MIN_STAT_COUNT,
  MEMORY_COMMENT_MIN_STAT_RATIO,
  RECENT_CARE_ACTION_HISTORY_SIZE,
  RECENT_GAME_HISTORY_SIZE,
  RECENT_INITIATED_DIALOGUE_HISTORY_SIZE,
} from '@/lib/config/pet-care.config'
import { PENDING_GAME_REACTION_MAX_AGE_MS } from '@/lib/config/game-reactions.config'
import { LOVE_CONSISTENT_PLAY_COUNT_THRESHOLD } from '@/lib/config/character-state.config'
import { normalizedScoreFor } from '@/lib/pet-care/game-reactions'
import { pushRecentId } from '@/lib/pet-care/dialogue'
import { daysSince, toLocalDateKey } from '@/lib/pet-care/visit-context'
import type { CareActionId, PendingGameReaction } from '@/lib/pet-care/types'
import type { StatId } from '@/lib/brain-bet'
import type { GameResult } from '@/lib/game/types'

export interface PetMemory {
  version: 1
  firstMetAt: string
  lastVisitedAt: string
  totalVisits: number
  consecutiveVisitDays: number
  longestVisitStreak: number
  lastVisitDate?: string

  careActionCounts: Record<CareActionId, number>
  favoriteCareAction?: CareActionId

  recentCareActions: CareActionId[]
  /** Ambient/entry-greeting line ids only — the 대화 button's own question history (hooks/use-pet-talk.ts) is tracked separately, in-memory. */
  recentInitiatedDialogueIds: string[]

  recentGameIds: string[]
  recentGameStats: StatId[]
  mostPlayedStat?: StatId
  gamePlayCountsByStat: Partial<Record<StatId, number>>

  lastAutonomousActionAt?: string
  lastInitiatedDialogueAt?: string
  lastStateRequestDialogueAt?: string
  lastWelcomeDialogueAt?: string
  lastGameReactionAt?: string
  lastMemoryCommentDate?: string

  autonomyBonusToday: { date: string; energyGained: number; happinessGained: number }

  pendingGameReaction: PendingGameReaction | null
}

const EMPTY_CARE_ACTION_COUNTS: Record<CareActionId, number> = {
  feed: 0,
  shower: 0,
  clean: 0,
  play: 0,
  pet: 0,
  talk: 0,
}

export function createInitialPetMemory(now: Date): PetMemory {
  return {
    version: 1,
    firstMetAt: now.toISOString(),
    lastVisitedAt: now.toISOString(),
    totalVisits: 0,
    consecutiveVisitDays: 0,
    longestVisitStreak: 0,
    careActionCounts: { ...EMPTY_CARE_ACTION_COUNTS },
    recentCareActions: [],
    recentInitiatedDialogueIds: [],
    recentGameIds: [],
    recentGameStats: [],
    gamePlayCountsByStat: {},
    autonomyBonusToday: { date: toLocalDateKey(now), energyGained: 0, happinessGained: 0 },
    pendingGameReaction: null,
  }
}

function mostFrequentEntry<T extends string>(counts: Partial<Record<T, number>>): T | undefined {
  let best: T | undefined
  let bestCount = 0
  for (const key of Object.keys(counts) as T[]) {
    const count = counts[key] ?? 0
    if (count > bestCount) {
      best = key
      bestCount = count
    }
  }
  return best
}

export function recordCareAction(memory: PetMemory, action: CareActionId, now: Date): PetMemory {
  const careActionCounts = { ...memory.careActionCounts, [action]: memory.careActionCounts[action] + 1 }
  return {
    ...memory,
    careActionCounts,
    favoriteCareAction: mostFrequentEntry(careActionCounts),
    recentCareActions: pushRecentId(memory.recentCareActions, action, RECENT_CARE_ACTION_HISTORY_SIZE) as CareActionId[],
    lastVisitedAt: now.toISOString(),
  }
}

/**
 * Writes the just-finished minigame's result as a `pendingGameReaction` for
 * the Room screen to pick up next time it mounts, and folds it into the
 * recent-play history used by `mostPlayedStat`/`shouldShowMemoryComment`.
 * Called from game-flow.tsx's on*Complete handlers for every valid attempt —
 * unconditionally overwrites any previous pending reaction (only the latest
 * completion is ever shown, by design: a single-slot "waiting reaction",
 * not a queue).
 */
export function recordGameCompletion(memory: PetMemory, result: GameResult, now: Date): PetMemory {
  const { normalizedScore, accuracy } = normalizedScoreFor(result)
  const gameId = result.variant ?? result.gameId

  const gamePlayCountsByStat = {
    ...memory.gamePlayCountsByStat,
    [result.gameId]: (memory.gamePlayCountsByStat[result.gameId] ?? 0) + 1,
  }

  return {
    ...memory,
    pendingGameReaction: {
      gameId,
      stat: result.gameId,
      normalizedScore,
      accuracy,
      isPersonalBest: result.isPersonalBest,
      completedAt: now.toISOString(),
    },
    recentGameIds: pushRecentId(memory.recentGameIds, gameId, RECENT_GAME_HISTORY_SIZE),
    recentGameStats: pushRecentId(memory.recentGameStats, result.gameId, RECENT_GAME_HISTORY_SIZE) as StatId[],
    gamePlayCountsByStat,
    mostPlayedStat: mostFrequentEntry(gamePlayCountsByStat),
  }
}

/** "미니게임을 일정 수준 이상 꾸준히 플레이했을 때" (the 'love' art's second trigger — see character-state.config.ts) — total completions logged across every stat, so no single game needs to be replayed a lot on its own. */
export function isConsistentPlayer(memory: PetMemory): boolean {
  const totalPlays = Object.values(memory.gamePlayCountsByStat).reduce((sum: number, count) => sum + (count ?? 0), 0)
  return totalPlays >= LOVE_CONSISTENT_PLAY_COUNT_THRESHOLD
}

/** A pendingGameReaction sitting unconsumed for over 24h reads as stale — discard it rather than surprise the player with an old result. */
export function discardStalePendingGameReaction(memory: PetMemory, now: Date): PetMemory {
  if (!memory.pendingGameReaction) return memory
  const age = now.getTime() - new Date(memory.pendingGameReaction.completedAt).getTime()
  return age > PENDING_GAME_REACTION_MAX_AGE_MS ? { ...memory, pendingGameReaction: null } : memory
}

export function consumePendingGameReaction(memory: PetMemory, now: Date): PetMemory {
  return { ...memory, pendingGameReaction: null, lastGameReactionAt: now.toISOString() }
}

export function recordInitiatedDialogue(
  memory: PetMemory,
  id: string,
  kind: 'general' | 'stateRequest' | 'welcome',
  now: Date,
): PetMemory {
  const nowIso = now.toISOString()
  return {
    ...memory,
    recentInitiatedDialogueIds: pushRecentId(memory.recentInitiatedDialogueIds, id, RECENT_INITIATED_DIALOGUE_HISTORY_SIZE),
    lastInitiatedDialogueAt: kind === 'general' ? nowIso : memory.lastInitiatedDialogueAt,
    lastStateRequestDialogueAt: kind === 'stateRequest' ? nowIso : memory.lastStateRequestDialogueAt,
    lastWelcomeDialogueAt: kind === 'welcome' ? nowIso : memory.lastWelcomeDialogueAt,
  }
}

export function recordMemoryCommentShown(memory: PetMemory, now: Date): PetMemory {
  return { ...memory, lastMemoryCommentDate: toLocalDateKey(now) }
}

/**
 * "최근 게임 기억 대사" gate (spec §12): the same stat must show up at least
 * MEMORY_COMMENT_MIN_STAT_COUNT times among the recent games AND make up at
 * least MEMORY_COMMENT_MIN_STAT_RATIO of them, and the comment hasn't
 * already been shown today. Returns the stat to comment on, or null.
 */
export function shouldShowMemoryComment(memory: PetMemory, now: Date): StatId | null {
  if (memory.lastMemoryCommentDate === toLocalDateKey(now)) return null
  if (memory.recentGameStats.length === 0) return null

  const stat = memory.mostPlayedStat
  if (!stat) return null

  const count = memory.recentGameStats.filter((s) => s === stat).length
  const ratio = count / memory.recentGameStats.length
  return count >= MEMORY_COMMENT_MIN_STAT_COUNT && ratio >= MEMORY_COMMENT_MIN_STAT_RATIO ? stat : null
}

/**
 * Phase 3D-3 — "care memory" gate (spec §2-3, §12): the player's single most
 * frequent recent care action must show up at least CARE_MEMORY_MIN_ACTION_COUNT
 * times among `recentCareActions` AND make up at least CARE_MEMORY_MIN_ACTION_RATIO
 * of them — same shape as shouldShowMemoryComment, just over care actions
 * instead of game stats — and shares `lastMemoryCommentDate` with
 * shouldShowMemoryComment/shouldShowGameNameMemory/shouldShowGrowthCallback so
 * all four "behavioral/growth memory" callbacks pull from ONE combined daily
 * budget (spec §12's own "game memory가 한 번 나왔다면 care memory는 다음 날
 * 후보" example). Returns the action to comment on, or null.
 */
export function shouldShowCareMemory(memory: PetMemory, now: Date): CareActionId | null {
  if (memory.lastMemoryCommentDate === toLocalDateKey(now)) return null
  if (memory.recentCareActions.length === 0) return null

  const action = memory.favoriteCareAction
  if (!action) return null

  const count = memory.recentCareActions.filter((a) => a === action).length
  const ratio = count / memory.recentCareActions.length
  return count >= CARE_MEMORY_MIN_ACTION_COUNT && ratio >= CARE_MEMORY_MIN_ACTION_RATIO ? action : null
}

/**
 * Phase 3D-3 — "자주 플레이한 특정 게임" gate (spec §4A), over `recentGameIds`
 * (the actual game/variant id, e.g. "memory-classic" — distinct from
 * `recentGameStats`'s stat-level tracking that shouldShowMemoryComment already
 * uses). Same count/ratio shape and the same shared `lastMemoryCommentDate`
 * daily budget as shouldShowCareMemory above. Returns the game id to comment
 * on (still internal — the caller maps it to a display name), or null.
 */
export function shouldShowGameNameMemory(memory: PetMemory, now: Date): string | null {
  if (memory.lastMemoryCommentDate === toLocalDateKey(now)) return null
  if (memory.recentGameIds.length === 0) return null

  const counts: Record<string, number> = {}
  for (const id of memory.recentGameIds) counts[id] = (counts[id] ?? 0) + 1
  const gameId = mostFrequentEntry(counts)
  if (!gameId) return null

  const count = counts[gameId]
  const ratio = count / memory.recentGameIds.length
  return count >= GAME_NAME_MEMORY_MIN_COUNT && ratio >= GAME_NAME_MEMORY_MIN_RATIO ? gameId : null
}

/**
 * Phase 3D-2 — "growthCallback" gate (spec: "하루 최대 1회, 새 저장 필드
 * 없이"). Deliberately reuses `lastMemoryCommentDate` — the exact same date
 * gate `shouldShowMemoryComment` already uses — so the two share ONE
 * combined daily budget (at most one memory-style ambient comment per day,
 * whichever of the two the ambient loop tries first and finds eligible; see
 * hooks/use-pet-initiated-dialogue.ts) instead of adding a second stored
 * field just to track a second, independent "shown today" flag. Only
 * requires `daysSince(firstMetAt) >= GROWTH_CALLBACK_MIN_DAYS_TOGETHER` so
 * it never fires for a pet met earlier today — no other condition, and no
 * concrete day-count is ever put in the dialogue text itself (the bank's
 * lines are all qualitative, see initiated-dialogue.ts's growthCallback
 * pool doc comment).
 */
export function shouldShowGrowthCallback(memory: PetMemory, now: Date): boolean {
  if (memory.lastMemoryCommentDate === toLocalDateKey(now)) return false
  return daysSince(memory.firstMetAt, now) >= GROWTH_CALLBACK_MIN_DAYS_TOGETHER
}

export function resetAutonomyBonusIfNewDay(memory: PetMemory, now: Date): PetMemory {
  const todayKey = toLocalDateKey(now)
  return memory.autonomyBonusToday.date === todayKey
    ? memory
    : { ...memory, autonomyBonusToday: { date: todayKey, energyGained: 0, happinessGained: 0 } }
}
