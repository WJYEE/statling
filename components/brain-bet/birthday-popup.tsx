'use client'

import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'

interface BirthdayPopupProps {
  statlingName: string
  /** The pet's own idle portrait (petProfile.imageSrc) — same asset already shown on Room/Statling/share screens, no new art needed. */
  imageSrc: string
  onConfirm: () => void
}

/**
 * The once-a-year "생일 축하해!" moment — same Dialog shape/animation as
 * GiftRewardPopup (that component's own doc comment explains the modal
 * conventions reused here: `Dialog.Root open modal`, no Escape/backdrop
 * dismiss, only unmounts once 확인 is pressed). RoomScreen only ever mounts
 * this while its own `birthdayPopupOpen` state is true, itself only set once
 * per real local calendar day (see lib/profile/birthday-celebration-storage.ts) —
 * so this component has no date/once-per-day logic of its own to keep it a
 * pure "how it looks", not "when it shows" concern.
 */
export function BirthdayPopup({ statlingName, imageSrc, onConfirm }: BirthdayPopupProps) {
  const { play } = useSound()

  useEffect(() => {
    play('level-up')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once, the instant this mounts
  }, [])

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="animate-pop-in fixed left-1/2 top-1/2 z-[120] w-full max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-5 text-center toy-border toy-shadow-lg">
          <span className="text-3xl" aria-hidden="true">
            🎉🎂🎉
          </span>

          <Dialog.Title className="mt-2 font-display text-lg font-extrabold text-foreground">
            생일 축하해!
          </Dialog.Title>

          <div
            className="animate-pop-in mx-auto mt-4 grid h-32 w-32 place-items-center overflow-hidden rounded-2xl bg-secondary"
            style={{ animationDelay: '90ms' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static pre-authored PNG, same convention as gift-reward-popup.tsx */}
            <img src={imageSrc} alt={statlingName} className="max-h-full max-w-full object-contain" draggable={false} />
          </div>

          <Dialog.Description className="mt-3 text-xs text-muted-foreground">
            {statlingName}이(가) 오늘 하루 특별한 선물을 준비했어요!
          </Dialog.Description>

          <ToyButton
            className="mt-4 w-full px-4 py-2.5 text-sm"
            data-sfx-skip
            onClick={() => {
              play('confirm')
              onConfirm()
            }}
          >
            고마워!
          </ToyButton>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
