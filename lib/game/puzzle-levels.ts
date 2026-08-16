import type { GameDifficulty } from '@/lib/game/difficulty'

export type PuzzleRotation = 0 | 90

export interface PuzzlePieceSpec {
  id: string
  /** Footprint at rotation 0. Always non-square (width !== height) so 0 vs 90 is never visually ambiguous — spec §8's "대칭 조각은 방향 판별이 모호하지 않게". */
  widthCells: number
  heightCells: number
  /** Rotation the piece must be turned to before it can snap into its target. */
  correctRotation: PuzzleRotation
  color: string
  targetCol: number
  targetRow: number
}

export interface PuzzleLevel {
  id: string
  /** 1 = 3 pieces / 0-1 rotation, 2 = 4-5 pieces / 2+ rotations, 3 = 6 pieces / multiple rotations + similarly-shaped pieces. */
  difficulty: 1 | 2 | 3
  boardCols: number
  boardRows: number
  pieces: PuzzlePieceSpec[]
  timeLimitSeconds: number
}

/** The footprint (in cells) a piece occupies once rotated to its correct orientation — this is the shape drawn as the empty target silhouette. */
export function finalFootprint(piece: PuzzlePieceSpec): { width: number; height: number } {
  return piece.correctRotation === 90
    ? { width: piece.heightCells, height: piece.widthCells }
    : { width: piece.widthCells, height: piece.heightCells }
}

/**
 * 12 levels (spec: "최소 12개, 난이도별 최소 4개" — 4 per difficulty here).
 * The original 4 rounds (level-1..4) are unchanged, just tagged with a
 * difficulty; level-5..12 fill out the pool so every difficulty tier has
 * enough variety for `pickFitPuzzleSession` to draw a fresh combination
 * each playthrough. Difficulty 3 levels intentionally include
 * similarly-shaped pieces (spec: "유사한 형태 포함") that only differ by
 * which slot/rotation they belong to, so shape alone can't solve them.
 */
export const PUZZLE_LEVELS: PuzzleLevel[] = [
  {
    id: 'level-1',
    difficulty: 1,
    boardCols: 3,
    boardRows: 3,
    timeLimitSeconds: 20,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 1, targetRow: 0 },
    ],
  },
  {
    id: 'level-2',
    difficulty: 1,
    boardCols: 4,
    boardRows: 3,
    timeLimitSeconds: 25,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 1, heightCells: 2, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 2, targetRow: 2 },
    ],
  },
  {
    id: 'level-3',
    difficulty: 2,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 30,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 1, heightCells: 2, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 3 },
      { id: 'p3', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 3, targetRow: 1 },
    ],
  },
  {
    id: 'level-4',
    difficulty: 2,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 35,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 90, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 0, targetRow: 2 },
      { id: 'p3', widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 1, targetRow: 3 },
      { id: 'p4', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
    ],
  },
  {
    id: 'level-5',
    difficulty: 1,
    boardCols: 3,
    boardRows: 2,
    timeLimitSeconds: 22,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
    ],
  },
  {
    id: 'level-6',
    difficulty: 1,
    boardCols: 4,
    boardRows: 3,
    timeLimitSeconds: 22,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 2 },
      { id: 'p3', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
    ],
  },
  {
    id: 'level-7',
    difficulty: 2,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 28,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 2, heightCells: 1, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 1 },
      { id: 'p5', widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-memory)', targetCol: 0, targetRow: 2 },
    ],
  },
  {
    id: 'level-8',
    difficulty: 2,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 28,
    pieces: [
      { id: 'p1', widthCells: 2, heightCells: 1, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 2, targetRow: 0 },
      { id: 'p3', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 3, targetRow: 0 },
      { id: 'p4', widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-focus)', targetCol: 0, targetRow: 2 },
    ],
  },
  {
    id: 'level-9',
    difficulty: 3,
    boardCols: 5,
    boardRows: 3,
    timeLimitSeconds: 34,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
      { id: 'p5', widthCells: 1, heightCells: 3, correctRotation: 90, color: 'var(--stat-memory)', targetCol: 0, targetRow: 2 },
      { id: 'p6', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reaction)', targetCol: 4, targetRow: 0 },
    ],
  },
  {
    id: 'level-10',
    difficulty: 3,
    boardCols: 4,
    boardRows: 4,
    timeLimitSeconds: 34,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', widthCells: 3, heightCells: 1, correctRotation: 90, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
      { id: 'p5', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-memory)', targetCol: 0, targetRow: 2 },
      { id: 'p6', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reaction)', targetCol: 1, targetRow: 2 },
    ],
  },
  {
    id: 'level-11',
    difficulty: 3,
    boardCols: 5,
    boardRows: 3,
    timeLimitSeconds: 34,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
      { id: 'p5', widthCells: 3, heightCells: 1, correctRotation: 90, color: 'var(--stat-memory)', targetCol: 4, targetRow: 0 },
      { id: 'p6', widthCells: 1, heightCells: 2, correctRotation: 90, color: 'var(--stat-reaction)', targetCol: 0, targetRow: 2 },
    ],
  },
  {
    id: 'level-12',
    difficulty: 3,
    boardCols: 4,
    boardRows: 5,
    timeLimitSeconds: 34,
    pieces: [
      { id: 'p1', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-spatial)', targetCol: 0, targetRow: 0 },
      { id: 'p2', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-reasoning)', targetCol: 1, targetRow: 0 },
      { id: 'p3', widthCells: 2, heightCells: 1, correctRotation: 90, color: 'var(--stat-judgment)', targetCol: 2, targetRow: 0 },
      { id: 'p4', widthCells: 1, heightCells: 3, correctRotation: 0, color: 'var(--stat-focus)', targetCol: 3, targetRow: 0 },
      { id: 'p5', widthCells: 3, heightCells: 1, correctRotation: 90, color: 'var(--stat-memory)', targetCol: 0, targetRow: 2 },
      { id: 'p6', widthCells: 1, heightCells: 2, correctRotation: 0, color: 'var(--stat-reaction)', targetCol: 3, targetRow: 3 },
    ],
  },
]

