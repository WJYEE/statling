'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { RotateCcw, Save, Sparkles, Undo2 } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { CharacterImage } from '@/components/brain-bet/character-image'
import { ConfirmDialog } from '@/components/brain-bet/confirm-dialog'
import { CHARACTER_BOX_SIZE } from '@/components/brain-bet/pet-mood-view'
import { RoomCanvas } from '@/components/brain-bet/room-canvas'
import { RoomPropertiesPanel } from '@/components/brain-bet/room-properties-panel'
import { ToyButton } from '@/components/brain-bet/toy-button'
import type { StatId } from '@/lib/brain-bet'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { ROOM_ASSETS, type RoomAsset, type RoomAssetCategory } from '@/lib/room-assets'
import { STATLING_Z_INDEX, applyMove, spawnDefaultItem } from '@/lib/room/room-layout'
import { loadSavedRoomState, saveRoomState } from '@/lib/room/room-storage'
import { deepCloneRoomState, roomStatesEqual, type RoomItem, type RoomState } from '@/lib/room/room-state'
import { cn } from '@/lib/utils'
import { trackRoomDecorSaved } from '@/lib/missions/mission-tracker'

interface ThemeScreenProps {
  topStat: StatId
  petProfile: PetProfile | null
  /** Lifted to game-flow.tsx so the bottom NavRail can intercept a tab switch away from 테마 while there are unsaved edits (see game-flow.tsx#handleNavSelect). */
  onDirtyChange: (dirty: boolean) => void
}

const CATEGORY_TABS: { id: RoomAssetCategory; label: string }[] = [
  { id: 'background', label: '배경' },
  { id: 'decor', label: '장식' },
  { id: 'furniture', label: '가구' },
  { id: 'plant', label: '식물' },
  { id: 'rug', label: '러그' },
  { id: 'window', label: '창문' },
]

const NUDGE_STEP = 0.005
const NUDGE_STEP_LARGE = 0.02

/**
 * Beta-only messaging: right now every asset below is unlocked and free (no
 * shop/currency/unlock system exists yet), so this notice is simply true.
 * Defaults ON (matches "we're in beta right now") — flip
 * NEXT_PUBLIC_ENABLE_BETA_FURNITURE_NOTICE to 'false' once a real
 * shop/currency/unlock system ships and the claim stops being accurate.
 */
const SHOW_BETA_FURNITURE_NOTICE = process.env.NEXT_PUBLIC_ENABLE_BETA_FURNITURE_NOTICE !== 'false'

/**
 * The 테마 tab — the app's only "admin/decorate" surface (there's no
 * separate admin mode). Owns a saved/draft split: `savedRoomState` mirrors
 * whatever's actually persisted, `draftRoomState` is what the canvas +
 * asset grid actually mutate. The home screen (room-screen.tsx) never sees
 * `draftRoomState` — it only ever reads via loadSavedRoomState().
 */
