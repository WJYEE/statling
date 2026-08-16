export type FocusShape = 'star' | 'diamond' | 'circle' | 'square' | 'triangle'

export interface FocusSymbolSpec {
  shape: FocusShape
  rotationDeg: number
  hasDot: boolean
  /** True = the dot sits slightly off-center (Lv4's subtle structural tell). */
  dotOffset: boolean
}

export const ALL_FOCUS_SHAPES: FocusShape[] = ['star', 'diamond', 'circle', 'square', 'triangle']

/**
 * Builds the one thing to find, fixed for the entire session — Focus
 * measures sustained selective attention to a constant target, never a
 * changing rule (that's Judgment's job, not Focus's). `shape` used to be
 * hardcoded to always 'star'; it's now picked once per session from
 * FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY (lib/config/focus.config.ts) —
 * Easy always still gets 'star' (unchanged feel), Hard+ can land on any of
 * the 5 shapes.
 */
export function buildFocusTargetSymbol(shape: FocusShape): FocusSymbolSpec {
  return { shape, rotationDeg: 0, hasDot: true, dotOffset: false }
}

/** Each shape's "visually adjacent" cousin — the Lv2 distractor pick, generalized so it works for any target shape, not just the old star-only target. */
const NEAR_SHAPE: Record<FocusShape, FocusShape> = {
  star: 'diamond',
  diamond: 'star',
  circle: 'square',
  square: 'circle',
  triangle: 'diamond',
}

function randomRightAngle(): number {
  return Math.floor(Math.random() * 4) * 90
}

/**
 * Distractor appearance by similarity level, relative to `targetShape`
 * (whichever shape this session's target actually is — see
 * buildFocusTargetSymbol). Never color-only (GAME_SPEC: display/color-vision
 * differences shouldn't drive the difficulty):
 * Lv1 — an unrelated shape family entirely (not the target's own near-shape either).
 * Lv2 — the target's "near shape" (NEAR_SHAPE), same general silhouette family.
 * Lv3 — identical shape to the target, just missing the target's inner dot.
 * Lv4 — identical shape + dot, but the dot sits slightly off-center — a real
 *       structural difference that rewards close inspection, not a color trick.
 */
export function generateDistractorSymbol(targetShape: FocusShape, similarityLevel: number): FocusSymbolSpec {
  if (similarityLevel <= 1) {
    const nearShape = NEAR_SHAPE[targetShape]
    const farShapes = ALL_FOCUS_SHAPES.filter((s) => s !== targetShape && s !== nearShape)
    const shape = farShapes[Math.floor(Math.random() * farShapes.length)]
    return { shape, rotationDeg: randomRightAngle(), hasDot: false, dotOffset: false }
  }
  if (similarityLevel === 2) {
    return { shape: NEAR_SHAPE[targetShape], rotationDeg: randomRightAngle(), hasDot: false, dotOffset: false }
  }
  if (similarityLevel === 3) {
    return { shape: targetShape, rotationDeg: 0, hasDot: false, dotOffset: false }
  }
  return { shape: targetShape, rotationDeg: 0, hasDot: true, dotOffset: true }
}
