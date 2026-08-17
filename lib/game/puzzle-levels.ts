import type { GameDifficulty } from '@/lib/game/difficulty'
import { cellsEqual, rotateCells, type CellCoord } from '@/lib/game/spatial-shapes'

/**
 * 2026-08 QA 최종 보정: matches lib/game/spatial-shapes.ts's SpatialRotationAngle
 * union exactly (rather than declaring an incompatible equivalent here) so
 * rotateCells/cellsEqual — reused below — never need a cast between the two
 * games' "rotation" concepts.
 */
export type PuzzleRotation = 0 | 90 | 180 | 270

export interface PuzzlePieceSpec {
  id: string
  /**
   * Cells this piece occupies within its own bounding box, AT ROTATION 0 —
   * same coordinate convention as spatial-shapes.ts's polyominoes (row, col),
   * which is exactly why rotateCells/cellsEqual from that file can be reused
   * directly instead of re-deriving polyomino rotation math here. A plain
   * rectangle is still just a degenerate case (e.g. a 1x2 domino is
   * `[[0,0],[1,0]]`) — this replaced the old widthCells/heightCells-only
   * shape model specifically so genuinely non-rectangular pieces (L/T/S/Z
   * tetrominoes, small pentominoes) become representable at all.
   */
  cells: CellCoord[]
  /** Bounding box of `cells` at rotation 0 — kept as plain fields (not re-derived on every read) since tray/drag layout math reads them often; always consistent with `cells` (see the dev-time assertion in generateSpatialSession's sibling below, PUZZLE_LEVELS itself is verified by a runtime script — see the QA report). */
  widthCells: number
  heightCells: number
  /** Rotation the piece must be turned to before it matches its target silhouette. */
  correctRotation: PuzzleRotation
  color: string
  targetCol: number
  targetRow: number
}

export interface PuzzleLevel {
  id: string
  /** 1 = Easy (straight lines + one simple L, little/no rotation), 2 = Normal (L/T pieces, some rotation), 3 = Hard/Extreme (asymmetric tetrominoes/pentominoes, rotation required on most pieces — Hard vs Extreme is decided by PUZZLE_LEVEL_IDS_BY_DIFFICULTY pool membership, not this field). */
  difficulty: 1 | 2 | 3
  boardCols: number
  boardRows: number
  pieces: PuzzlePieceSpec[]
  timeLimitSeconds: number
}

/** The footprint (bounding box, in cells) a piece occupies once rotated to its correct orientation — used for target-slot sizing/snap-center math. */
export function finalFootprint(piece: PuzzlePieceSpec): { width: number; height: number } {
  const rotated = rotateCells(piece.cells, piece.correctRotation)
  return {
    width: Math.max(...rotated.map(([, c]) => c)) + 1,
    height: Math.max(...rotated.map(([r]) => r)) + 1,
  }
}

/** The piece's ACTUAL occupied cells (not just its bounding box) once rotated to correctRotation — this is what the target silhouette on the board is drawn from, so it reads as the real polyomino shape rather than a solid rectangle. */
export function finalCells(piece: PuzzlePieceSpec): CellCoord[] {
  return rotateCells(piece.cells, piece.correctRotation)
}

/**
 * Whether `rotation` (the piece's current, user-controlled orientation)
 * produces the same actual shape as the target wants. Deliberately NOT a
 * raw `rotation === piece.correctRotation` check — a symmetric piece (a
 * straight line, a 2x2 square) looks identical at some rotation and
 * rotation+180 (or, for the square, at any 90° step), so it must count as
 * "fitting" the instant its silhouette matches, regardless of which of the
 * visually-equivalent rotation values the player happened to land on. Reuses
 * spatial-shapes.ts's own rotate+compare rather than re-deriving per-shape
 * symmetry rules by hand.
 */
export function rotationMatchesTarget(piece: PuzzlePieceSpec, rotation: PuzzleRotation): boolean {
  return cellsEqual(rotateCells(piece.cells, rotation), rotateCells(piece.cells, piece.correctRotation))
}

