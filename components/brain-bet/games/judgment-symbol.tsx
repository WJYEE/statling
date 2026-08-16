import type { JudgmentStimulus } from '@/lib/game/types'

interface JudgmentSymbolViewProps {
  stimulus: JudgmentStimulus
  color: string
  size?: number
  /** Optional responsive size override (e.g. `sm:h-[60px] sm:w-[60px]`) — a CSS width/height class always wins over the `size` attribute once its breakpoint matches, so callers can pass a smaller mobile `size` plus a `sm:` class to restore the desktop size exactly. */
  className?: string
}

/**
 * CSS/SVG-only symbol. Shape (circle/square/triangle) carries the Shape Rule
 * cue, dot count (1/2/3) carries the Count Rule cue — color is otherwise
 * decorative only, never the deciding cue (GAME_SPEC-style color-vision
 * independence). 2026-08 QA 2차 보정: the small direction-arrow badge (and
 * 'diamond'/4th-dot, which only existed to fill a 4-way answer domain) were
 * removed along with the 'direction' rule itself — see lib/game/types.ts's
 * JudgmentRuleId doc comment.
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
        : [
            [20, 32],
            [32, 32],
            [44, 32],
          ]

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <g fill={color} stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round">
        {stimulus.shape === 'circle' && <circle cx={32} cy={32} r={26} />}
        {stimulus.shape === 'square' && <rect x={8} y={8} width={48} height={48} rx={8} />}
        {stimulus.shape === 'triangle' && <polygon points="32,7 58,55 6,55" />}
      </g>
      {dotPositions.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="var(--ink)" />
      ))}
    </svg>
  )
}
