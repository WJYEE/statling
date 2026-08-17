'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ChevronDown, ChevronLeft, ChevronUp, X } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { buildCharacterStateFolder, CHARACTER_STATE_SEQUENCE } from '@/lib/character-state-assets'
import { CHARACTER_CATALOG } from '@/lib/pets/pet-profile'
import { loadDex } from '@/lib/pets/dex-storage'
import { useSound } from '@/hooks/use-sound'
import { trackEvent } from '@/lib/analytics/ga'
import { cn } from '@/lib/utils'

interface DexScreenProps {
  onBack: () => void
}

/**
 * "도감" — every one of the 30 characters as a card; owned ones (see
 * lib/pets/dex-storage.ts) show real idle art + name + tagline, unmet ones
 * show a black silhouette of the idle pose with the name hidden. Local-only
 * for now (see dex-storage.ts's doc comment) — a character is added by
 * becoming your own representative pet, or by opening a friend's share link
 * (app/share/[petId]/page.tsx) and choosing to record it.
 */
export function DexScreen({ onBack }: DexScreenProps) {
  const metIds = useMemo(() => new Set(loadDex().metPetIds), [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showUndiscovered, setShowUndiscovered] = useState(false)

  const openPet = openId ? CHARACTER_CATALOG.find((pet) => pet.id === openId) : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-9 w-9 place-items-center rounded-full bg-card toy-border"
        >
          <ChevronLeft size={18} strokeWidth={2.6} />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Statling</p>
          <h1 className="font-display text-xl font-extrabold text-foreground">도감</h1>
        </div>
        <span className="ml-auto text-xs font-bold text-muted-foreground">
          {metIds.size} / {CHARACTER_CATALOG.length}
        </span>
      </header>

      <p className="mt-2 text-xs font-bold text-muted-foreground">
        친구의 공유 링크를 열어 기록하면 아직 안 만난 Statling도 도감에 채울 수 있어요.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {CHARACTER_CATALOG.map((pet) => {
          const met = metIds.has(pet.id)
          return (
            <button
              key={pet.id}
              type="button"
              onClick={() => {
                trackEvent('collection_statling_view', { statling_type: pet.id, is_unlocked: met })
                if (met) setOpenId(pet.id)
                else setShowUndiscovered(true)
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl bg-card p-2 toy-border',
                met ? 'active:translate-y-0.5' : 'cursor-not-allowed opacity-70',
              )}
            >
              <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-secondary">
                <img
                  src={pet.imageSrc}
                  alt={met ? pet.name : '아직 만나지 못한 Statling'}
                  loading="lazy"
                  draggable={false}
                  className={cn('max-h-full max-w-full object-contain', !met && 'brightness-0 opacity-80')}
                />
              </span>
              <span className="line-clamp-1 w-full text-center text-[10px] font-bold text-foreground">
                {met ? pet.name : '???'}
              </span>
            </button>
          )
        })}
      </div>

      {openPet && <DexDetailCard pet={openPet} onClose={() => setOpenId(null)} />}
      <UndiscoveredPetDialog open={showUndiscovered} onOpenChange={setShowUndiscovered} />
    </div>
  )
}

/** Shown instead of entering the detail screen when an unmet Statling's card is tapped — a single acknowledgement, no extra copy, no way to see the real detail view for a pet that hasn't actually been met yet. */
function UndiscoveredPetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { play } = useSound()

  useEffect(() => {
    if (open) play('modal-open')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the open:false->true transition
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[120] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-5 text-center toy-border toy-shadow-lg transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="font-display text-base font-extrabold text-foreground">
            아직 발견하지 못했어요!
          </Dialog.Title>
          <ToyButton
            className="mt-4 w-full px-4 py-2.5 text-sm"
            data-sfx-skip
            onClick={() => {
              play('confirm')
              onOpenChange(false)
            }}
          >
            확인
          </ToyButton>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DexDetailCard({ pet, onClose }: { pet: (typeof CHARACTER_CATALOG)[number]; onClose: () => void }) {
  const [stateIndex, setStateIndex] = useState(0)
  const folder = useMemo(() => buildCharacterStateFolder(pet.id, pet.name), [pet.id, pet.name])
  const stateDef = CHARACTER_STATE_SEQUENCE[stateIndex]

  const goPrev = () => setStateIndex((i) => (i - 1 + CHARACTER_STATE_SEQUENCE.length) % CHARACTER_STATE_SEQUENCE.length)
  const goNext = () => setStateIndex((i) => (i + 1) % CHARACTER_STATE_SEQUENCE.length)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl bg-card p-5 toy-border toy-shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-foreground">{pet.name}</h2>
            <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">{pet.tagline}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary">
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>

        <div className="mt-3 flex flex-col items-center">
          <AssetImage src={folder.assets[stateDef.key]} alt={`${pet.name} — ${stateDef.label}`} size={180} />
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {stateDef.number}. {stateDef.label}
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={goPrev}
              aria-label="이전 동작"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary toy-border"
            >
              <ChevronUp size={18} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="다음 동작"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary toy-border"
            >
              <ChevronDown size={18} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
