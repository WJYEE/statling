import type { FocusSymbolSpec } from '@/lib/game/focus-symbol'

interface FocusSymbolViewProps extends FocusSymbolSpec {
  color: string
  size?: number
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI / 5) * i - Math.PI / 2
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`)
  }
  return points.join(' ')
}

function ShapePath({ shape }: { shape: FocusSymbolSpec['shape'] }) {
  switch (shape) {
    case 'star':
      return <polygon points={starPoints(20, 20, 16, 6.5)} />
    case 'diamond':
      return <polygon points="20,4 36,20 20,36 4,20" />
    case 'circle':
      return <circle cx={20} cy={20} r={15} />
    case 'square':
      return <rect x={6} y={6} width={28} height={28} rx={5} />
    case 'triangle':
      return <polygon points="20,6 35,32 5,32" />
    default:
      return null
  }
}

/** CSS/SVG-only symbol — no external image assets, per the Focus visual theme guidance. */
export function FocusSymbolView({ shape, rotationDeg, hasDot, dotOffset, sizeScale, color, size = 30 }: FocusSymbolViewProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ transform: `rotate(${rotationDeg}deg)` }}
      aria-hidden="true"
    >
      <g transform={sizeScale !== 1 ? `translate(20 20) scale(${sizeScale}) translate(-20 -20)` : undefined}>
        <g fill={color} stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round">
          <ShapePath shape={shape} />
        </g>
        {hasDot && <circle cx={dotOffset ? 25 : 20} cy={20} r={3} fill="var(--ink)" />}
      </g>
    </svg>
  )
}
