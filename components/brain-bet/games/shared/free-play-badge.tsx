import { ArrowLeft } from 'lucide-react'

interface FreePlayBadgeProps {
  onBack: () => void
}

/**
 * Free Play's header badge — every mini-game shows this instead of First
 * Play's ProgressTrack (the `mode === 'free'` branch — see e.g.
 * reaction-game.tsx's header, or shared/game-hud.tsx for the 6 games that
 * use it). Always paired with a back button: Free Play lets the player
 * leave an in-progress round and land back on the difficulty screen they
 * picked it from (see game-flow.tsx's exitFreePlayGame). Leaving this way
 * never calls a game's own onComplete, so an abandoned round is simply
 * never recorded — no result, no XP, no ranking entry. Intro (mode
 * 'first') never renders this at all, so it never shows a back button.
 */
export function FreePlayBadge({ onBack }: FreePlayBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card text-foreground toy-border"
      >
        <ArrowLeft size={16} strokeWidth={2.6} />
      </button>
      <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
        FREE PLAY
      </span>
    </div>
  )
}
