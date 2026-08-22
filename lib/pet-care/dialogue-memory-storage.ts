import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { pushRecentId } from '@/lib/pet-care/dialogue'

/**
 * Structured, low-stakes "취향" facts worth remembering across visits — never
 * free text, never anything sensitive. Each key maps to a small fixed value
 * set defined by the TalkChoice that writes it (see talk-questions.ts) so
 * lib/pet-care/initiated-dialogue.ts#pickMemoryReferenceLine can build a
 * natural reference sentence without any generic-grammar guessing.
 */
export type DialogueMemoryKey =
  | 'favoriteSeason'
  | 'favoritePlaceType'
  | 'preferredTime'
  | 'likesRain'
  | 'preferredFoodType'
  | 'restStyle'
  | 'travelPreference'
  | 'studyType'
  // Phase 3D-3 — answer-memory coverage expansion (spec §6-7): only clearly
  // "취향/선호" style fixed-choice answers, same as the 8 keys above.
  | 'preferredWeather'
  | 'activityPreference'
  | 'foodForeverChoice'

export interface DialogueMemory {
  version: 1
  answers: Partial<Record<DialogueMemoryKey, string>>
  /**
   * Persisted sliding window of recently-opened ROOT 대화 question ids (see
   * RECENT_QUESTION_HISTORY_SIZE) — survives refresh/reconnect, unlike the
   * old session-only useRef, without ever permanently banning a question
   * (pickRandomQuestion falls back to the full pool once every candidate is
   * in this window).
   */
  answeredQuestionIds: string[]
}

function dialogueMemoryStorageKey(deviceId: string): string {
  return `statling:dialogueMemory:${deviceId}`
}

export function createDefaultDialogueMemory(): DialogueMemory {
  return { version: 1, answers: {}, answeredQuestionIds: [] }
}

function isWellFormed(value: Record<string, unknown>): boolean {
  return typeof value.answers === 'object' && value.answers !== null && Array.isArray(value.answeredQuestionIds)
}

export function loadDialogueMemory(): DialogueMemory {
  if (typeof window === 'undefined') return createDefaultDialogueMemory()
  try {
    const raw = window.localStorage.getItem(dialogueMemoryStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultDialogueMemory()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || !isWellFormed(parsed)) return createDefaultDialogueMemory()
    return {
      version: 1,
      answers: parsed.answers as Partial<Record<DialogueMemoryKey, string>>,
      answeredQuestionIds: (parsed.answeredQuestionIds as unknown[]).filter((id): id is string => typeof id === 'string'),
    }
  } catch {
    return createDefaultDialogueMemory()
  }
}

export function saveDialogueMemory(memory: DialogueMemory): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(dialogueMemoryStorageKey(getOrCreateDeviceId()), JSON.stringify(memory))
}

/** Writes one structured answer and persists immediately — called the instant a memory-worthy TalkChoice is picked (see hooks/use-pet-talk.ts#chooseAnswer). */
export function recordDialogueAnswer(key: DialogueMemoryKey, value: string): DialogueMemory {
  const current = loadDialogueMemory()
  const next: DialogueMemory = { ...current, answers: { ...current.answers, [key]: value } }
  saveDialogueMemory(next)
  return next
}

/** Pushes a root question id onto the persisted recent-question window and persists immediately — returns the updated window so the caller never needs a separate reload. */
export function recordAnsweredQuestionId(id: string, maxSize: number): string[] {
  const current = loadDialogueMemory()
  const answeredQuestionIds = pushRecentId(current.answeredQuestionIds, id, maxSize)
  saveDialogueMemory({ ...current, answeredQuestionIds })
  return answeredQuestionIds
}

/** Wipes this device's dialogue memory (structured answers + recent-question window) — see resetAllPetData in game-flow.tsx. */
export function clearDialogueMemory(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(dialogueMemoryStorageKey(getOrCreateDeviceId()))
}