/**
 * 12 levels (spec: "최소 12개, 난이도별 최소 4개").
 *
 * 2026-08 QA 최종 보정: every piece used to be a straight rectangle (1x2 up
 * to 1x5) — no genuine polyomino shapes (L/T/S/Z/staircase/plus) existed at
 * all, which QA flagged as lacking spatial variety for a "공간감각" game.
 * Redesigned with a real polyomino palette (see the generation script
 * referenced in the QA report), ramped by tier:
 * - Easy (level-1/2): straight lines, one simple 3-cell L introduced.
 * - Normal (level-3..5): L-tromino/T-tetromino mixed in, "L/T 등 증가".
 * - Hard (level-6..8): asymmetric L/J/S/Z tetrominoes, rotation required on
 *   most pieces.
 * - Extreme (level-9..12): the same asymmetric tetrominoes plus 5-cell
 *   staircase/plus pentominoes, heaviest rotation load.
 * Every level was verified (bounds/overlap/rotation-orbit footprint
 * distinctness) by a runtime script — see the QA report for the exact
 * method; not shipped as a checked-in script, same convention as
 * spatial-shapes.ts's own scripts/verify-spatial-shapes.ts note.
 */
export const PUZZLE_LEVELS: PuzzleLevel[] = [
  {
    id: 'level-1',
    difficulty: 1,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 25,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0]], widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 3, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [2, 0]], widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 0, targetRow: 0 },
    ],
  },
  {
    id: 'level-2',
    difficulty: 1,
    boardCols: 5,
    boardRows: 4,
    timeLimitSeconds: 30,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0]], widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 4, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 0, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [1, 0], [2, 0]], widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 1, targetRow: 0 },
    ],
  },
  {
    id: 'level-3',
    difficulty: 2,
    boardCols: 6,
    boardRows: 5,
    timeLimitSeconds: 32,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 3, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 0, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [1, 0], [2, 0]], widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 5, targetRow: 0 },
    ],
  },
  {
    id: 'level-4',
    difficulty: 2,
    boardCols: 6,
    boardRows: 5,
    timeLimitSeconds: 34,
    pieces: [
      { id: 'p1', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 180, color: 'var(--stat-reasoning)', targetCol: 4, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
    ],
  },
  {
    id: 'level-5',
    difficulty: 2,
    boardCols: 6,
    boardRows: 5,
    timeLimitSeconds: 36,
    pieces: [
      { id: 'p1', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 180, color: 'var(--stat-reasoning)', targetCol: 3, targetRow: 2 },
      { id: 'p3', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], widthCells: 1, heightCells: 4, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
    ],
  },
  {
    id: 'level-6',
    difficulty: 3,
    boardCols: 7,
    boardRows: 5,
    timeLimitSeconds: 40,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 1], [1, 1], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 180, color: 'var(--stat-reasoning)', targetCol: 3, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 4, targetRow: 1 },
    ],
  },
  {
    id: 'level-7',
    difficulty: 3,
    boardCols: 7,
    boardRows: 5,
    timeLimitSeconds: 42,
    pieces: [
      { id: 'p1', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], widthCells: 3, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 270, color: 'var(--stat-judgment)', targetCol: 4, targetRow: 0 },
      { id: 'p4', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 2, targetRow: 2 },
    ],
  },
  {
    id: 'level-8',
    difficulty: 3,
    boardCols: 7,
    boardRows: 6,
    timeLimitSeconds: 44,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 1], [1, 1], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 180, color: 'var(--stat-judgment)', targetCol: 4, targetRow: 0 },
      { id: 'p4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 270, color: 'var(--stat-focus)', targetCol: 2, targetRow: 2 },
    ],
  },
  {
    id: 'level-9',
    difficulty: 3,
    boardCols: 7,
    boardRows: 6,
    timeLimitSeconds: 48,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], widthCells: 3, heightCells: 3, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 5, targetRow: 0 },
      { id: 'p3', cells: [[0, 1], [1, 1], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 180, color: 'var(--stat-judgment)', targetCol: 1, targetRow: 2 },
      { id: 'p4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 270, color: 'var(--stat-focus)', targetCol: 4, targetRow: 2 },
      { id: 'p5', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-memory)', targetCol: 2, targetRow: 3 },
      { id: 'p6', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], widthCells: 3, heightCells: 3, correctRotation: 0, color: 'var(--stat-reaction)', targetCol: 2, targetRow: 0 },
    ],
  },
  {
    id: 'level-10',
    difficulty: 3,
    boardCols: 7,
    boardRows: 6,
    timeLimitSeconds: 48,
    pieces: [
      { id: 'p1', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], widthCells: 3, heightCells: 3, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], widthCells: 3, heightCells: 3, correctRotation: 270, color: 'var(--stat-reasoning)', targetCol: 2, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 5, targetRow: 0 },
      { id: 'p4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 180, color: 'var(--stat-focus)', targetCol: 4, targetRow: 2 },
      { id: 'p5', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], widthCells: 3, heightCells: 2, correctRotation: 0, color: 'var(--stat-memory)', targetCol: 0, targetRow: 3 },
      { id: 'p6', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], widthCells: 2, heightCells: 2, correctRotation: 0, color: 'var(--stat-reaction)', targetCol: 3, targetRow: 3 },
    ],
  },
  {
    id: 'level-11',
    difficulty: 3,
    boardCols: 8,
    boardRows: 6,
    timeLimitSeconds: 50,
    pieces: [
      { id: 'p1', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], widthCells: 3, heightCells: 3, correctRotation: 180, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 6, targetRow: 0 },
      { id: 'p3', cells: [[0, 1], [1, 1], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 0, targetRow: 2 },
      { id: 'p4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 270, color: 'var(--stat-focus)', targetCol: 3, targetRow: 2 },
      { id: 'p5', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], widthCells: 3, heightCells: 3, correctRotation: 0, color: 'var(--stat-memory)', targetCol: 3, targetRow: 0 },
      { id: 'p6', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 90, color: 'var(--stat-reaction)', targetCol: 5, targetRow: 3 },
    ],
  },
  {
    id: 'level-12',
    difficulty: 3,
    boardCols: 8,
    boardRows: 6,
    timeLimitSeconds: 50,
    pieces: [
      { id: 'p1', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], widthCells: 3, heightCells: 3, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 270, color: 'var(--stat-reasoning)', targetCol: 5, targetRow: 0 },
      { id: 'p3', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], widthCells: 3, heightCells: 3, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 3, targetRow: 0 },
      { id: 'p4', cells: [[0, 1], [1, 1], [2, 0], [2, 1]], widthCells: 2, heightCells: 3, correctRotation: 90, color: 'var(--stat-focus)', targetCol: 0, targetRow: 2 },
      { id: 'p5', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], widthCells: 3, heightCells: 2, correctRotation: 180, color: 'var(--stat-memory)', targetCol: 5, targetRow: 2 },
      { id: 'p6', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], widthCells: 3, heightCells: 2, correctRotation: 0, color: 'var(--stat-reaction)', targetCol: 2, targetRow: 2 },
    ],
  },
]

/**
 * Which levels a session draws from is tied directly to the player's chosen
 * GameDifficulty tier — round count per tier (2/3/3/4) is unchanged from
 * before this piece-shape redesign; only the piece geometry inside each
 * level changed.
 */
export const PUZZLE_LEVEL_IDS_BY_DIFFICULTY: Record<GameDifficulty, string[]> = {
  easy: ['level-1', 'level-2'],
  normal: ['level-3', 'level-4', 'level-5'],
  hard: ['level-6', 'level-7', 'level-8'],
  extreme: ['level-9', 'level-10', 'level-11', 'level-12'],
}

/** Draws one session's worth of levels for `difficulty`'s own pool, order shuffled for replay variety (selection itself is fixed — see PUZZLE_LEVEL_IDS_BY_DIFFICULTY). */
export function pickFitPuzzleSession(difficulty: GameDifficulty): PuzzleLevel[] {
  const byId = new Map(PUZZLE_LEVELS.map((level) => [level.id, level]))
  const ids = PUZZLE_LEVEL_IDS_BY_DIFFICULTY[difficulty]
  const levels = ids.map((id) => byId.get(id)).filter((level): level is PuzzleLevel => level != null)
  return [...levels].sort(() => Math.random() - 0.5)
}
