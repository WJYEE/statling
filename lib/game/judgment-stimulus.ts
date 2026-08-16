import type { JudgmentAnswer, JudgmentMappingValue, JudgmentRuleId, JudgmentRuleMapping, JudgmentStimulus } from '@/lib/game/types'

/**
 * Segments 0-1 (2-way, every tier) draw only from this pool — no triangle,
 * no diamond, no 3rd/4th dot, no 'up'/'down' pointer direction.
 * `pointerDirection` is assigned decorrelated from shape/dotCount (a
 * Latin-square-style pairing) so the Direction Rule can't be inferred from
 * either of the other two attributes.
 */
export const JUDGMENT_STIMULI_2WAY: JudgmentStimulus[] = [
  { shape: 'circle', dotCount: 1, pointerDirection: 'left' },
  { shape: 'circle', dotCount: 2, pointerDirection: 'right' },
  { shape: 'square', dotCount: 1, pointerDirection: 'right' },
  { shape: 'square', dotCount: 2, pointerDirection: 'left' },
]

/**
 * Segment 2+ at Hard/Extreme (genuine 4-way: Left/Up/Right/Down) draws from
 * this pool — a full 4x4 Latin square over shape x dotCount x
 * pointerDirection (directionIndex = (shapeIndex + dotCountIndex) % 4), so
 * every shape sees all 4 directions exactly once, every dotCount sees all 4
 * directions exactly once, and neither shape nor dotCount can be inferred
 * from pointerDirection (or vice versa).
 */
export const JUDGMENT_STIMULI_4WAY: JudgmentStimulus[] = [
  { shape: 'circle', dotCount: 1, pointerDirection: 'left' },
  { shape: 'circle', dotCount: 2, pointerDirection: 'up' },
  { shape: 'circle', dotCount: 3, pointerDirection: 'right' },
  { shape: 'circle', dotCount: 4, pointerDirection: 'down' },
  { shape: 'square', dotCount: 1, pointerDirection: 'up' },
  { shape: 'square', dotCount: 2, pointerDirection: 'right' },
  { shape: 'square', dotCount: 3, pointerDirection: 'down' },
  { shape: 'square', dotCount: 4, pointerDirection: 'left' },
  { shape: 'triangle', dotCount: 1, pointerDirection: 'right' },
  { shape: 'triangle', dotCount: 2, pointerDirection: 'down' },
  { shape: 'triangle', dotCount: 3, pointerDirection: 'left' },
  { shape: 'triangle', dotCount: 4, pointerDirection: 'up' },
  { shape: 'diamond', dotCount: 1, pointerDirection: 'down' },
  { shape: 'diamond', dotCount: 2, pointerDirection: 'left' },
  { shape: 'diamond', dotCount: 3, pointerDirection: 'up' },
  { shape: 'diamond', dotCount: 4, pointerDirection: 'right' },
]

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function sameStimulus(a: JudgmentStimulus, b: JudgmentStimulus): boolean {
  return a.shape === b.shape && a.dotCount === b.dotCount && a.pointerDirection === b.pointerDirection
}

/** The domain of values a rule's mapping needs to cover — every shape/dotCount/pointerDirection value that can actually appear at this choiceCount. */
function mappingDomain(ruleId: JudgmentRuleId, choiceCount: 2 | 4): JudgmentMappingValue[] {
  if (ruleId === 'shape') return choiceCount === 4 ? ['circle', 'square', 'triangle', 'diamond'] : ['circle', 'square']
  if (ruleId === 'direction') return choiceCount === 4 ? ['left', 'up', 'right', 'down'] : ['left', 'right']
  return choiceCount === 4 ? [1, 2, 3, 4] : [1, 2]
}

function sameMapping(
  a: JudgmentRuleMapping,
  b: { left: JudgmentMappingValue; right: JudgmentMappingValue; up: JudgmentMappingValue | null; down: JudgmentMappingValue | null },
): boolean {
  return a.left === b.left && a.right === b.right && a.up === b.up && a.down === b.down
}

/**
 * Shuffles a fresh Left/Up/Right/Down assignment for a rule segment — this is
 * what keeps the mapping from becoming memorizable by button position rather
 * than actually read off the Rule Banner. Generated once per segment (see
 * the game component), never per Block. Retries a few times to avoid handing
 * back the exact same permutation this rule used last time it appeared.
 */
export function generateRuleMapping(
  ruleId: JudgmentRuleId,
  choiceCount: 2 | 4,
  lastMappingForThisRule: JudgmentRuleMapping | null,
): JudgmentRuleMapping {
  const domain = mappingDomain(ruleId, choiceCount)
  const canRepeat = !lastMappingForThisRule || lastMappingForThisRule.choiceCount !== choiceCount

  for (let attempt = 0; attempt < 5; attempt++) {
    const order = shuffled(domain)
    const mapping: JudgmentRuleMapping =
      choiceCount === 4
        ? { ruleId, choiceCount, left: order[0], up: order[1], right: order[2], down: order[3] }
        : { ruleId, choiceCount, left: order[0], right: order[1], up: null, down: null }
    if (canRepeat || !sameMapping(lastMappingForThisRule, mapping)) return mapping
  }
  // Domain is small enough (2 or 24 permutations) that 5 attempts virtually
  // always succeed; fall back to whatever the last shuffle produced.
  const order = shuffled(domain)
  return choiceCount === 4
    ? { ruleId, choiceCount, left: order[0], up: order[1], right: order[2], down: order[3] }
    : { ruleId, choiceCount, left: order[0], right: order[1], up: null, down: null }
}

