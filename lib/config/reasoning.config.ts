/** Reasoning ("Pattern Reasoning") tuning constants — GAME_SPEC §74-84. */
/**
 * v2: gameScore reworked to difficultyWeightedAccuracy 75% + time 15% +
 * timeout-solve-rate 10%, clamped 0-100 (was an unbounded ~800+-scale
 * formula).
 * v3 (2026-08 difficulty rework): which Levels a session draws its
 * REASONING_TEMPLATES questions from is now tied to the player's chosen
 * tier (REASONING_QUESTIONS_PER_LEVEL_BY_TIER) instead of always pulling
 * from all 4 Levels regardless of tier — Easy stays single-rule (Level 1
 * only), Normal mixes in Level 2, Hard moves to the already-`compound`
 * Level 3 templates, Extreme to the more deeply compound Level 4 ones. The
 * 20 hand-authored templates themselves (lib/game/reasoning-templates.ts)
 * are untouched — Level 3/4 were already exactly the "두 규칙 조합"/"복합
 * 규칙" structure this rework asked for, just never tier-gated before.
 */
import { DIFFICULTY_TIME_MULTIPLIER } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'

export const REASONING_GAME_VERSION = 'reasoning_v3'

export const REASONING_LEVELS = [1, 2, 3, 4] as const

/**
 * Real question count per Level, per tier. Each of the 4 Levels has exactly
 * 5 hand-authored Templates (see reasoning-templates.ts), so no tier ever
 * asks for more than 4 from one Level (leaves room to sample without
 * replacement).
 */
export const REASONING_QUESTIONS_PER_LEVEL_BY_TIER: Record<GameDifficulty, Record<number, number>> = {
  easy: { 1: 3, 2: 0, 3: 0, 4: 0 },
  normal: { 1: 1, 2: 2, 3: 0, 4: 0 },
  hard: { 1: 0, 2: 0, 3: 4, 4: 0 },
  extreme: { 1: 0, 2: 0, 3: 0, 4: 4 },
}

export function getReasoningQuestionsPerLevelForDifficulty(difficulty: GameDifficulty): Record<number, number> {
  return REASONING_QUESTIONS_PER_LEVEL_BY_TIER[difficulty]
}

export function getReasoningQuestionCountForDifficulty(difficulty: GameDifficulty): number {
  const perLevel = REASONING_QUESTIONS_PER_LEVEL_BY_TIER[difficulty]
  return REASONING_LEVELS.reduce((sum, level) => sum + perLevel[level], 0)
}

export const REASONING_OPTION_COUNT = 4

/**
 * Per-question time limit by Level — GAME_SPEC §79's Easy/Normal/Hard bands
 * extended to 4 steps. Unlike Spatial, time INCREASES with difficulty here:
 * a harder Reasoning question needs more time to analyze the rule, not less
 * (the skill being measured is correct rule discovery, not speed).
 */
export const REASONING_TIME_LIMIT_MS: Record<number, number> = {
  1: 10_000,
  2: 12_000,
  3: 15_000,
  4: 18_000,
}

/**
 * Game-wide difficulty tier scaling on top of the per-Level base above —
 * see lib/config/difficulty.config.ts. At `normal` (DIFFICULTY_TIME_MULTIPLIER
 * === 1) this returns exactly REASONING_TIME_LIMIT_MS[level].
 */
export function getReasoningTimeLimitForDifficulty(level: number, difficulty: GameDifficulty): number {
  return Math.round(REASONING_TIME_LIMIT_MS[level] * DIFFICULTY_TIME_MULTIPLIER[difficulty])
}

/**
 * Difficulty weights for difficultyWeightedAccuracy / Score — draft values,
 * easy to retune after Beta data (GAME_SPEC §128 rule 14).
 */
export const REASONING_DIFFICULTY_WEIGHTS: Record<number, number> = {
  1: 1.0,
  2: 1.3,
  3: 1.6,
  4: 2.0,
}

/**
 * How long the per-question correct/wrong/timeout feedback (with the
 * correct-answer highlight and the 1-line Rule Explanation) stays up before
 * advancing. Raised from 800ms so there's actually time to read the
 * Explanation (~1-1.5s), while staying short enough that the real questions
 * don't make the whole session feel like it's dragging.
 */
export const REASONING_FEEDBACK_MS = 1400
/**
 * How long the Tutorial → Tutorial / Tutorial → Real transition message
 * stays up — raised from 1100ms to 2200ms so the rule callout was actually
 * readable, then trimmed back down to 800ms for touch responsiveness ("이
 * stage has nothing tappable, so it's pure 'next round' filler").
 * 2026-08 QA 2차 보정: 800ms turned out too short specifically for the
 * Tutorial→Real message ("규칙은 모양뿐 아니라 개수·위치·방향에도 있을 수
 * 있어요. 이제 실전을 시작할게요." — a full two-clause sentence, not a short
 * label), which auto-advances with nothing tappable to pause it — QA
 * couldn't finish reading it. Raised to 2000ms, a modest bump from the
 * current value (not back to the earlier 2200ms) so the flow still doesn't
 * drag.
 */
export const REASONING_TUTORIAL_TRANSITION_MS = 2000

/**
 * Reasoning Game Score — normalizedScore = difficultyWeightedAccuracy 75% +
 * 반응속도 15% + 제한시간 내 해결률 10%, clampScore 0-100. 우선순위: 난이도
 * 가중 정확도 > 반응속도 > 제한시간 내 해결률.
 *
 * 숫자 규칙(lib/scoring/number-pattern.ts)의 hardCorrect/hardTotal 같은
 * 고난도 보너스를 여기 그대로 가져오지 않는다 — difficultyWeightedAccuracy가
 * 이미 REASONING_DIFFICULTY_WEIGHTS로 Level별 난이도를 반영하고 있어서,
 * "고난도 정답 보너스"를 또 추가하면 같은 신호(어려운 문제를 맞혔다)가
 * 두 번 반영된다. 숫자 규칙은 반대로 난이도 가중 정확도 자체가 없는
 * 게임이라 hardCorrect/hardTotal이 유일한 난이도 반영 수단이므로 그
 * 게임에서는 유지한다.
 */
export const REASONING_SCORE_WEIGHTS = {
  /** difficultyWeightedAccuracy (0-1) × this — the dominant term. */
  accuracyWeight: 75,
  /** timeScore(0-1, scoreFromReactionTime 결과) × this. */
  timeWeight: 15,
  /** timeoutScore(0-1, 시간초과 안 한 비율) × this. */
  timeoutWeight: 10,
}

/** averageResponseTimeMs가 이 값 이하면 만점, 이 값 이상이면 timeScore 0점 — REASONING_TIME_LIMIT_MS(레벨별 10000~18000ms)의 가중평균(~14000ms)을 기준으로 잡은 구간. */
export const REASONING_TIME_SCORE_BEST_MS = 4000
export const REASONING_TIME_SCORE_WORST_MS = 13000
