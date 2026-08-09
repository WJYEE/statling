import { forwardRef, type ReactNode } from 'react'
import { Egg } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Every share-card PNG (Character Reveal's result card, MyPage's
 * friend-invite card, ...) is captured at this literal pixel size — a 4:5
 * vertical ratio that reads well both as an Instagram feed post and a
 * mobile share-sheet preview. Shared here so every card variant stays the
 * same shape without each one re-declaring the numbers.
 */
export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

interface ShareCardHiddenProps {
  children: ReactNode
  className?: string
}

/**
 * The off-screen capture target every share card variant renders inside —
 * see the original StatlingShareCard doc comment (still accurate) for why
 * this exact opacity/aria-hidden/inert/pointer-events-none combination on
 * the OUTER wrapper (never the ref'd node itself) is required for
 * html-to-image to capture a real, non-blank PNG.
 */
export const ShareCardHidden = forwardRef<HTMLDivElement, ShareCardHiddenProps>(function ShareCardHidden(
  { children, className },
  ref,
) {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none fixed left-0 top-0 -z-50 opacity-0"
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
    >
      <div
        ref={ref}
        className={cn('flex h-full w-full flex-col items-center bg-background px-20 py-20 text-center', className)}
      >
        {children}
      </div>
    </div>
  )
})

/** Shared top-of-card brand mark, reused by every card variant so they read as one Statling design system. `title`, if given, is a pill directly under the wordmark (e.g. a result headline). */
export function ShareCardHeader({ title }: { title?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-5">
        <span className="grid h-20 w-20 place-items-center rounded-[1.75rem] bg-primary text-primary-foreground toy-border toy-shadow-lg">
          <Egg size={44} strokeWidth={2.4} />
        </span>
        <span className="font-display text-5xl font-extrabold text-foreground">Statling</span>
      </div>
      {title && (
        <span className="rounded-full bg-accent px-8 py-3.5 font-display text-2xl font-bold text-accent-foreground toy-border toy-shadow-sm">
          {title}
        </span>
      )}
    </div>
  )
}

/** Shared bottom-of-card closing line, reused by every card variant. */
export function ShareCardFooter({ message }: { message: string }) {
  return (
    <p className="whitespace-pre-line text-pretty font-display text-2xl font-bold leading-snug text-muted-foreground">
      {message}
    </p>
  )
}
