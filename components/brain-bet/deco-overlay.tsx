import type { ReactNode } from 'react'
import type { CharacterAnchorSet } from '@/lib/character-anchor.config'
import { isDecoVisibleForState, type CharacterStateKey } from '@/lib/character-state-assets'
import { getSupportedDecoAssetById } from '@/lib/deco-supported-assets'
import { DECO_BEHIND_Z_BASE, DECO_FRONT_Z_BASE, DECO_STATLING_Z_INDEX } from '@/lib/deco-placement-layout'
import type { DecoPlacementItem } from '@/lib/deco-placement-state'
import { cn } from '@/lib/utils'

interface DecoOverlayProps {
  items: DecoPlacementItem[]
  /** The character's own rendered box size — e.g. AssetImage's `size` prop (number = px, or a CSS size string like `clamp()`). The overlay box is exactly this size (not a bigger canvas), so the normalized DECO_ZONE coordinates (lib/deco-placement-layout.ts) land on the same relative spot around the character everywhere this is used, at any box size. */
  characterSize: number | string
  /** Resolved head/face/body anchor points for whatever character + expression/action state `characterSlot` is currently showing — see lib/character-anchor.config.ts. Each item's rendered position is this set's `[item.anchor]` point plus that item's own offset, so a sticker tracks the right spot even as the character's pose (and therefore where its head/face/body actually is) changes. */
  anchors: CharacterAnchorSet
  characterSlot: ReactNode
  /**
   * Which of the 24 character states `characterSlot` is currently showing —
   * see lib/character-state-assets.ts. Deco only renders while this is a
   * "visible" state (isDecoVisibleForState — MVP: idle/blink only, since
   * every action pose moves the head/body far enough that idle's anchor
   * coordinates no longer line up). Omit it to keep Deco always visible,
   * for callers that only ever show a resting pose (e.g. deco-canvas.tsx's
   * editor preview, always anchored to 'idle').
   */
  stateKey?: CharacterStateKey
  className?: string
}

/**
 * Static (non-editable) Deco rendering — the single source of truth for
 * "what does this saved Deco data actually look like," reused as-is by the
 * live Room screen (pet-mood-view.tsx) and by the editable Deco stage
 * (deco-canvas.tsx wraps this same component for its non-editable branch,
 * and mirrors its exact box-size/z-index scheme for the editable one) — so
 * a Statling never looks different in Room than it did in the editor.
 */
export function DecoOverlay({ items, characterSize, anchors, characterSlot, stateKey, className }: DecoOverlayProps) {
  const visibleItems = stateKey == null || isDecoVisibleForState(stateKey) ? items : []
  return (
    <div className={cn('relative', className)} style={{ width: characterSize, height: characterSize }}>
      {visibleItems.map((item, index) => {
        const asset = getSupportedDecoAssetById(item.itemId)
        if (!asset || item.layer !== 'behind') return null
        return (
          <StaticDecoItem
            key={item.instanceId}
            item={item}
            anchorPoint={anchors[item.anchor]}
            src={asset.src}
            name={asset.name}
            naturalWidth={asset.naturalWidth}
            naturalHeight={asset.naturalHeight}
            zIndex={DECO_BEHIND_Z_BASE + index}
          />
        )
      })}

      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: DECO_STATLING_Z_INDEX }}>
        {characterSlot}
      </div>

      {visibleItems.map((item, index) => {
        const asset = getSupportedDecoAssetById(item.itemId)
        if (!asset || item.layer !== 'front') return null
        return (
          <StaticDecoItem
            key={item.instanceId}
            item={item}
            anchorPoint={anchors[item.anchor]}
            src={asset.src}
            name={asset.name}
            naturalWidth={asset.naturalWidth}
            naturalHeight={asset.naturalHeight}
            zIndex={DECO_FRONT_Z_BASE + index}
          />
        )
      })}
    </div>
  )
}

interface StaticDecoItemProps {
  item: DecoPlacementItem
  /** This item's own `anchor` key, already resolved to a point — see DecoOverlay's doc comment. */
  anchorPoint: { x: number; y: number }
  src: string
  name: string
  naturalWidth: number
  naturalHeight: number
  zIndex: number
}

export function StaticDecoItem({ item, anchorPoint, src, name, naturalWidth, naturalHeight, zIndex }: StaticDecoItemProps) {
  return (
    <div
      className="absolute"
      style={{
        left: `${(anchorPoint.x + item.offsetX) * 100}%`,
        top: `${(anchorPoint.y + item.offsetY) * 100}%`,
        // Matches deco-item-handle.tsx's effective-size box exactly (width
        // already bakes in scale, rather than a separate CSS scale()
        // transform) — same formula, same pixel result, so a sticker never
        // looks different in Room than it did in the editor.
        width: `${item.width * item.scale * 100}%`,
        zIndex,
        transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scaleX(${item.flipped ? -1 : 1})`,
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        title={name}
        className="h-auto w-full object-contain"
        style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}
        draggable={false}
      />
    </div>
  )
}
