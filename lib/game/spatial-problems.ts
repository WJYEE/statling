import {
  SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER,
  SPATIAL_LEVELS,
  SPATIAL_OPTION_COUNT,
  getSpatialLevelDistractorTypesForDifficulty,
  getSpatialQuestionsPerLevelForDifficulty,
} from '@/lib/config/spatial.config'
import type { GameDifficulty } from '@/lib/game/difficulty'
import {
  MIRROR_PARTNER_ID,
  SHAPE_BY_ID,
  SPATIAL_SHAPE_POOL,
  cellsSignature,
  normalizeCells,
  rotateCells,
  shapeIdsInTier,
  type CellCoord,
  type SpatialShapeTier,
} from '@/lib/game/spatial-shapes'
import type { SpatialDistractorType, SpatialRotationAngle } from '@/lib/game/types'

export interface GeneratedSpatialOption {
  shapeId: string
  rotationAngle: SpatialRotationAngle
  isMirrored: boolean
  isCorrect: boolean
  distractorType: SpatialDistractorType | null
  cells: CellCoord[]
}

export interface GeneratedSpatialQuestion {
  difficultyLevel: number
  referenceShapeId: string
  referenceCells: CellCoord[]
  correctRotationAngle: SpatialRotationAngle
  mirrorIncluded: boolean
  options: GeneratedSpatialOption[]
  correctOptionIndex: number
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Reorders an already-shuffled id list so ids NOT in `avoid` sort before ids
 * that are — used by generateSpatialSession's `avoidShapeIds` param to bias
 * a retry's shape sampling away from whatever the stat's first Initial
 * Assessment attempt already showed, without ever making a shape flat-out
 * unavailable (the whole pool is only 12 shapes — a hard exclusion could
 * easily leave too few candidates for a level, especially the 2-shape
 * 'simple' tier). A stable partition, not a re-sort: relative order within
 * each half is left exactly as `shuffled` produced it.
 */
function preferUnseen(ids: string[], avoid: ReadonlySet<string>): string[] {
  return [...ids.filter((id) => !avoid.has(id)), ...ids.filter((id) => avoid.has(id))]
}

/** The correct option's rotation is always one of 90/180/270 — a 0° "already matching" card would let the user solve by simple visual comparison instead of Mental Rotation. */
function pickCorrectRotation(): SpatialRotationAngle {
  const angles: SpatialRotationAngle[] = [90, 180, 270]
  return angles[Math.floor(Math.random() * angles.length)]
}

/** Distractor rotation can be anything, including 0 — it's filler, not the thing being tested. */
function pickAnyRotation(): SpatialRotationAngle {
  const angles: SpatialRotationAngle[] = [0, 90, 180, 270]
  return angles[Math.floor(Math.random() * angles.length)]
}

/**
 * Picks a shape id for one distractor slot. 'mirror' always resolves to the
 * correct shape's registered mirror partner (a verified transform, not a new
 * shape). 'similar' draws from the correct shape's own tier (same rough
 * size/complexity); 'unrelated' draws from the whole pool.
 *
 * `usedInQuestion` is a HARD exclusion — a shape already chosen for one of
 * THIS question's other options can never be picked again, full stop
 * (otherwise two options could render as the identical shape). `usedInSession`
 * is a SOFT preference to avoid a shape that already appeared earlier this
 * session; it's relaxed (but `usedInQuestion` never is) if that would
 * otherwise leave no candidates, since the pools are small.
 */
function pickDistractorShapeId(
  type: SpatialDistractorType,
  correctShapeId: string,
  correctTier: SpatialShapeTier,
  usedInQuestion: Set<string>,
  usedInSession: Set<string>,
): string {
  const mirrorId = MIRROR_PARTNER_ID[correctShapeId]
  if (type === 'mirror') return mirrorId

  const candidatePool = type === 'similar' ? shapeIdsInTier(correctTier) : SPATIAL_SHAPE_POOL.map((s) => s.id)
  const hardExcluded = new Set([correctShapeId, mirrorId, ...usedInQuestion])
  const fresh = candidatePool.filter((id) => !hardExcluded.has(id) && !usedInSession.has(id))
  const fallback = candidatePool.filter((id) => !hardExcluded.has(id))
  const pool = fresh.length > 0 ? fresh : fallback
  return pool[Math.floor(Math.random() * pool.length)]
}

function shuffleOptionsPreservingCorrectIndex(
  options: GeneratedSpatialOption[],
): { options: GeneratedSpatialOption[]; correctIndex: number } {
  const order = shuffled(options.map((_, i) => i))
  const reordered = order.map((i) => options[i])
  return { options: reordered, correctIndex: reordered.findIndex((o) => o.isCorrect) }
}

/**
 * Dev-time static check (module load, non-production only): verifies every
 * SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER entry is actually satisfiable
 * against the real shape pool topology, so a bad config throws a clear,
 * actionable error here instead of a cryptic "Cannot read properties of
 * undefined (reading 'cells')" deep inside pickDistractorShapeId the next
 * time that tier/level combo happens to get rolled (this is exactly how
 * Hard's Level 1 crashed on every entry — see spatial.config.ts's doc
 * comment on SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER). Level 1 always draws
 * from the 'simple' tier (2 shapes, each other's sole mirror partner); every
 * other level draws from 'complex' (10 shapes).
 */
function assertDistractorTypesFeasible(): void {
  const difficulties = Object.keys(SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER) as GameDifficulty[]
  for (const difficulty of difficulties) {
    const byLevel = SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER[difficulty]
    for (const level of SPATIAL_LEVELS) {
      const types = byLevel[level]
      if (!types) continue
      const tier: SpatialShapeTier = level === 1 ? 'simple' : 'complex'
      const poolSize = shapeIdsInTier(tier).length

      const mirrorCount = types.filter((t) => t === 'mirror').length
      if (mirrorCount > 1) {
        throw new Error(
          `Spatial config error: ${difficulty} level ${level} requests 'mirror' ${mirrorCount} times, but each shape has exactly one mirror partner — repeats can only collide, never add difficulty.`,
        )
      }

      const similarCount = types.filter((t) => t === 'similar').length
      const similarCandidates = poolSize - 2 // minus the correct shape itself and its mirror partner, both always hard-excluded
      if (similarCount > similarCandidates) {
        throw new Error(
          `Spatial config error: ${difficulty} level ${level} requests 'similar' ${similarCount} times, but the '${tier}' tier only has ${Math.max(0, similarCandidates)} valid candidate(s) after excluding the correct shape and its mirror.`,
        )
      }
    }
  }
}
if (process.env.NODE_ENV !== 'production') assertDistractorTypesFeasible()

/**
 * Dev-time safety net (GAME_SPEC §73's exact concerns): asserts exactly one
 * correct option, and that all 4 options render as pairwise-distinct
 * shapes. Should never actually fire given the pool-wide verification in
 * scripts/verify-spatial-shapes.ts, but throwing loudly here is cheap
 * insurance against a future pool edit silently breaking that guarantee.
 */
function validateQuestion(question: GeneratedSpatialQuestion): void {
  if (question.options.length !== SPATIAL_OPTION_COUNT) {
    throw new Error(`Spatial question has ${question.options.length} options, expected ${SPATIAL_OPTION_COUNT}`)
  }
  const correctCount = question.options.filter((o) => o.isCorrect).length
  if (correctCount !== 1) {
    throw new Error(`Spatial question has ${correctCount} correct options, expected exactly 1`)
  }
  const signatures = new Set(question.options.map((o) => cellsSignature(o.cells)))
  if (signatures.size !== question.options.length) {
    throw new Error('Spatial question has two options that render as the same shape')
  }
}

function buildQuestion(
  difficultyLevel: number,
  correctShapeId: string,
  distractorTypes: SpatialDistractorType[],
  usedShapeIds: Set<string>,
  fixedCorrectRotation?: SpatialRotationAngle,
): GeneratedSpatialQuestion {
  const correctShape = SHAPE_BY_ID[correctShapeId]
  const correctRotation = fixedCorrectRotation ?? pickCorrectRotation()
  const usedInQuestion = new Set<string>([correctShapeId])

  const options: GeneratedSpatialOption[] = [
    {
      shapeId: correctShapeId,
      rotationAngle: correctRotation,
      isMirrored: false,
      isCorrect: true,
      distractorType: null,
      cells: rotateCells(correctShape.cells, correctRotation),
    },
  ]

  for (const type of distractorTypes) {
    const shapeId = pickDistractorShapeId(type, correctShapeId, correctShape.tier, usedInQuestion, usedShapeIds)
    usedInQuestion.add(shapeId)
    usedShapeIds.add(shapeId)
    const rotation = pickAnyRotation()
    options.push({
      shapeId,
      rotationAngle: rotation,
      isMirrored: type === 'mirror',
      isCorrect: false,
      distractorType: type,
      cells: rotateCells(SHAPE_BY_ID[shapeId].cells, rotation),
    })
  }

  const { options: shuffledOptions, correctIndex } = shuffleOptionsPreservingCorrectIndex(options)

  const question: GeneratedSpatialQuestion = {
    difficultyLevel,
    referenceShapeId: correctShapeId,
    referenceCells: normalizeCells(correctShape.cells),
    correctRotationAngle: correctRotation,
    mirrorIncluded: distractorTypes.includes('mirror'),
    options: shuffledOptions,
    correctOptionIndex: correctIndex,
  }

  validateQuestion(question)
  return question
}

/**
 * Builds the real session for `difficulty`'s own question count (see
 * lib/config/spatial.config.ts#SPATIAL_QUESTIONS_PER_LEVEL_BY_TIER — 3 to 5
 * questions depending on tier): Level 1 draws 1 'simple' (tetromino) shape;
 * Levels 2-4 sample distinct 'complex' (pentomino) shapes without
 * replacement across the whole session per each Level's own per-tier count
 * — no base shape is ever the correct answer twice in one session.
 *
 * `avoidShapeIds` — used only for a stat's 1 Initial-Assessment retry (see
 * game-flow.tsx's spatialFirstAttemptShapeIdsRef): every shape id (reference
 * AND every option, correct or distractor) the player's first attempt
 * already showed. Biases both which shapes get picked as this retry's
 * correct answers (via preferUnseen) and which shapes pickDistractorShapeId
 * reaches for (by seeding usedShapeIds below) — a soft preference, not a
 * hard exclusion, since the pool is only 12 shapes total and the 'simple'
 * tier alone has just 2, so "avoid everything already seen" could easily be
 * infeasible. Defaults to empty (a normal first attempt has nothing to avoid).
 */
export function generateSpatialSession(
  difficulty: GameDifficulty,
  avoidShapeIds: ReadonlySet<string> = new Set(),
): GeneratedSpatialQuestion[] {
  const questionsPerLevel = getSpatialQuestionsPerLevelForDifficulty(difficulty)
  const distractorTypesPerLevel = getSpatialLevelDistractorTypesForDifficulty(difficulty)

  const simpleShapeIds = preferUnseen(shuffled(shapeIdsInTier('simple')), avoidShapeIds)
  const totalComplexNeeded = SPATIAL_LEVELS.filter((level) => level !== 1).reduce(
    (sum, level) => sum + questionsPerLevel[level],
    0,
  )
  const complexShapeIds = preferUnseen(shuffled(shapeIdsInTier('complex')), avoidShapeIds).slice(
    0,
    totalComplexNeeded,
  )

  // Seeded with avoidShapeIds so pickDistractorShapeId's own usedInSession
  // soft-preference (see its doc comment) also leans away from whatever the
  // first attempt already showed, not just the correct/reference shapes above.
  const usedShapeIds = new Set<string>(avoidShapeIds)
  const questions: GeneratedSpatialQuestion[] = []
  let complexCursor = 0

  for (const level of SPATIAL_LEVELS) {
    const countForLevel = questionsPerLevel[level]
    const shapeIdsForLevel =
      level === 1
        ? simpleShapeIds.slice(0, countForLevel)
        : complexShapeIds.slice(complexCursor, complexCursor + countForLevel)
    if (level !== 1) complexCursor += countForLevel

    for (const shapeId of shapeIdsForLevel) {
      usedShapeIds.add(shapeId)
      questions.push(buildQuestion(level, shapeId, distractorTypesPerLevel[level], usedShapeIds))
    }
  }
  return questions
}

/** Tutorial 1 — simple shape, fixed 90° rotation, no Mirror: "회전은 같은 도형이에요." Discarded from scoring. */
export function buildTutorialQuestion1(): GeneratedSpatialQuestion {
  return buildQuestion(0, 'tetro-l', ['unrelated', 'unrelated', 'unrelated'], new Set(['tetro-l']), 90)
}

/** Tutorial 2 — same shape, same fixed rotation, but one option is now the true Mirror: "거울에 비친 모양은 다른 도형이에요." Discarded from scoring. */
export function buildTutorialQuestion2(): GeneratedSpatialQuestion {
  return buildQuestion(0, 'tetro-l', ['mirror', 'unrelated', 'unrelated'], new Set(['tetro-l']), 90)
}
