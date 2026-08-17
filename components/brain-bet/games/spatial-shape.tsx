import type { CellCoord } from '@/lib/game/spatial-shapes'

interface SpatialShapeViewProps {
  cells: CellCoord[]
  color: string
  size?: number
  /**
   * Optional responsive override for the SVG's rendered (CSS) size, e.g.
   * `"h-16 w-16 sm:h-[72px] sm:w-[72px]"` — `size` still fully drives the
   * viewBox/cellPx math below (never changes), so this only ever shrinks or
   * grows how big that same geometry paints on screen. When omitted, the
   * SVG renders at `size` exactly as before.
   */
  className?: string
}

/**
 * CSS/SVG-only Polyomino renderer — a grid cell per coordinate, solid fill +
 * thick outline (GAME_SPEC-style clarity: no decoration that could make the
 * shape itself harder to read). Cells are assumed already normalized
 * (min row/col = 0); the bounding box is derived from the cells themselves
 * so both the 4x2 tetromino reference and larger pentomino shapes render at
 * a consistent overall footprint.
 */
export function SpatialShapeView({ cells, color, size = 96, className }: SpatialShapeViewProps) {
  const maxRow = Math.max(...cells.map(([r]) => r))
  const maxCol = Math.max(...cells.map(([, c]) => c))
  const gridSize = Math.max(maxRow, maxCol) + 1
  const cellPx = size / gridSize
  const inset = cellPx * 0.06

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      {cells.map(([r, c]) => (
        <rect
          key={`${r}-${c}`}
          x={c * cellPx + inset}
          y={r * cellPx + inset}
          width={cellPx - inset * 2}
          height={cellPx - inset * 2}
          rx={cellPx * 0.12}
          fill={color}
          stroke="var(--ink)"
          strokeWidth={2.5}
        />
      ))}
    </svg>
  )
}
