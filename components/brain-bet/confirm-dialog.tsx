'use client'

import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
}

/**
 * Shared "are you sure" modal — built on @base-ui/react's Dialog (already a
 * project dependency, see share-fallback-modal.tsx for the original usage),
 * styled to match the existing "toy" design system. Reused for: reverting
 * to the last saved room, resetting to the default room, and discarding
 * unsaved room edits when navigating away from the 테마 tab.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const { play } = useSound()

  useEffect(() => {
    if (open) play('modal-open')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the open:false->true transition
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[120] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-5 text-left toy-border toy-shadow-lg transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="font-display text-base font-extrabold text-foreground">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {description}
          </Dialog.Description>

          <div className="mt-4 flex gap-2">
            <Dialog.Close
              data-sfx-skip
              onClick={() => play('ui-back')}
              className="flex-1 rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground toy-border"
            >
              {cancelLabel}
            </Dialog.Close>
            <ToyButton
              className="flex-1 px-4 py-2.5 text-sm"
              data-sfx-skip
              onClick={() => {
                play('confirm')
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </ToyButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
