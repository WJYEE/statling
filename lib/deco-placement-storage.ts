import { DEFAULT_CHARACTER_ANCHORS } from '@/lib/character-anchor.config'
import { getSupportedDecoAssetById } from '@/lib/deco-supported-assets'
import {
  clampDecoAnchor,
  clampDecoItemPosition,
  clampDecoLayer,
  clampDecoRotation,
  clampDecoScale,
  clampDecoWidth,
  defaultAnchorForAsset,
  DECO_SCALE_DEFAULT,
} from '@/lib/deco-placement-layout'
import { createDefaultDecoPlacementState, type DecoPlacementItem, type DecoPlacementState } from '@/lib/deco-placement-state'
import { getOrCreateDeviceId } from '@/lib/room/room-storage'

/**
 * Same per-device-id key convention as lib/room/room-storage.ts (see that
 * file's doc comment) — a real userId later is a one-line change here, not
 * a data-model change. localStorage today; swapping the load/save bodies
 * below for Supabase calls is the entire migration surface for this file.
 */
function decoStorageKey(deviceId: string): string {
  return `statling:deco:${deviceId}`
}

function isWellFormedRaw(value: Record<string, unknown>): value is Record<string, unknown> & { items: unknown } {
  return 'items' in value && Array.isArray(value.items)
}

function migrateDecoItem(rawItem: unknown): DecoPlacementItem | null {
  if (!rawItem || typeof rawItem !== 'object') return null
  const item = rawItem as Record<string, unknown>

  const itemId = typeof item.itemId === 'string' ? item.itemId : null
  const asset = itemId ? getSupportedDecoAssetById(itemId) : undefined
  if (!asset) return null // dropped from 1supported (or never existed) since this was saved — silently drop the placement, never guess a replacement

  const instanceId = typeof item.instanceId === 'string' ? item.instanceId : `${itemId}_${Math.random().toString(36).slice(2, 8)}`
  const width = clampDecoWidth(typeof item.width === 'number' ? item.width : 0.16)
  const height = width * (asset.naturalHeight / asset.naturalWidth)
  // A save from before scale/rotation/layer existed has none of these fields
  // — defaulting to scale=1, rotation=0, layer='front' here is exactly the
  // spec's migration rule for "기존 위치만 저장된 Deco 데이터".
  const scale = clampDecoScale(typeof item.scale === 'number' ? item.scale : DECO_SCALE_DEFAULT)
  const rotation = clampDecoRotation(typeof item.rotation === 'number' ? item.rotation : 0)
  const layer = clampDecoLayer(item.layer)
  // A save from before `flipped` existed has no such field — defaults to
  // false, same migration rule as scale/rotation/layer above.
  const flipped = typeof item.flipped === 'boolean' ? item.flipped : false

  // Pre-anchor saves stored an absolute (x, y) instead of anchor+offset (see
  // lib/deco-placement-state.ts's doc comment) — convert once, here, using
  // the generic idle anchor set (migration has no live character/state
  // context to resolve a curated one against, and this is a one-time,
  // approximate carry-over of old data, not an ongoing source of truth).
  const anchor = typeof item.anchor === 'string' ? clampDecoAnchor(item.anchor) : defaultAnchorForAsset(asset.id)
  const anchorPoint = DEFAULT_CHARACTER_ANCHORS[anchor]
  const hasOffset = typeof item.offsetX === 'number' && typeof item.offsetY === 'number'
  const rawX = hasOffset ? anchorPoint.x + (item.offsetX as number) : typeof item.x === 'number' ? item.x : anchorPoint.x
  const rawY = hasOffset ? anchorPoint.y + (item.offsetY as number) : typeof item.y === 'number' ? item.y : anchorPoint.y
  const { x, y } = clampDecoItemPosition(rawX, rawY, width, height, scale, rotation)

  return {
    instanceId,
    itemId: asset.id,
    anchor,
    offsetX: x - anchorPoint.x,
    offsetY: y - anchorPoint.y,
    width,
    height,
    scale,
    rotation,
    layer,
    flipped,
  }
}

/**
 * Defensively rebuilds a valid DecoPlacementState from whatever was in
 * storage — mirrors lib/room/room-storage.ts#migrateRoomState. An
 * unresolvable itemId (asset moved out of 1supported, or the catalog was
 * regenerated) just drops that one placement rather than corrupting the
 * whole state.
 */
export function migrateDecoPlacementState(raw: unknown): DecoPlacementState {
  const fallback = createDefaultDecoPlacementState()
  if (!raw || typeof raw !== 'object') return fallback

  const value = raw as Record<string, unknown>
  if (!isWellFormedRaw(value)) return fallback

  const items = (value.items as unknown[])
    .map((rawItem) => migrateDecoItem(rawItem))
    .filter((item): item is DecoPlacementItem => item !== null)

  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt

  return { version: 1, items, updatedAt }
}

export function loadSavedDecoPlacementState(): DecoPlacementState {
  if (typeof window === 'undefined') return createDefaultDecoPlacementState()
  try {
    const raw = window.localStorage.getItem(decoStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultDecoPlacementState()
    return migrateDecoPlacementState(JSON.parse(raw))
  } catch {
    return createDefaultDecoPlacementState()
  }
}

export function saveDecoPlacementState(state: DecoPlacementState): DecoPlacementState {
  const toSave: DecoPlacementState = { ...state, updatedAt: new Date().toISOString() }
  if (typeof window === 'undefined') return toSave
  window.localStorage.setItem(decoStorageKey(getOrCreateDeviceId()), JSON.stringify(toSave))
  return toSave
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's placed-deco layout; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearDecoPlacementState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(decoStorageKey(getOrCreateDeviceId()))
}
