import type { JudgmentStimulus } from '@/lib/game/types'

interface JudgmentSymbolViewProps {
  stimulus: JudgmentStimulus
  color: string
  size?: number
  /** Optional responsive size override (e.g. `sm:h-[60px] sm:w-[60px]`) — a CSS width/height class always wins over the `size` attribute once its breakpoint matches, so callers can pass a smaller mobile `size` plus a `sm:` class to restore the desktop size exactly. */
  className?: string
}

/** Rotation (deg) that turns the base up-pointing arrow into each pointerDirection — see DIRECTION_ARROW_ROTATION below. */
const DIRECTION_ARROW_ROTATION: Record<JudgmentStimulus['pointerDirection'], number> = {
  up: 0,
  right: 90,
  down: 180,
  left: -90,
}

/**
 * CSS/SVG-only symbol. Shape (circle/square/triangle/diamond) carries the
 * Shape Rule cue, dot count (1/2/3/4) carries the Count Rule cue, the small
 * arrow badge (top-right) carries the Direction Rule cue (Hard+ only — see
 * lib/game/types.ts's JudgmentStimulus doc comment for why 'direction' was
 * used instead of a color-based rule) — color is otherwise decorative only,
 * never the deciding cue (GAME_SPEC-style color-vision independence).
 * 'diamond' and the 4th dot/direction (2026-08 후속 보정) exist so every
 * rule's value domain can reach a genuine 4-way answer set at Hard/Extreme.
 */
export function JudgmentSymbolView({ stimulus, color, size = 64, className }: JudgmentSymbolViewProps) {
  const dotPositions: [number, number][] =
    stimulus.dotCount === 1
      ? [[32, 32]]
      : stimulus.dotCount === 2
        ? [
            [23, 32],
            [41, 32],
          ]
        : stimulus.dotCount === 3
          ? [
              [20, 32],
              [32, 32],
              [44, 32],
            ]
          : [
              [15, 32],
              [26, 32],
              [38, 32],
              [49, 32],
            ]

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <g fill={color} stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round">
        {stimulus.shape === 'circle' && <circle cx={32} cy={32} r={26} />}
        {stimulus.shape === 'square' && <rect x={8} y={8} width={48} height={48} rx={8} />}
        {stimulus.shape === 'triangle' && <polygon points="32,7 58,55 6,55" />}
        {stimulus.shape === 'diamond' && <polygon points="32,6 58,32 32,58 6,32" />}
      </g>
      {dotPositions.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="var(--ink)" />
      ))}
      <polygon
        points="54,45 60,55 48,55"
        fill="var(--ink)"
        transform={`rotate(${DIRECTION_ARROW_ROTATION[stimulus.pointerDirection]} 54 51)`}
      />
    </svg>
  )
}
