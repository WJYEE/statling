import { getOrCreateDeviceId } from '@/lib/room/room-storage'

/**
 * Which `achievement`-locked Room Decoration ids (lib/room-assets.ts's
 * `ROOM_ASSETS`) this device has actually been granted — separate from
 * lib/room/room-storage.ts (WHERE a Room asset is placed): this is only
 * WHETHER the player owns it at all. `default`-type Room assets are never
 * listed here — they're always usable, see `isRoomAssetUnlocked`. Mirrors
 * lib/deco-inventory-storage.ts exactly (same per-device-id key convention,
 * same shape) — Statling Decoration and Room Decoration rewards are kept as
 * two separate inventories since they're granted by two different systems
 * (a Level Gift claim vs. an Achievement unlock).
 *
 * localStorage today; swapping the load/save bodies below for Supabase
 * calls is the entire migration surface for this file.
 */
export interface RoomInventoryState {
  version: 1
  /** RoomAsset.id's actually granted via an unlocked Achievement's Room reward — append-only, never removed. */
  unlockedIds: string[]
  updatedAt: string
}

function roomInventoryStorageKey(deviceId: string): string {
  return `statling:roomInventory:${deviceId}`
}

export function createDefaultRoomInventoryState(): RoomInventoryState {
  return { version: 1, unlockedIds: [], updatedAt: new Date(0).toISOString() }
}

function isWellFormed(value: Record<string, unknown>): value is Record<string, unknown> & { unlockedIds: unknown } {
  return Array.isArray(value.unlockedIds)
}

export function loadRoomInventoryState(): RoomInventoryState {
  if (typeof window === 'undefined') return createDefaultRoomInventoryState()
  try {
    const raw = window.localStorage.getItem(roomInventoryStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultRoomInventoryState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultRoomInventoryState()
    return {
      version: 1,
      unlockedIds: (parsed.unlockedIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return createDefaultRoomInventoryState()
  }
}

export function saveRoomInventoryState(state: RoomInventoryState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(roomInventoryStorageKey(getOrCreateDeviceId()), JSON.stringify(state))
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's Room Decoration unlocks; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearRoomInventoryState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(roomInventoryStorageKey(getOrCreateDeviceId()))
}

/** Adds `roomAssetId` to the inventory (idempotent — granting the same reward twice, e.g. a re-evaluation race or the reconciliation pass in mission-tracker.ts, never duplicates it). Returns a new state; caller is responsible for persisting it. */
export function grantRoomReward(state: RoomInventoryState, roomAssetId: string): RoomInventoryState {
  if (state.unlockedIds.includes(roomAssetId)) return state
  return { ...state, unlockedIds: [...state.unlockedIds, roomAssetId], updatedAt: new Date().toISOString() }
}
