/**
 * Generic "pick one line, avoid immediate repeats" helpers — shared by
 * lib/pet-care/initiated-dialogue.ts (ambient/entry lines) and
 * lib/pet-care/talk-questions.ts (대화 button questions). No dialogue
 * *content* lives here anymore — the old mood-keyed DIALOGUE_BANK/
 * pickDialogue this file used to also export was the 대화 button's entire
 * pre-choice-based implementation; it's gone now that 대화 opens a question
 * instead of just saying a random mood line (see talk-questions.ts and
 * hooks/use-pet-talk.ts).
 */

/** Anything pickFromPool can select from. */
export interface PickableLine {
  id: string
  minIntimacyLevel?: number
}

/**
 * 1) filter to lines this intimacyLevel unlocks, 2) drop ones just shown
 * (recentIds), 3) if that empties the pool, fall back to the level-filtered
 * pool alone (small categories shouldn't ever throw), 4) pick at random.
 */
export function pickFromPool<T extends PickableLine>(pool: T[], intimacyLevel: number, recentIds: string[]): T {
  const eligible = pool.filter((line) => (line.minIntimacyLevel ?? 1) <= intimacyLevel)
  const basePool = eligible.length > 0 ? eligible : pool
  const fresh = basePool.filter((line) => !recentIds.includes(line.id))
  const candidates = fresh.length > 0 ? fresh : basePool
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function pushRecentId(recentIds: string[], newId: string, maxSize: number): string[] {
  return [...recentIds, newId].slice(-maxSize)
}
