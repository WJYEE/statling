import { getOrCreateDeviceId } from '@/lib/room/room-storage'

/**
 * Which `level_gift` Statling Decoration ids (lib/deco-supported-assets.ts's
 * `SUPPORTED_DECO_ASSETS`) this device has actually claimed — separate from
 * lib/deco-placement-storage.ts (WHERE a deco is placed on the character):
 * this is only WHETHER the player owns it at all. `default`-type decos are
 * never listed here — they're always usable, see `isDecoUnlocked`.
 *
 * Same per-device-id key convention as lib/room/room-storage.ts /
 * lib/deco-placement-storage.ts (see those files' doc comments) — a real
 * userId later is a one-line change here, not a data-model change.
 * localStorage today; swapping the load/save bodies below for Supabase calls
 * is the entire migration surface for this file.
 */
export interface DecoInventoryState {
  version: 1
  /** SupportedDecoAsset.id's actually granted via a claimed level-gift — append-only, never removed. */
  unlockedIds: string[]
  updatedAt: string
}

function decoInventoryStorageKey(deviceId: string): string {
  return `statling:decoInventory:${deviceId}`
}

export function createDefaultDecoInventoryState(): DecoInventoryState {
  return { version: 1, unlockedIds: [], updatedAt: new Date(0).toISOString() }
}

function isWellFormed(value: Record<string, unknown>): value is Record<string, unknown> & { unlockedIds: unknown } {
  return Array.isArray(value.unlockedIds)
}

export function loadDecoInventoryState(): DecoInventoryState {
  if (typeof window === 'undefined') return createDefaultDecoInventoryState()
  try {
    const raw = window.localStorage.getItem(decoInventoryStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultDecoInventoryState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultDecoInventoryState()
    return {
      version: 1,
      unlockedIds: (parsed.unlockedIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return createDefaultDecoInventoryState()
  }
}

export function saveDecoInventoryState(state: DecoInventoryState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(decoInventoryStorageKey(getOrCreateDeviceId()), JSON.stringify(state))
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's Statling Decoration unlocks; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearDecoInventoryState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(decoInventoryStorageKey(getOrCreateDeviceId()))
}

/** Adds `decoId` to the inventory (idempotent — claiming the same gift twice, e.g. a double-tap race, never duplicates it). Returns a new state; caller is responsible for persisting it. */
export function grantDecoReward(state: DecoInventoryState, decoId: string): DecoInventoryState {
  if (state.unlockedIds.includes(decoId)) return state
  return { ...state, unlockedIds: [...state.unlockedIds, decoId], updatedAt: new Date().toISOString() }
}
