import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { MAX_USER_NOTES } from '@/lib/config/talk.config'

/**
 * What the player typed for the one free-text 대화 question ("나에게 하고
 * 싶은 말 해줘!") — see lib/pet-care/talk-questions.ts. Kept as its own
 * small store (not folded into PetCareState) since it's pure flavor content
 * the Statling occasionally echoes back (hooks/use-pet-initiated-dialogue.ts),
 * never something Pet Care's stats/cooldown pipeline needs to read.
 */
export interface UserNote {
  id: string
  text: string
  createdAt: string
}

function userNotesStorageKey(deviceId: string): string {
  return `statling:userNotes:${deviceId}`
}

function isWellFormed(value: unknown): value is UserNote[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).id === 'string' &&
        typeof (entry as Record<string, unknown>).text === 'string' &&
        typeof (entry as Record<string, unknown>).createdAt === 'string',
    )
  )
}

export function loadUserNotes(): UserNote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(userNotesStorageKey(getOrCreateDeviceId()))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return isWellFormed(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveUserNotes(notes: UserNote[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(userNotesStorageKey(getOrCreateDeviceId()), JSON.stringify(notes))
}

/** Appends one note (oldest dropped past MAX_USER_NOTES) and persists — returns the updated list so the caller never needs a separate reload. */
export function saveUserNote(text: string, now: Date = new Date()): UserNote[] {
  const trimmed = text.trim()
  if (!trimmed) return loadUserNotes()
  const note: UserNote = { id: `note_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`, text: trimmed, createdAt: now.toISOString() }
  const next = [...loadUserNotes(), note].slice(-MAX_USER_NOTES)
  saveUserNotes(next)
  return next
}