/**
 * 2026-08 difficulty rework: which levels a session draws from is now tied
 * directly to the player's chosen GameDifficulty tier instead of sampling
 * across all 3 internal difficulty bands regardless of tier (the exact bug
 * this fixes — Extreme could previously draw the same levels as Easy).
 * Pools were hand-picked by actually checking each level's real
 * piece.correctRotation values, not just its `difficulty` field:
 * - easy: the only two difficulty-1 levels where NO piece needs rotation at
 *   all (level-1, level-6) — matches "회전 불필요".
 * - normal: difficulty-1/2 levels with exactly 1 rotated piece each — "회전
 *   없음 또는 매우 제한적".
 * - hard: difficulty-2 levels with 2 rotated pieces each — "일부 조각 회전
 *   필요".
 * - extreme: all 4 difficulty-3 levels (6 pieces, similarly-shaped pieces
 *   by design — see this file's earlier doc comment) — "대부분/전부 회전
 *   필요, 가장 복잡한 조각 구성".
 * Round count naturally varies by tier as a result (2/3/3/4) since each
 * pool is used in full rather than padded with repeats or trimmed.
 */
export const PUZZLE_LEVEL_IDS_BY_DIFFICULTY: Record<GameDifficulty, string[]> = {
  easy: ['level-1', 'level-6'],
  normal: ['level-2', 'level-5', 'level-3'],
  hard: ['level-4', 'level-7', 'level-8'],
  extreme: ['level-9', 'level-10', 'level-11', 'level-12'],
}

/** Draws one session's worth of levels for `difficulty`'s own pool, order shuffled for replay variety (selection itself is fixed — see PUZZLE_LEVEL_IDS_BY_DIFFICULTY). */
export function pickFitPuzzleSession(difficulty: GameDifficulty): PuzzleLevel[] {
  const byId = new Map(PUZZLE_LEVELS.map((level) => [level.id, level]))
  const ids = PUZZLE_LEVEL_IDS_BY_DIFFICULTY[difficulty]
  const levels = ids.map((id) => byId.get(id)).filter((level): level is PuzzleLevel => level != null)
  return [...levels].sort(() => Math.random() - 0.5)
}