export function ThemeScreen({ topStat, petProfile, onDirtyChange }: ThemeScreenProps) {
  const [savedState, setSavedState] = useState<RoomState>(() => loadSavedRoomState())
  const [draftState, setDraftState] = useState<RoomState>(() => deepCloneRoomState(savedState))
  const [activeTab, setActiveTab] = useState<RoomAssetCategory>('background')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'revert' | 'reset' | null>(null)
  const toastManager = Toast.useToastManager()

  const dirty = useMemo(() => !roomStatesEqual(draftState, savedState), [draftState, savedState])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // Warn on refresh/tab close only — never touches savedState itself.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const assetsForActiveTab = useMemo(
    () => Object.values(ROOM_ASSETS).filter((asset) => asset.category === activeTab),
    [activeTab],
  )

  const selectedItem = selectedInstanceId
    ? draftState.items.find((item) => item.instanceId === selectedInstanceId) ?? null
    : null
  const selectedAsset = selectedItem ? ROOM_ASSETS[selectedItem.assetId] : null

  // Keyboard: arrow-key nudge + delete for whichever item is selected — ignored while typing in an input/textarea.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedInstanceId) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        nudgeSelected(-step, 0)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        nudgeSelected(step, 0)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        nudgeSelected(0, -step)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        nudgeSelected(0, step)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest draftState/selectedInstanceId via closures recreated each render
  }, [selectedInstanceId, draftState])

  function updateItem(instanceId: string, patch: Partial<RoomItem>) {
    setDraftState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.instanceId === instanceId ? { ...item, ...patch } : item)),
    }))
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedItem || !selectedAsset) return
    const moved = applyMove(selectedItem, selectedAsset, selectedItem.x + dx, selectedItem.y + dy)
    updateItem(selectedItem.instanceId, { x: moved.x, y: moved.y })
  }

  function deleteSelected() {
    if (!selectedInstanceId) return
    setDraftState((prev) => ({ ...prev, items: prev.items.filter((item) => item.instanceId !== selectedInstanceId) }))
    setSelectedInstanceId(null)
  }

  function bringToFront() {
    if (!selectedItem) return
    const maxZ = Math.max(STATLING_Z_INDEX, ...draftState.items.map((i) => i.zIndex))
    updateItem(selectedItem.instanceId, { zIndex: maxZ + 1 })
  }

  function sendToBack() {
    if (!selectedItem) return
    const minZ = Math.min(0, ...draftState.items.map((i) => i.zIndex))
    updateItem(selectedItem.instanceId, { zIndex: minZ - 1 })
  }

  function toggleFlip() {
    if (!selectedItem) return
    updateItem(selectedItem.instanceId, { flipped: !selectedItem.flipped })
  }

  /** Each asset can only be placed once — clicking an asset that's already in the room just selects the existing instance (e.g. to flip or reposition it) instead of adding a duplicate "sticker". */
  function handleAssetClick(asset: RoomAsset) {
    if (asset.category === 'background') {
      setDraftState((prev) => ({ ...prev, backgroundId: asset.id }))
      return
    }

    const existing = draftState.items.find((item) => item.assetId === asset.id)
    if (existing) {
      setSelectedInstanceId(existing.instanceId)
      return
    }

    const newItem = spawnDefaultItem(asset, draftState.items)
    setDraftState((prev) => ({ ...prev, items: [...prev.items, newItem] }))
    setSelectedInstanceId(newItem.instanceId)
  }

  function handleSave() {
    if (isSaving) return
    setIsSaving(true)
    try {
      const persisted = saveRoomState(draftState)
      setSavedState(persisted)
      setDraftState(deepCloneRoomState(persisted))
      trackRoomDecorSaved()
      toastManager.add({ title: '방이 저장되었어요.', type: 'success' })
    } catch {
      toastManager.add({ title: '저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  function handleConfirmedRevert() {
    setDraftState(deepCloneRoomState(savedState))
    setSelectedInstanceId(null)
  }

  function handleConfirmedReset() {
    setDraftState((prev) => ({ ...prev, items: [] }))
    setSelectedInstanceId(null)
  }

  const backgroundAsset = ROOM_ASSETS[draftState.backgroundId] ?? ROOM_ASSETS['wood-background']

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 pb-28 pt-8">
      <header>
        <h1 className="font-display text-xl font-extrabold text-foreground">테마 · 방 꾸미기</h1>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          에셋을 눌러 추가하고, 드래그로 위치를 옮겨보세요. (에셋마다 하나씩만 놓을 수 있어요)
        </p>
      </header>

      {/* Sets expectations up front: every basic asset below is unlocked and free right now — no
          shop/currency/unlock system exists yet, so this is simply true, not a promotional claim. */}
      {SHOW_BETA_FURNITURE_NOTICE && (
        <div className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground toy-border">
          <Sparkles size={18} className="mt-0.5 shrink-0" strokeWidth={2.4} />
          <p className="text-xs font-bold leading-relaxed">
            지금은 기본 가구와 소품을 전부 무료로 제공하고 있어요. 마음껏 자유롭게 방을 꾸며보세요!
          </p>
        </div>
      )}

      <RoomCanvas
        backgroundAsset={backgroundAsset}
        items={draftState.items}
        editable
        selectedInstanceId={selectedInstanceId}
        onSelectItem={setSelectedInstanceId}
        onDeselectItem={() => setSelectedInstanceId(null)}
        onChangeItem={updateItem}
        className="toy-border toy-shadow-lg"
        statlingSlot={
          petProfile ? (
            <AssetImage src={petProfile.imageSrc} alt={petProfile.name} size={CHARACTER_BOX_SIZE} />
          ) : (
            <CharacterImage type={topStat} size={CHARACTER_BOX_SIZE} />
          )
        }
      />

      {selectedItem && selectedAsset && (
        <RoomPropertiesPanel
          item={selectedItem}
          asset={selectedAsset}
          onDelete={deleteSelected}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onFlip={toggleFlip}
        />
      )}

      <div role="tablist" aria-label="에셋 카테고리" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {CATEGORY_TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'shrink-0 rounded-2xl px-4 py-2 text-sm font-bold toy-border transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {assetsForActiveTab.map((asset) => {
          const inUse =
            asset.category === 'background'
              ? asset.id === draftState.backgroundId
              : draftState.items.some((item) => item.assetId === asset.id)

          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => handleAssetClick(asset)}
              aria-label={`${asset.name} ${asset.category === 'background' ? '배경으로 설정' : '추가하기'}`}
              aria-pressed={inUse}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl bg-card p-2 toy-border transition-transform active:translate-y-0.5',
                inUse && 'ring-2 ring-primary',
              )}
            >
              <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a pre-authored static PNG, matches asset-image.tsx's convention */}
                <img
                  src={asset.src}
                  alt=""
                  loading="lazy"
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              </span>
              <span className="line-clamp-1 w-full text-center text-[10px] font-bold text-foreground">
                {asset.name}
              </span>
              {inUse && <span className="text-[9px] font-bold text-primary">사용 중</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!dirty}
          aria-disabled={!dirty}
          onClick={() => setConfirmKind('revert')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-foreground toy-border',
            !dirty && 'cursor-not-allowed opacity-50',
          )}
        >
          <Undo2 size={16} />
          저장된 방으로 되돌리기
        </button>
        <ToyButton className="flex-1 px-4 py-3 text-sm" disabled={isSaving} data-sfx="confirm" onClick={handleSave}>
          <Save size={16} />
          방 저장
        </ToyButton>
      </div>

      <button
        type="button"
        onClick={() => setConfirmKind('reset')}
        className="mx-auto flex items-center gap-1.5 text-xs font-bold text-muted-foreground underline-offset-2 hover:underline"
      >
        <RotateCcw size={13} />
        기본 방으로 초기화
      </button>

      <ConfirmDialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null)
        }}
        title={confirmKind === 'revert' ? '저장된 방으로 되돌릴까요?' : '기본 방으로 초기화할까요?'}
        description={
          confirmKind === 'revert'
            ? '저장하지 않은 변경사항을 모두 취소하고\n마지막 저장 상태로 되돌릴까요?'
            : '배경을 제외한 모든 가구와 장식이 제거돼요.\n초기화 후에도 "방 저장"을 눌러야 실제로 반영돼요.'
        }
        confirmLabel={confirmKind === 'revert' ? '되돌리기' : '초기화'}
        cancelLabel="취소"
        onConfirm={() => (confirmKind === 'revert' ? handleConfirmedRevert() : handleConfirmedReset())}
      />
    </div>
  )
}
