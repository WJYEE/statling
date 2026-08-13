'use client'

import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'
import type { SupportedDecoAsset } from '@/lib/deco-supported-assets'

interface GiftRewardPopupProps {
  asset: SupportedDecoAsset
  onConfirm: () => void
}

/**
 * The "you got a gift" reveal — replaces the old plain success toast for
 * Level Gift claims specifically (every other toast in the app is
 * untouched). Only ever mounted while a reward is pending (see
 * room-screen.tsx's `rewardPopup` state), so it's always open for its whole
 * lifetime — no separate `open` prop, no exit animation needed (the popup
 * simply unmounts once 확인 is pressed).
 *
 * Deliberately gives no way to dismiss besides the 확인 button (no
 * `onOpenChange`, so Escape/backdrop-click are no-ops) — inventory grant
 * already happened the moment the Statling was tapped (see
 * hooks/use-pet-care.ts#claimGift), but the gift STATE itself
 * (PetCareState.giftReadyLevel) only ends once 확인 fires
 * `dismissGiftClaim`, so this popup is the one thing standing between "gift
 * PNG showing" and "back to normal idle/blink" — it needs an explicit,
 * unambiguous acknowledgement.
 */
export function GiftRewardPopup({ asset, onConfirm }: GiftRewardPopupProps) {
  const { play } = useSound()
  const comment = asset.unlockSource.type === 'level_gift' ? asset.unlockSource.comment : ''

  useEffect(() => {
    play('modal-open')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once, the instant this mounts
  }, [])

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="animate-pop-in fixed left-1/2 top-1/2 z-[120] w-full max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-5 text-center toy-border toy-shadow-lg">
          <Dialog.Title className="font-display text-base font-extrabold text-foreground">
            선물을 받았어요!
          </Dialog.Title>

          {/* Same animate-pop-in as the card itself, just started a beat later (animation-delay, kept as inline style since it's a one-off offset rather than a reusable utility) — a small stagger so the item reads as "revealed inside" the card rather than both popping at once. */}
          <div
            className="animate-pop-in mx-auto mt-4 grid h-32 w-32 place-items-center overflow-hidden rounded-2xl bg-secondary"
            style={{ animationDelay: '90ms' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a pre-authored static PNG, matches statling-screen.tsx's convention */}
            <img src={asset.src} alt={asset.name} className="max-h-full max-w-full object-contain" draggable={false} />
          </div>

          <p className="mt-3 font-display text-sm font-extrabold text-foreground">{asset.name}</p>
          {comment && <Dialog.Description className="mt-1.5 text-xs text-muted-foreground">{comment}</Dialog.Description>}

          <ToyButton
            className="mt-4 w-full px-4 py-2.5 text-sm"
            data-sfx-skip
            onClick={() => {
              play('confirm')
              onConfirm()
            }}
          >
            확인
          </ToyButton>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
