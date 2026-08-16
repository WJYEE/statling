import { DIFFICULTY_TIME_MULTIPLIER } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { SpatialDistractorType } from '@/lib/game/types'

/** Spatial ("2D Mental Rotation") tuning constants — GAME_SPEC §64-73. */
/**
 * v2: gameScore reworked to accuracy 60% + mirror 20% + time 15% + timeout
 * 5%, clamped 0-100 (was an unbounded ~800+-scale formula).
 * v3 (2026-08 difficulty rework): question count AND distractor-type mix
 * both now vary by tier (SPATIAL_QUESTIONS_PER_LEVEL_BY_TIER /
 * SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER) instead of one shared table —
 * Hard/Extreme lean on mirror distractors much more heavily and see more
 * questions at the hardest levels. 3D/isometric rotation is explicitly OUT
 * of scope this rework (kept as a documented future extension) — this stays
 * 2D, same shape-pool/rendering as before.
 */
export const SPATIAL_GAME_VERSION = 'spatial_v3'

export const SPATIAL_LEVELS = [1, 2, 3, 4] as const

/**
 * Real question count per Level, per tier. Easy/Normal keep the original
 * compressed 1/0/1/1 (3 total) sequence; Hard adds one more Level-4
 * question (4 total), Extreme adds one more at both Level 3 and 4 (5
 * total) — the hardest levels get more exposure rather than the whole
 * session simply getting longer uniformly.
 */
export const SPATIAL_QUESTIONS_PER_LEVEL_BY_TIER: Record<GameDifficulty, Record<number, number>> = {
  easy: { 1: 1, 2: 0, 3: 1, 4: 1 },
  normal: { 1: 1, 2: 0, 3: 1, 4: 1 },
  hard: { 1: 1, 2: 0, 3: 1, 4: 2 },
  extreme: { 1: 1, 2: 0, 3: 2, 4: 2 },
}

export function getSpatialQuestionsPerLevelForDifficulty(difficulty: GameDifficulty): Record<number, number> {
  return SPATIAL_QUESTIONS_PER_LEVEL_BY_TIER[difficulty]
}

export function getSpatialQuestionCountForDifficulty(difficulty: GameDifficulty): number {
  const perLevel = SPATIAL_QUESTIONS_PER_LEVEL_BY_TIER[difficulty]
  return SPATIAL_LEVELS.reduce((sum, level) => sum + perLevel[level], 0)
}

/**
 * Per-question time limit by Level — GAME_SPEC's "8~12초, 난이도에 따라 조정"
 * narrowed to a concrete 4-step schedule. A per-question timer (not a global
 * Time Attack like Judgment) fits Spatial best: the signature skill here is
 * accurate mental rotation, not continuous throughput, so each question gets
 * real thinking time while still preventing unbounded trial-and-error.
 */
export const SPATIAL_TIME_LIMIT_MS: Record<number, number> = {
  1: 10_000,
  2: 9_000,
  3: 8_000,
  4: 7_000,
}

/** SPATIAL_TIME_LIMIT_MS[level] scaled by the shared game-wide difficulty tier (DIFFICULTY_TIME_MULTIPLIER) — at 'normal' this is exactly SPATIAL_TIME_LIMIT_MS[level]. */
export function getSpatialTimeLimitForDifficulty(level: number, difficulty: GameDifficulty): number {
  return Math.round(SPATIAL_TIME_LIMIT_MS[level] * DIFFICULTY_TIME_MULTIPLIER[difficulty])
}

/**
 * Difficulty weights for difficultyWeightedAccuracy / Score — draft values,
 * easy to retune after Beta data (GAME_SPEC §128 rule 14). Deliberately NOT
 * varied by rotation angle (90°/180°/270° are treated as equally hard) —
 * only difficultyLevel drives this weight.
 */
export const SPATIAL_DIFFICULTY_WEIGHTS: Record<number, number> = {
  1: 1.0,
  2: 1.3,
  3: 1.6,
  4: 2.0,
}