/**
 * The answer this mapping assigns to a stimulus, or null if the stimulus's
 * relevant value (shape or dotCount) isn't covered by this mapping's domain
 * — e.g. a 2-way Count mapping (only knows 1/2) asked about a 3-dot
 * stimulus. Null means "not comparable", not "no answer".
 */
export function computeJudgmentAnswerForMapping(mapping: JudgmentRuleMapping, stimulus: JudgmentStimulus): JudgmentAnswer | null {
  const value: JudgmentMappingValue =
    mapping.ruleId === 'shape' ? stimulus.shape : mapping.ruleId === 'direction' ? stimulus.pointerDirection : stimulus.dotCount
  if (mapping.left === value) return 'left'
  if (mapping.right === value) return 'right'
  if (mapping.up === value) return 'up'
  if (mapping.down === value) return 'down'
  return null
}

/**
 * True when the currently active mapping and the immediately preceding
 * segment's mapping would disagree on this stimulus's answer — generalizes
 * "previousRuleAnswer !== currentRuleAnswer" to randomized, per-segment
 * mappings (no fixed "circle = left" style assumption). False when there's
 * no previous segment yet, or when the two mappings aren't comparable for
 * this stimulus (e.g. across a 2-way -> 4-way domain change).
 */
export function isConflictStimulus(
  stimulus: JudgmentStimulus,
  currentMapping: JudgmentRuleMapping,
  previousMapping: JudgmentRuleMapping | null,
): boolean {
  if (!previousMapping) return false
  const currentAnswer = computeJudgmentAnswerForMapping(currentMapping, stimulus)
  const previousAnswer = computeJudgmentAnswerForMapping(previousMapping, stimulus)
  if (currentAnswer === null || previousAnswer === null) return false
  return currentAnswer !== previousAnswer
}

/**
 * Picks a Conflict-stimulus count for one segment, targeting a random ratio
 * inside [ratioMin, ratioMax] rather than a fixed share, so segments feel
 * varied while staying in a controlled band — the band itself narrows for
 * early segments per the Difficulty Ramp in judgment.config.ts. Clamped to
 * leave at least 1 Congruent stimulus always, and at least 1 Conflict
 * stimulus unless ratioMax is 0 (segment 0, where Conflict is impossible
 * anyway since there's no previous segment to conflict against).
 */
export function pickSegmentConflictCount(segmentLength: number, ratioMin: number, ratioMax: number): number {
  const ratio = ratioMin + Math.random() * (ratioMax - ratioMin)
  const floor = ratioMax <= 0 ? 0 : 1
  return Math.min(segmentLength - 1, Math.max(floor, Math.round(segmentLength * ratio)))
}

/**
 * Builds one segment's stimulus order from the given pool (JUDGMENT_STIMULI_2WAY
 * or JUDGMENT_STIMULI_4WAY): `conflictCount` stimuli the caller's `isConflict`
 * classifier flags as Conflict-type plus the rest Congruent, shuffled, with a
 * bounded number of reshuffles if the same stimulus would otherwise land
 * back-to-back. If the segment has no Conflict-type stimuli available (e.g.
 * the very first segment, with no previous mapping to conflict against),
 * the full segment is filled from the Congruent pool instead.
 */
export function generateBlockStimuli(
  pool: JudgmentStimulus[],
  trialsPerBlock: number,
  conflictCount: number,
  isConflict: (stimulus: JudgmentStimulus) => boolean,
): JudgmentStimulus[] {
  const conflictPool = pool.filter(isConflict)
  const congruentPool = pool.filter((s) => !isConflict(s))
  const actualConflictCount = conflictPool.length === 0 ? 0 : Math.min(conflictCount, trialsPerBlock)
  const congruentCount = trialsPerBlock - actualConflictCount

  const pickN = (candidatePool: JudgmentStimulus[], n: number): JudgmentStimulus[] =>
    candidatePool.length === 0 ? [] : Array.from({ length: n }, (_, i) => candidatePool[i % candidatePool.length])

  const picked = [...pickN(conflictPool, actualConflictCount), ...pickN(congruentPool, congruentCount)]

  let order = shuffled(picked)
  for (let attempt = 0; attempt < 10; attempt++) {
    const hasAdjacentRepeat = order.some((s, i) => i > 0 && sameStimulus(s, order[i - 1]))
    if (!hasAdjacentRepeat) break
    order = shuffled(picked)
  }
  return order
}
