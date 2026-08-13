import { cn } from '@/lib/utils'

interface PetSpeechBubbleProps {
  text: string
  className?: string
  /** When given, the bubble becomes tappable — closes on click/Enter/Space instead of only via its own auto-hide timer. */
  onDismiss?: () => void
}

/**
 * Speech bubble shown above the pet — covers ambient mood lines
 * ("배에서 꼬르륵 소리가 나요…"), 대화 button responses, entry greetings,
 * autonomous requests, and minigame reactions alike (whichever the caller's
 * priority chain currently has active). The call site keys this by message
 * *instance* (source + generation id), not by its text, so the pop-in
 * re-triggers on every new line — including a repeat of the same text from
 * a different instance.
 */
export function PetSpeechBubble({ text, className, onDismiss }: PetSpeechBubbleProps) {
  return (
    <div
      role={onDismiss ? 'button' : 'status'}
      tabIndex={onDismiss ? 0 : undefined}
      onClick={onDismiss}
      onKeyDown={
        onDismiss
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onDismiss()
              }
            }
          : undefined
      }
      className={cn(
        'animate-pop-in line-clamp-3 max-w-52 rounded-2xl bg-card px-3 py-2 text-center text-xs font-bold text-foreground toy-border toy-shadow-sm',
        onDismiss ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
        className,
      )}
    >
      {text}
    </div>
  )
}