/**
 * Which 3 distractor types fill a question's non-correct options, by Level
 * AND tier — GAME_SPEC §68's 4-step progression, now scaled per tier: Easy
 * stays gentle even at Level 4 (still mostly unrelated/similar), Normal
 * introduces mirror only at Level 4, Hard leans on mirror from Level 3
 * onward, Extreme is mirror-heavy across the board — "가장 헷갈리는 2D
 * 문제" per the design brief.
 *
 * Two hard pool-topology constraints, both enforced by a dev-time assertion
 * in lib/game/spatial-problems.ts (assertDistractorTypesFeasible):
 * - Level 1 draws from the 'simple' tier, which has only 2 shapes and they
 *   are each other's sole mirror partner — after excluding the correct
 *   shape and its mirror, 0 candidates remain for a 'similar' distractor
 *   (this used to crash Hard/Extreme's very first question with "Cannot
 *   read properties of undefined (reading 'cells')" — 2026-08 QA 2차 보정).
 *   Level 1 can carry at most one 'mirror' distractor (see below) plus
 *   'unrelated' — never 'similar'.
 * - 'mirror' always resolves to one single fixed shape id (a shape's one
 *   registered partner) — requesting it more than once in the same
 *   question's distractor list doesn't add difficulty, it risks two options
 *   silently rendering as the same shape at the same rotation (this used to
 *   affect Hard's Level 4 and Extreme's Level 3/4).
 */
export const SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER: Record<GameDifficulty, Record<number, SpatialDistractorType[]>> = {
  easy: {
    1: ['unrelated', 'unrelated', 'unrelated'],
    3: ['unrelated', 'unrelated', 'similar'],
    4: ['similar', 'unrelated', 'unrelated'],
  },
  normal: {
    1: ['unrelated', 'unrelated', 'unrelated'],
    3: ['similar', 'similar', 'unrelated'],
    4: ['mirror', 'similar', 'unrelated'],
  },
  hard: {
    1: ['mirror', 'unrelated', 'unrelated'],
    3: ['mirror', 'similar', 'similar'],
    4: ['mirror', 'similar', 'similar'],
  },
  extreme: {
    1: ['mirror', 'unrelated', 'unrelated'],
    3: ['mirror', 'similar', 'similar'],
    4: ['mirror', 'similar', 'similar'],
  },
}

export function getSpatialLevelDistractorTypesForDifficulty(difficulty: GameDifficulty): Record<number, SpatialDistractorType[]> {
  return SPATIAL_LEVEL_DISTRACTOR_TYPES_BY_TIER[difficulty]
}

export const SPATIAL_OPTION_COUNT = 4

/** How long the per-question correct/wrong/timeout feedback (with the correct-answer highlight) stays up before advancing. */
export const SPATIAL_FEEDBACK_MS = 750
/** How long the Tutorial → Tutorial / Tutorial → Real transition message stays up — raised from 1100ms to 2200ms so the rule callout was actually readable, then trimmed back down ~1s once the callout got its own persistent reminder alongside it, then trimmed again for touch responsiveness (this stage has nothing tappable, so it's pure "next round" filler). */
export const SPATIAL_TUTORIAL_TRANSITION_MS = 800

/**
 * Spatial ("회전 도형 찾기") Game Score — measures 공간 인지 능력(주어진
 * 도형이 회전했을 때 같은 모양인지 즉시 알아보는 능력). normalizedScore =
 * 정확도 60% + 거울상 정확도 20% + 반응속도 15% + Timeout 5%, clampScore
 * 0-100. 우선순위(정확도 > 거울상 정확도 > 반응속도 > Timeout)를 판단력과
 * 동일한 구조(명시적 퍼센트 가중치, 암묵적 스케일 상수 아님)로 표현한다.
 * mirrorAccuracy는 거울상 도형(반전) 구분이라는 공간감각 특화 하위 능력을
 * 별도 지표로 뽑아낸 것 — difficultyWeightedAccuracy가 이미 "그 문제를
 * 맞았는지"는 반영하지만 "거울상 오답에 특히 잘 속는지"는 구분하지 못하므로
 * 중복이 아니다(판단력의 switch/conflictAccuracy와 같은 논리).
 */
export const SPATIAL_SCORE_WEIGHTS = {
  /** difficultyWeightedAccuracy (0-1) × this — the dominant term. */
  accuracyWeight: 60,
  /** mirrorAccuracy (0-1) × this — Spatial's signature sub-skill. */
  mirrorWeight: 20,
  /** timeScore(0-1, scoreFromReactionTime 결과) × this. */
  timeWeight: 15,
  /** timeoutScore(0-1, 시간초과 안 한 비율) × this. */
  timeoutWeight: 5,
}

/** averageResponseTimeMs가 이 값 이하면 만점, 이 값 이상이면 timeScore 0점 — 회전 판단은 단순 반응보다 느리므로 순발력/기억력보다 넓은 구간. */
export const SPATIAL_TIME_SCORE_BEST_MS = 3000
export const SPATIAL_TIME_SCORE_WORST_MS = 9000
