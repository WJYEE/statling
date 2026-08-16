'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { BookOpen, ChevronLeft, Lock, Palette, Save, Sparkles, Undo2 } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { CharacterImage } from '@/components/brain-bet/character-image'
import { ConfirmDialog } from '@/components/brain-bet/confirm-dialog'
import { DecoCanvas } from '@/components/brain-bet/deco-canvas'
import { DecoPropertiesPanel } from '@/components/brain-bet/deco-properties-panel'
import { CHARACTER_BOX_SIZE } from '@/components/brain-bet/pet-mood-view'
import { DexScreen } from '@/components/brain-bet/screens/dex-screen'
import { ThemeScreen } from '@/components/brain-bet/screens/theme-screen'
import type { StatId } from '@/lib/brain-bet'
import type { CharacterAnchorKey } from '@/lib/character-anchor.config'
import { resolveCharacterAnchors } from '@/lib/character-anchor.config'
import { applyDecoReanchor, spawnDefaultDecoItem } from '@/lib/deco-placement-layout'
import { deepCloneDecoPlacementState, decoPlacementStatesEqual, type DecoPlacementItem, type DecoPlacementState } from '@/lib/deco-placement-state'
import { loadSavedDecoPlacementState, saveDecoPlacementState } from '@/lib/deco-placement-storage'
import {
  getSupportedDecoAssetById,
  isDecoUnlocked,
  SUPPORTED_DECO_ASSETS,
  SUPPORTED_DECO_ASSETS_DISPLAY_ORDER,
  type SupportedDecoAsset,
} from '@/lib/deco-supported-assets'
import { loadDecoInventoryState } from '@/lib/deco-inventory-storage'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { cn } from '@/lib/utils'
import { trackStatlingDecorSaved } from '@/lib/missions/mission-tracker'

interface StatlingScreenProps {
  statlingName: string
  topStat: StatId
  petProfile: PetProfile | null
  onDirtyChange: (dirty: boolean) => void
}

type StatlingView = 'main' | 'room' | 'dex'

/**
 * Beta framing for the notice card below, mirrors theme-screen.tsx's
 * SHOW_BETA_FURNITURE_NOTICE (own flag so either notice can be turned off
 * independently) — default stickers are free, the rest unlock via level-up
 * gifts (see SupportedDecoAsset.unlockSource, lib/statling-deco-unlock.ts).
 */
const SHOW_BETA_DECO_NOTICE = process.env.NEXT_PUBLIC_ENABLE_BETA_DECO_NOTICE !== 'false'

/**
 * The Statling tab — a hub, not a single screen: `main` is the Deco
 * placement editor (stickers from public/assets/statling/characters/deco/
 * 1supported only — see lib/deco-supported-assets.ts — placed anywhere
 * inside a fixed Statling-centered zone, see lib/deco-placement-layout.ts),
 * with "방 꾸미기" and "도감" opening as nested views (`room`/`dex`) rather
 * than separate nav tabs, per the 5-tab cap on NavRail.
 */
