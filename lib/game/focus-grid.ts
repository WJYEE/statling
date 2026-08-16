import { allCellIds } from '@/lib/game/memory-grid'
import { generateDistractorSymbol, type FocusSymbolSpec } from '@/lib/game/focus-symbol'

function shuffled(cells: string[]): string[] {
  const result = [...cells]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export interface FocusLayout {
  occupiedCells: string[]
  targetCellId: string | null
}

/**
 * A round's grid layout AND its per-cell symbols, bundled into one value set
 * by one function call. Building both together (instead of as two separate
 * pieces of state) makes it structurally impossible for "which cells are
 * occupied" and "what symbol is in each cell" to ever end up describing two
 * different rounds — the bug that could previously surface as an
 * active-looking cell with no symbol inside it.
 */
export interface FocusRoundView {
  gridSize: number
  targetPresent: boolean
  occupiedCells: string[]
  targetCellId: string | null
  symbols: Record<string, FocusSymbolSpec>
}

/**
 * Randomly places the target (if present) among distractorCount distractor
 * cells within a gridSize x gridSize grid (Tutorial and Real use different
 * fixed sizes — see FOCUS_TUTORIAL_GRID_SIZE / FOCUS_REAL_GRID_SIZE). Unlike
 * Memory's target-cell picker, Focus doesn't need a "too regular pattern"
 * filter — the cognitive task here is visual discrimination among
 * simultaneous symbols, not memorizing a layout, so uniform random placement
 * is sufficient and keeps this simple.
 */
export function generateFocusLayout(
  gridSize: number,
  distractorCount: number,
  targetPresent: boolean,
): FocusLayout {
  const neededCount = distractorCount + (targetPresent ? 1 : 0)
  const occupiedCells = shuffled(allCellIds(gridSize)).slice(0, neededCount)
  const targetCellId = targetPresent ? occupiedCells[0] : null
  return { occupiedCells, targetCellId }
}

/**
 * Builds a full round's view — layout AND symbols together, validated before
 * being handed back — in one call. Always use this (not generateFocusLayout
 * directly) when setting up a round to play. `targetSymbol` is this
 * session's actual target (see lib/game/focus-symbol.ts#buildFocusTargetSymbol) —
 * passed in rather than assumed, since which shape is the target now varies
 * by the player's chosen difficulty tier.
 */
export function buildFocusRound(
  gridSize: number,
  distractorCount: number,
  targetPresent: boolean,
  similarityLevel: number,
  targetSymbol: FocusSymbolSpec,
): FocusRoundView {
  const layout = generateFocusLayout(gridSize, distractorCount, targetPresent)

  const symbols: Record<string, FocusSymbolSpec> = {}
  layout.occupiedCells.forEach((cellId) => {
    symbols[cellId] = cellId === layout.targetCellId ? targetSymbol : generateDistractorSymbol(targetSymbol.shape, similarityLevel)
  })

  const view: FocusRoundView = {
    gridSize,
    targetPresent,
    occupiedCells: layout.occupiedCells,
    targetCellId: layout.targetCellId,
    symbols,
  }

  validateFocusRoundView(view, distractorCount, targetPresent)
  return view
}

/**
 * Dev-time safety net: occupied cell count matches distractorCount (+1 for
 * the Target), the Target is present exactly 0 or 1 times and always among
 * the occupied cells, no cell id repeats, and every single occupied cell has
 * a real symbol assigned. Throws loudly rather than silently rendering a
 * blank-looking active cell.
 */
export function validateFocusRoundView(
  view: FocusRoundView,
  expectedDistractorCount: number,
  targetPresent: boolean,
): void {
  const expectedOccupiedCount = expectedDistractorCount + (targetPresent ? 1 : 0)
  if (view.occupiedCells.length !== expectedOccupiedCount) {
    throw new Error(
      `Focus round has ${view.occupiedCells.length} occupied cells, expected ${expectedOccupiedCount}`,
    )
  }
  if (new Set(view.occupiedCells).size !== view.occupiedCells.length) {
    throw new Error('Focus round has a duplicate occupied cell id')
  }
  if (targetPresent) {
    if (view.targetCellId === null) {
      throw new Error('Focus round expected a Target but targetCellId is null')
    }
    if (!view.occupiedCells.includes(view.targetCellId)) {
      throw new Error('Focus round targetCellId is not among its own occupied cells')
    }
  } else if (view.targetCellId !== null) {
    throw new Error('Focus round has a targetCellId even though targetPresent is false')
  }
  for (const cellId of view.occupiedCells) {
    if (!view.symbols[cellId]) {
      throw new Error(`Focus round occupied cell ${cellId} has no symbol assigned`)
    }
  }
  if (Object.keys(view.symbols).length !== view.occupiedCells.length) {
    throw new Error('Focus round symbol map does not match occupied cells 1:1')
  }
}
