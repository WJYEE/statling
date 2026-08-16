import type { JudgmentAnswer, JudgmentMappingValue, JudgmentRuleId, JudgmentRuleMapping, JudgmentStimulus } from '@/lib/game/types'

/**
 * Segments 0-1 (2-way, every tier) draw only from this pool — no triangle,
 * no 3rd dot.
 */
export const JUDGMENT_STIMULI_2WAY: JudgmentStimulus[] = [
  { shape: 'circle', dotCount: 1 },
  { shape: 'circle', dotCount: 2 },
  { shape: 'square', dotCount: 1 },
  { shape: 'square', dotCount: 2 },
]

/**
 * Segment 2+ at Hard/Extreme (3-way: Left/Mid/Right) draws from this pool —
 * a full 3x3 grid over shape x dotCount, so every shape appears with every
 * dotCount and neither can be inferred from the other.
 */
export const JUDGMENT_STIMULI_3WAY: JudgmentStimulus[] = [
  { shape: 'circle', dotCount: 1 },
  { shape: 'circle', dotCount: 2 },
  { shape: 'circle', dotCount: 3 },
  { shape: 'square', dotCount: 1 },
  { shape: 'square', dotCount: 2 },
  { shape: 'square', dotCount: 3 },
  { shape: 'triangle', dotCount: 1 },
  { shape: 'triangle', dotCount: 2 },
  { shape: 'triangle', dotCount: 3 },
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
  return a.shape === b.shape && a.dotCount === b.dotCount
}

/** The domain of values a rule's mapping needs to cover — every shape/dotCount value that can actually appear at this choiceCount. */
function mappingDomain(ruleId: JudgmentRuleId, choiceCount: 2 | 3): JudgmentMappingValue[] {
  if (ruleId === 'shape') return choiceCount === 3 ? ['circle', 'square', 'triangle'] : ['circle', 'square']
  return choiceCount === 3 ? [1, 2, 3] : [1, 2]
}

function sameMapping(
  a: JudgmentRuleMapping,
  b: { left: JudgmentMappingValue; right: JudgmentMappingValue; mid: JudgmentMappingValue | null },
): boolean {
  return a.left === b.left && a.right === b.right && a.mid === b.mid
}

/**
 * Shuffles a fresh Left/Mid/Right assignment for a rule segment — this is
 * what keeps the mapping from becoming memorizable by button position rather
 * than actually read off the Rule Banner. Generated once per segment (see
 * the game component), never per Block. Retries a few times to avoid handing
 * back the exact same permutation this rule used last time it appeared.
 */
export function generateRuleMapping(
  ruleId: JudgmentRuleId,
  choiceCount: 2 | 3,
  lastMappingForThisRule: JudgmentRuleMapping | null,
): JudgmentRuleMapping {
  const domain = mappingDomain(ruleId, choiceCount)
  const canRepeat = !lastMappingForThisRule || lastMappingForThisRule.choiceCount !== choiceCount

  for (let attempt = 0; attempt < 5; attempt++) {
    const order = shuffled(domain)
    const mapping: JudgmentRuleMapping =
      choiceCount === 3
        ? { ruleId, choiceCount, left: order[0], mid: order[1], right: order[2] }
        : { ruleId, choiceCount, left: order[0], right: order[1], mid: null }
    if (canRepeat || !sameMapping(lastMappingForThisRule, mapping)) return mapping
  }
  // Domain is small enough (2 or 6 permutations) that 5 attempts virtually
  // always succeed; fall back to whatever the last shuffle produced.
  const order = shuffled(domain)
  return choiceCount === 3
    ? { ruleId, choiceCount, left: order[0], mid: order[1], right: order[2] }
    : { ruleId, choiceCount, left: order[0], right: order[1], mid: null }
}

/**
 * The answer this mapping assigns to a stimulus, or null if the stimulus's
 * relevant value (shape or dotCount) isn't covered by this mapping's domain
 * — e.g. a 2-way Count mapping (only knows 1/2) asked about a 3-dot
 * stimulus. Null means "not comparable", not "no answer".
 */
export function computeJudgmentAnswerForMapping(mapping: JudgmentRuleMapping, stimulus: JudgmentStimulus): JudgmentAnswer | null {
  const value: JudgmentMappingValue = mapping.ruleId === 'shape' ? stimulus.shape : stimulus.dotCount
  if (mapping.left === value) return 'left'
  if (mapping.right === value) return 'right'
  if (mapping.mid === value) return 'mid'
  return null
}

/**
 * True when the currently active mapping and the immediately preceding
 * segment's mapping would disagree on this stimulus's answer — generalizes
 * "previousRuleAnswer !== currentRuleAnswer" to randomized, per-segment
 * mappings (no fixed "circle = left" style assumption). False when there's
 * no previous segment yet, or when the two mappings aren't comparable for
 * this stimulus (e.g. across a 2-way -> 3-way domain change).
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
 * or JUDGMENT_STIMULI_3WAY): `conflictCount` stimuli the caller's `isConflict`
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
