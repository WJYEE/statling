import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { ROOM_CLEANLINESS_FLOOR, STAT_MAX } from '@/lib/config/pet-care.config'
import type { RoomCareState } from '@/lib/pet-care/types'

function roomCareStorageKey(deviceId: string): string {
  return `statling:roomCare:${deviceId}`
}

export function createDefaultRoomCareState(): RoomCareState {
  return { cleanliness: 81, lastCleanedAt: new Date().toISOString() }
}

function isWellFormed(value: Record<string, unknown>): boolean {
  return typeof value.cleanliness === 'number' && typeof value.lastCleanedAt === 'string'
}

function sanitize(state: RoomCareState): RoomCareState {
  return {
    cleanliness: Math.min(STAT_MAX, Math.max(ROOM_CLEANLINESS_FLOOR, Math.round(state.cleanliness))),
    lastCleanedAt: state.lastCleanedAt,
  }
}

export function loadRoomCareState(): RoomCareState {
  if (typeof window === 'undefined') return createDefaultRoomCareState()
  try {
    const raw = window.localStorage.getItem(roomCareStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultRoomCareState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultRoomCareState()
    return sanitize(parsed as unknown as RoomCareState)
  } catch {
    return createDefaultRoomCareState()
  }
}

export function saveRoomCareState(state: RoomCareState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(roomCareStorageKey(getOrCreateDeviceId()), JSON.stringify(state))
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's room cleanliness state; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearRoomCareState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(roomCareStorageKey(getOrCreateDeviceId()))
}
