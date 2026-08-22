'use client'

import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Download, ImageOff, Loader2, Share2, X } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'
import type { SharePreviewImageState } from '@/lib/share/use-share-preview'

interface SharePreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageState: SharePreviewImageState
  imageUrl: string | null
  busyAction: 'share' | 'save' | null
  onShare: () => void
  onSave: () => void
}

/**
 * Phase 3C-1 — Share Preview. Shown before any share/save actually happens
 * (see lib/share/use-share-preview.ts), so "공유하기"/"이미지로 저장" no
 * longer fire immediately: this is always the first stop. Same
 * Dialog/ToyButton/useSound "toy" pattern as share-fallback-modal.tsx, this
 * project's existing manual-copy modal, so the two read as one design
 * language rather than introducing a second modal style.
 */
export function SharePreviewModal({
  open,
  onOpenChange,
  imageState,
  imageUrl,
  busyAction,
  onShare,
  onSave,
}: SharePreviewModalProps) {
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
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-base font-extrabold text-foreground">
              공유 미리보기
            </Dialog.Title>
            <Dialog.Close
              aria-label="닫기"
              data-sfx-skip
              onClick={() => play('ui-back')}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={18} strokeWidth={2.4} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            이미지 저장 시 실제 저장될 모습이에요. 친구에게는 링크로 전달돼요.
          </Dialog.Description>

          <div className="mt-3 flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl bg-secondary toy-border">
            {imageState === 'generating' && (
              <Loader2 size={28} strokeWidth={2.4} className="animate-spin text-muted-foreground" />
            )}
            {imageState === 'failed' && (
              <div className="flex flex-col items-center gap-2 px-6 text-center text-xs font-bold text-muted-foreground">
                <ImageOff size={28} strokeWidth={2.2} />
                이미지를 만들지 못했어요. 링크는 공유할 수 있어요.
              </div>
            )}
            {imageState === 'ready' && imageUrl && (
              <img src={imageUrl} alt="공유 미리보기" className="h-full w-full object-contain" />
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <ToyButton
              className="w-full"
              onClick={onShare}
              disabled={busyAction !== null}
              aria-disabled={busyAction !== null}
            >
              {busyAction === 'share' ? (
                <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
              ) : (
                <Share2 size={18} strokeWidth={2.4} />
              )}
              {busyAction === 'share' ? '공유 준비 중...' : '친구에게 공유'}
            </ToyButton>

            <ToyButton
              variant="secondary"
              className="w-full"
              onClick={onSave}
              disabled={busyAction !== null || imageState !== 'ready'}
              aria-disabled={busyAction !== null || imageState !== 'ready'}
            >
              {busyAction === 'save' ? (
                <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
              ) : (
                <Download size={18} strokeWidth={2.4} />
              )}
              {busyAction === 'save' ? '저장 중...' : '이미지 저장'}
            </ToyButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
