import {
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
import { toLocalDateKey } from '@/lib/pet-care/visit-context'
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

export function resetAutonomyBonusIfNewDay(memory: PetMemory, now: Date): PetMemory {
  const todayKey = toLocalDateKey(now)
  return memory.autonomyBonusToday.date === todayKey
    ? memory
    : { ...memory, autonomyBonusToday: { date: todayKey, energyGained: 0, happinessGained: 0 } }
}
