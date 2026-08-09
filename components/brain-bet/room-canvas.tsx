'use client'

import { useRef, type ReactNode } from 'react'
import { ROOM_ASSETS, type RoomAsset } from '@/lib/room-assets'
import { STATLING_SHADOW_Z_INDEX, STATLING_Z_INDEX } from '@/lib/room/room-layout'
import type { RoomItem } from '@/lib/room/room-state'
import { cn } from '@/lib/utils'
import { RoomItemHandle } from '@/components/brain-bet/room-item-handle'

interface RoomCanvasProps {
  backgroundAsset: RoomAsset
  items: RoomItem[]
  /** The Statling (+ any per-mood overlay elements), rendered at STATLING_Z_INDEX with a contact shadow just beneath — same placement convention (x=50%, y≈64%) the room has always used. Left entirely to the caller so existing character rendering/animation logic is untouched. */
  statlingSlot: ReactNode
  /** Home screen passes false (static display, no handles); the 테마 tab editor passes true. */
  editable?: boolean
  selectedInstanceId?: string | null
  onSelectItem?: (instanceId: string) => void
  onDeselectItem?: () => void
  onChangeItem?: (instanceId: string, patch: Partial<RoomItem>) => void
  className?: string
}

/**
 * The Room as a stack of independently-positioned PNG layers (background
 * fills the stage via object-fit: cover; every item is placed at its own
 * normalized (0-1) position/size via object-fit: contain, so nothing is
 * ever stretched or cropped). Replaces the old preset-only RoomStage —
 * this one renders whatever RoomState (saved or in-progress draft) it's
 * given, with no hardcoded furniture of its own.
 */
export function RoomCanvas({
  backgroundAsset,
  items,
  statlingSlot,
  editable = false,
  selectedInstanceId = null,
  onSelectItem,
  onDeselectItem,
  onChangeItem,
  className,
}: RoomCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={stageRef}
      className={cn('relative aspect-square w-full overflow-hidden rounded-3xl bg-card', className)}
      onClick={(event) => {
        if (editable && event.target === event.currentTarget) onDeselectItem?.()
      }}
    >
      <img
        src={backgroundAsset.src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {items.map((item) => {
        const asset = ROOM_ASSETS[item.assetId]
        if (!asset) return null // defensively skip items whose asset no longer exists

        if (editable) {
          return (
            <RoomItemHandle
              key={item.instanceId}
              item={item}
              asset={asset}
              stageRef={stageRef}
              selected={selectedInstanceId === item.instanceId}
              onSelect={() => onSelectItem?.(item.instanceId)}
              onChange={(patch) => onChangeItem?.(item.instanceId, patch)}
            />
          )
        }

        return (
          <div
            key={item.instanceId}
            className="absolute"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              // Display-only clamp — the editor's 앞으로/뒤로 (bringToFront in
              // theme-screen.tsx) can save a zIndex above STATLING_Z_INDEX so
              // the item previews in front of the character while editing,
              // but on Home (this non-editable branch) the Statling must
              // always read as in front of every piece of furniture. The
              // stored item.zIndex itself is untouched — only what's handed
              // to this render is capped, so re-opening the editor still
              // shows the item's real saved stacking.
              zIndex: Math.min(item.zIndex, STATLING_Z_INDEX - 1),
              transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg) scaleX(${item.flipped ? -1 : 1})`,
            }}
          >
            <img
              src={asset.src}
              alt=""
              aria-hidden="true"
              className="h-auto w-full object-contain"
              style={{ aspectRatio: `${asset.naturalWidth} / ${asset.naturalHeight}` }}
              draggable={false}
            />
          </div>
        )
      })}

      {/* Statling's contact shadow — a lightweight CSS ellipse (not a PNG edit), just beneath the character. */}
      <div
        className="absolute rounded-full bg-black/20 blur-[2px]"
        style={{
          left: '50%',
          top: '76%',
          width: '30%',
          height: '6%',
          transform: 'translate(-50%, -50%)',
          zIndex: STATLING_SHADOW_Z_INDEX,
        }}
        aria-hidden="true"
      />

      <div
        className="absolute"
        style={{ left: '50%', top: '64%', zIndex: STATLING_Z_INDEX, transform: 'translate(-50%, -50%)' }}
      >
        {statlingSlot}
      </div>
    </div>
  )
}
