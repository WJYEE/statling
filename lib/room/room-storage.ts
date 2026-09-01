import { ROOM_ASSETS } from '@/lib/room-assets'
import { clampWidth, clampItemPosition, getAnchorForCategory } from '@/lib/room/room-layout'
import { createDefaultRoomState, type RoomItem, type RoomState } from '@/lib/room/room-state'

const DEVICE_ID_KEY = 'statling.deviceId.v1'

/**
 * Stand-in for a real userId: this project has no login/auth system yet
 * (every other piece of state — see lib/pets/pet-storage.ts — is a single
 * unscoped localStorage key per device). A persistent anonymous id generated
 * once per device lets room storage already be keyed "per user"
 * (`statling:room:{deviceId}`) so swapping in a real userId later is a
 * one-line change in `roomStorageKey`, not a data-model change.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return 'device_fallback'
  }
}

function roomStorageKey(deviceId: string): string {
  return `statling:room:${deviceId}`
}

/** Minimal structural check — anything short of this is treated as corrupt (fresh default room), never thrown from. */
function isWellFormedRaw(value: Record<string, unknown>): value is Record<string, unknown> & { backgroundId: unknown; items: unknown } {
  return 'backgroundId' in value && 'items' in value && Array.isArray(value.items)
}

/**
 * Defensively rebuilds a valid RoomState from whatever was in storage:
 * unresolvable backgroundId falls back to the default background, items
 * referencing a since-removed assetId are dropped, and every numeric field
 * is clamped/filled with category-appropriate defaults. There's no real
 * legacy (pre-RoomState) room data in this app today, so this mainly guards
 * against future schema changes and hand-edited/corrupted localStorage.
 */
export function migrateRoomState(raw: unknown): RoomState {
  const fallback = createDefaultRoomState()
  if (!raw || typeof raw !== 'object') return fallback

  const value = raw as Record<string, unknown>
  if (!isWellFormedRaw(value)) return fallback

  const backgroundId =
    typeof value.backgroundId === 'string' && ROOM_ASSETS[value.backgroundId]?.category === 'background'
      ? value.backgroundId
      : fallback.backgroundId

  const items: RoomItem[] = (value.items as unknown[])
    .map((rawItem) => migrateRoomItem(rawItem))
    .filter((item): item is RoomItem => item !== null)

  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt

  return { version: 1, backgroundId, items, updatedAt }
}

function migrateRoomItem(rawItem: unknown): RoomItem | null {
  if (!rawItem || typeof rawItem !== 'object') return null
  const item = rawItem as Record<string, unknown>

  const assetId = typeof item.assetId === 'string' ? item.assetId : null
  const asset = assetId ? ROOM_ASSETS[assetId] : undefined
  if (!asset || asset.category === 'background') return null

  const instanceId = typeof item.instanceId === 'string' ? item.instanceId : `${assetId}_${Math.random().toString(36).slice(2, 8)}`
  const width = clampWidth(typeof item.width === 'number' ? item.width : 0.15)
  const height = width * (asset.naturalHeight / asset.naturalWidth)
  const rawX = typeof item.x === 'number' ? item.x : 0.5
  const rawY = typeof item.y === 'number' ? item.y : 0.5
  const { x, y } = clampItemPosition(getAnchorForCategory(asset), rawX, rawY, width, height)

  return {
    instanceId,
    assetId: asset.id,
    category: asset.category,
    x,
    y,
    width,
    height,
    zIndex: typeof item.zIndex === 'number' ? item.zIndex : 40,
    rotation: typeof item.rotation === 'number' ? item.rotation : 0,
    flipped: typeof item.flipped === 'boolean' ? item.flipped : false,
  }
}

export function loadSavedRoomState(): RoomState {
  if (typeof window === 'undefined') return createDefaultRoomState()
  try {
    const raw = window.localStorage.getItem(roomStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultRoomState()
    return migrateRoomState(JSON.parse(raw))
  } catch {
    return createDefaultRoomState()
  }
}

export function saveRoomState(state: RoomState): RoomState {
  const toSave: RoomState = { ...state, updatedAt: new Date().toISOString() }
  if (typeof window === 'undefined') return toSave
  window.localStorage.setItem(roomStorageKey(getOrCreateDeviceId()), JSON.stringify(toSave))
  return toSave
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's room layout (background + placed items); only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. Deliberately does NOT touch DEVICE_ID_KEY — the device identity itself must survive so every other device-scoped key stays addressable. */
export function clearSavedRoomState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(roomStorageKey(getOrCreateDeviceId()))
}