export function StatlingScreen({ statlingName, topStat, petProfile, onDirtyChange }: StatlingScreenProps) {
  const [view, setView] = useState<StatlingView>('main')
  const [themeDirty, setThemeDirty] = useState(false)

  const [savedDeco, setSavedDeco] = useState<DecoPlacementState>(() => loadSavedDecoPlacementState())
  const [draftDeco, setDraftDeco] = useState<DecoPlacementState>(() => deepCloneDecoPlacementState(savedDeco))
  // Loaded once per mount, same "remount on tab switch reflects latest storage"
  // idiom savedDeco/decoItems already use elsewhere — a level-gift claimed in
  // Room (hooks/use-pet-care.ts#claimGift) always shows up unlocked here the
  // next time this screen mounts.
  const [unlockedLevelGiftIds] = useState<string[]>(() => loadDecoInventoryState().unlockedIds)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmingDeleteDeco, setConfirmingDeleteDeco] = useState(false)
  const toastManager = Toast.useToastManager()

  const selectedItem = draftDeco.items.find((item) => item.instanceId === selectedInstanceId) ?? null
  const selectedAsset = selectedItem ? getSupportedDecoAssetById(selectedItem.itemId) : null

  // The editor only ever shows the Statling's static 'idle' art (petProfile.imageSrc
  // is that same idle.png — see lib/pets/pet-profile.ts), so anchors are always
  // resolved against 'idle' here. The live Home screen resolves against whatever
  // mood/action art is actually showing at the time (see pet-mood-view.tsx) —
  // that's exactly the point of anchor+offset over an absolute (x, y): a sticker
  // placed here against idle's head position keeps tracking the head even once
  // Home switches to a pose where the head is drawn somewhere else.
  const anchors = useMemo(() => resolveCharacterAnchors(petProfile?.id ?? null, 'idle'), [petProfile?.id])

  const decoDirty = useMemo(() => !decoPlacementStatesEqual(draftDeco, savedDeco), [draftDeco, savedDeco])
  const decoDirtyRef = useRef(decoDirty)
  decoDirtyRef.current = decoDirty

  useEffect(() => {
    onDirtyChange(themeDirty || decoDirty)
  }, [themeDirty, decoDirty, onDirtyChange])

  // Warn on refresh/tab close only — never touches savedDeco itself. Mirrors theme-screen.tsx's identical guard.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!decoDirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  function updateItem(instanceId: string, patch: Partial<DecoPlacementItem>) {
    setDraftDeco((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.instanceId === instanceId ? { ...item, ...patch } : item)),
    }))
  }

  /**
   * Each supported item can only be placed once — tapping an already-placed
   * item just selects it (e.g. to drag it), instead of adding a duplicate
   * sticker. Mirrors theme-screen.tsx#handleAssetClick, including the same
   * "locked only blocks a brand-new placement, never an already-placed
   * instance" rule.
   */
  function handleAssetTap(assetId: string) {
    const existing = draftDeco.items.find((item) => item.itemId === assetId)
    if (existing) {
      setSelectedInstanceId(existing.instanceId)
      return
    }
    const asset = SUPPORTED_DECO_ASSETS.find((a) => a.id === assetId)
    if (!asset) return
    if (!isDecoUnlocked(asset, unlockedLevelGiftIds)) return
    const newItem = spawnDefaultDecoItem(asset, draftDeco.items, anchors)
    setDraftDeco((prev) => ({ ...prev, items: [...prev.items, newItem] }))
    setSelectedInstanceId(newItem.instanceId)
  }

  /** Tapping a not-yet-claimed level_gift item — never places it, just names the level it unlocks at. No further detail (see the grid's lock UI below). */
  function handleLockedTap(asset: SupportedDecoAsset) {
    if (asset.unlockSource.type !== 'level_gift') return
    toastManager.add({ title: `Lv.${asset.unlockSource.level} 달성 보상` })
  }

  function confirmDeleteSelected() {
    if (!selectedInstanceId) return
    setDraftDeco((prev) => ({ ...prev, items: prev.items.filter((item) => item.instanceId !== selectedInstanceId) }))
    setSelectedInstanceId(null)
    setConfirmingDeleteDeco(false)
  }

  function handleFlip() {
    if (!selectedInstanceId) return
    const current = draftDeco.items.find((item) => item.instanceId === selectedInstanceId)
    if (!current) return
    updateItem(selectedInstanceId, { flipped: !current.flipped })
  }

  function handleSetLayer(layer: 'behind' | 'front') {
    if (!selectedInstanceId) return
    updateItem(selectedInstanceId, { layer })
  }

  function handleSetAnchor(anchor: CharacterAnchorKey) {
    if (!selectedInstanceId || !selectedItem) return
    const reanchored = applyDecoReanchor(selectedItem, anchors[selectedItem.anchor], anchor, anchors[anchor])
    updateItem(selectedInstanceId, { anchor: reanchored.anchor, offsetX: reanchored.offsetX, offsetY: reanchored.offsetY })
  }

  function handleSaveDeco() {
    if (isSaving) return
    setIsSaving(true)
    try {
      const persisted = saveDecoPlacementState(draftDeco)
      setSavedDeco(persisted)
      setDraftDeco(deepCloneDecoPlacementState(persisted))
      trackStatlingDecorSaved()
      toastManager.add({ title: '꾸미기가 저장되었어요.', type: 'success' })
    } catch {
      toastManager.add({ title: '저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  function handleRevertDeco() {
    setDraftDeco(deepCloneDecoPlacementState(savedDeco))
    setSelectedInstanceId(null)
  }

  if (view === 'room') {
    return (
      <>
        <div className="mx-auto w-full max-w-3xl px-5 pt-8">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex items-center gap-1 text-xs font-bold text-muted-foreground"
          >
            <ChevronLeft size={16} strokeWidth={2.6} />
            Statling으로
          </button>
        </div>
        <ThemeScreen topStat={topStat} petProfile={petProfile} onDirtyChange={setThemeDirty} />
      </>
    )
  }

  if (view === 'dex') {
    return <DexScreen onBack={() => setView('main')} />
  }

  const statlingSlot = petProfile ? (
    <AssetImage src={petProfile.imageSrc} alt={petProfile.name} size={CHARACTER_BOX_SIZE} />
  ) : (
    <CharacterImage type={topStat} size={CHARACTER_BOX_SIZE} />
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Statling</p>
        <h1 className="font-display text-xl font-extrabold text-foreground">{statlingName || '내 Statling'}</h1>
      </header>

      {/* Sets expectations up front, mirrors theme-screen.tsx's identical beta notice.
          Updated for the level-gift lock system below — no longer claims every
          sticker is free, since the 10 level_gift items aren't. */}
      {SHOW_BETA_DECO_NOTICE && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground toy-border">
          <Sparkles size={18} className="mt-0.5 shrink-0" strokeWidth={2.4} />
          <p className="text-xs font-bold leading-relaxed">
            기본 데코는 지금 바로 무료로 사용할 수 있어요. 잠긴 데코는 Statling 레벨업 선물로 받아보세요!
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setView('room')}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-foreground toy-border active:translate-y-0.5"
        >
          <Palette size={16} strokeWidth={2.4} />
          방 꾸미기
        </button>
        <button
          type="button"
          onClick={() => setView('dex')}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-foreground toy-border active:translate-y-0.5"
        >
          <BookOpen size={16} strokeWidth={2.4} />
          도감
        </button>
      </div>

      <p className="mt-4 text-xs font-bold text-muted-foreground">
        스티커를 눌러 붙이고, 드래그로 위치를 옮겨보세요. 선택하면 나오는 모서리를 당겨 크기를, 위쪽 손잡이를 돌려 각도를 바꿀 수 있어요.
        Statling 주변 정해진 범위 안에서만 움직일 수 있어요.
      </p>
      {/* Small, unemphasized note (never a warning box) — DecoOverlay only
          renders the placed stickers for the '기본'/'눈 깜빡임' character
          states (see pet-mood-view.tsx), same labels dex-screen.tsx already
          shows for those two states, never the internal idle/blink keys.
          Placed right under the existing usage tip above, not the more
          prominent SHOW_BETA_DECO_NOTICE card. */}
      <p className="mt-1.5 whitespace-pre-line text-[11px] font-semibold text-muted-foreground/80">
        {'현재 데코는 Statling이 기본 또는 눈 깜빡임 상태일 때만 표시돼요.\n다른 행동 중에는 잠시 보이지 않을 수 있어요.'}
      </p>

      <DecoCanvas
        items={draftDeco.items}
        editable
        selectedInstanceId={selectedInstanceId}
        onSelectItem={setSelectedInstanceId}
        onDeselectItem={() => setSelectedInstanceId(null)}
        onChangeItem={updateItem}
        className="mt-3 toy-border toy-shadow-lg"
        statlingSlot={statlingSlot}
        characterSize={CHARACTER_BOX_SIZE}
        anchors={anchors}
      />

      {selectedItem && selectedAsset && (
        <DecoPropertiesPanel
          item={selectedItem}
          asset={selectedAsset}
          onFlip={handleFlip}
          onSetLayer={handleSetLayer}
          onSetAnchor={handleSetAnchor}
          onDelete={() => setConfirmingDeleteDeco(true)}
        />
      )}

      <ConfirmDialog
        open={confirmingDeleteDeco}
        onOpenChange={setConfirmingDeleteDeco}
        title="스티커를 뺄까요?"
        description="선택한 스티커가 사라져요. 저장 전이라면 되돌리기로도 복원할 수 있어요."
        confirmLabel="빼기"
        cancelLabel="취소"
        onConfirm={confirmDeleteSelected}
      />

      <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6">
        {SUPPORTED_DECO_ASSETS_DISPLAY_ORDER.map((asset) => {
          const inUse = draftDeco.items.some((item) => item.itemId === asset.id)
          const unlocked = isDecoUnlocked(asset, unlockedLevelGiftIds)
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => (unlocked ? handleAssetTap(asset.id) : handleLockedTap(asset))}
              aria-label={unlocked ? `${asset.name} 붙이기` : `${asset.name} — 잠김`}
              aria-pressed={inUse}
              aria-disabled={!unlocked && !inUse}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl bg-card p-2 toy-border transition-transform active:translate-y-0.5',
                inUse && 'ring-2 ring-primary',
                !unlocked && 'opacity-70',
              )}
            >
              <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a pre-authored static PNG, matches theme-screen.tsx's convention */}
                <img
                  src={asset.src}
                  alt=""
                  loading="lazy"
                  className={cn('max-h-full max-w-full object-contain', !unlocked && 'grayscale')}
                  draggable={false}
                />
                {!unlocked && (
                  <span className="absolute inset-0 grid place-items-center bg-background/60">
                    <Lock size={16} strokeWidth={2.6} className="text-foreground" />
                  </span>
                )}
              </span>
              {!unlocked && <span className="max-w-full truncate text-[9px] font-bold text-muted-foreground">{asset.name}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!decoDirty}
          aria-disabled={!decoDirty}
          onClick={handleRevertDeco}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-foreground toy-border',
            !decoDirty && 'cursor-not-allowed opacity-50',
          )}
        >
          <Undo2 size={16} />
          되돌리기
        </button>
        <button
          type="button"
          disabled={isSaving}
          data-sfx="confirm"
          onClick={handleSaveDeco}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground toy-border toy-shadow"
        >
          <Save size={16} />
          꾸미기 저장
        </button>
      </div>
    </div>
  )
}
