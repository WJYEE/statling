interface SkipTutorialButtonProps {
  onSkip: () => void
  className?: string
}

/**
 * "건너뛰기" — shown only during a game's forced Tutorial stage, and only
 * for Normal/Hard/Extreme (never Easy, which keeps the full guided
 * Tutorial). The Tutorial's own content (including any difficulty-specific
 * callout — a new decoy, rule, or pattern shown for the first time at this
 * tier) still renders normally alongside this button; skipping only cuts
 * the Tutorial short, it never hides what the Tutorial was about to explain.
 * 2026-08 QA: shared by every game with a forced pre-play Tutorial stage
 * (Judgment/Focus/Memory/Reasoning/Spatial) so repeat players aren't forced
 * through it every session.
 */
export function SkipTutorialButton({ onSkip, className }: SkipTutorialButtonProps) {
  return (
    <button
      type="button"
      data-sfx-skip
      onClick={onSkip}
      className={
        className ??
        'inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border transition-transform active:translate-y-0.5'
      }
    >
      건너뛰기 →
    </button>
  )
}
