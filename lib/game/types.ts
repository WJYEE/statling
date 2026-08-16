import type { RawRecord, StatId } from '@/lib/brain-bet'
import type { GameDifficulty } from '@/lib/game/difficulty'

export type GameId = StatId

export type FlowModeType = 'first' | 'free'

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'
export type InputType = 'mouse' | 'touch' | 'keyboard' | 'unknown'

export interface DeviceInfo {
  deviceType: DeviceType
  inputType: InputType
}

/** Reason a session was flagged invalid. Null when the attempt is valid. */
export type InvalidReason = 'abnormally_fast_repeat' | null

/** Fields every game result shares, regardless of which game produced it. */
export interface BaseGameResult {
  sessionId: string
  gameId: GameId
  gameVersion: string
  mode: FlowModeType
  playedAt: string
  device: DeviceInfo
  /** Internal composite score — never shown to the user, never used for Percentile/Ranking yet. */
  gameScore: number
  raw: RawRecord
  /** Real 0-100 Final Stat. Left undefined until real Percentile exists — never faked. */
  final?: number
  isPersonalBest: boolean
  isValidAttempt: boolean
  invalidReason: InvalidReason
  /** Which of the 4 tiers this attempt was played at — see lib/game/difficulty.ts. Drives lib/game/player-skill-storage.ts's per-tier best tracking and spec §18's representative-record rule. */
  difficulty: GameDifficulty
  /**
   * Which registered game (see lib/game/game-registry.ts) produced this
   * result, e.g. 'reaction-classic' | 'reaction-dodge-run'. Optional and
   * additive — the original 6 games never set it (gameId alone identified
   * them 1:1 with a stat), so existing result objects stay valid as-is.
   * Only present once a stat has more than one registered game.
   */
  variant?: string
  /**
   * 1 for a stat's first Initial Assessment attempt at a game, 2 for its one
   * allowed retry (see game-flow.tsx's handleRetryCurrentGame/isRetryAttemptRef)
   * — undefined for Free Play (retry is Initial-Assessment-only) and for the
   * 6 alt-game handlers, which never route through the retry flow. Kept
   * purely as data (never read by any scoring/storage decision here) so a
   * future `mini_game_retry` GA4 event, or any other analytics on
   * statStatus[stat].history, can distinguish attempt 1 from attempt 2
   * without re-deriving it.
   */
  attempt?: 1 | 2
}

export interface ReactionTrial {
  trialIndex: number
  delayMs: number
  reactionMs: number | null
  isFalseStart: boolean
  createdAt: string
}

export interface ReactionRawSummary {
  validTrials: number
  falseStarts: number
  averageReactionMs: number
  medianReactionMs: number
  bestReactionMs: number
  /** Standard deviation of valid reaction times — internal tie-breaker only, never shown to the user. */
  consistency: number
}

export interface ReactionGameResult extends BaseGameResult {
  gameId: 'reaction'
  trials: ReactionTrial[]
  rawSummary: ReactionRawSummary
}

export interface MemoryRoundTrial {
  roundIndex: number
  difficultyLevel: number
  gridSize: number
  targetCount: number
  exposureMs: number
  targetCells: string[]
  selectedCells: string[]
  correctSelections: number
  wrongSelections: number
  missedTargets: number
  responseTimeMs: number
  createdAt: string
}

export interface MemoryRawSummary {
  /** Always MEMORY_REAL_ROUNDS on a normal completion (no Life system) — record-only, NOT a Personal Best axis. */
  roundsCompleted: number
  /** Difficulty-weighted average of per-round accuracy (0-1). Primary Personal Best axis. */
  weightedAccuracy: number
  /** Simple unweighted average accuracy (0-1), kept for reference/display. */
  averageAccuracy: number
  perfectRounds: number
  /** Raw average selection time, unadjusted — kept for reference/display. */
  averageResponseTimeMs: number
  /** Average selection time with MEMORY_WRONG_TIME_PENALTY_MS added per wrong click. Used for scoring/Personal Best. */
  averageAdjustedResponseTimeMs: number
}

export interface MemoryGameResult extends BaseGameResult {
  gameId: 'memory'
  rounds: MemoryRoundTrial[]
  rawSummary: MemoryRawSummary
}

export interface FocusRoundTrial {
  roundIndex: number
  difficultyLevel: number
  distractorCount: number
  similarityLevel: number
  targetPresent: boolean
  /** Null when targetPresent is false. */
  targetCellId: string | null
  /** Null when the user pressed "없음" or the round timed out without a click. */
  selectedCellId: string | null
  /** True only when the user's action was pressing "없음" (regardless of whether that was correct). */
  selectedNone: boolean
  selectedCorrectly: boolean
  /** Clicked a non-target cell — either a real distractor while a target existed, or any cell when none existed. */
  falseClick: boolean
  /** A target existed but the user pressed "없음" or the round timed out. */
  missedTarget: boolean
  /** True if the round ended by hitting its time limit with no user action. */
  timedOut: boolean
  responseTimeMs: number
  createdAt: string
}

export interface FocusRawSummary {
  roundsCompleted: number
  totalTargetsPresent: number
  correctTargetsFound: number
  correctNoneCalls: number
  missedTargets: number
  falseClicks: number
  timeouts: number
  /** Simple unweighted accuracy (0-1). */
  accuracy: number
  /** Difficulty-weighted accuracy (0-1). Primary Personal Best axis. */
  weightedAccuracy: number
  falseClickRate: number
  missRate: number
  averageResponseTimeMs: number
}

export interface FocusGameResult extends BaseGameResult {
  gameId: 'focus'
  rounds: FocusRoundTrial[]
  rawSummary: FocusRawSummary
}

/**
 * 2026-08 difficulty rework added 'direction' as a 3rd rule (Hard/Extreme
 * only — see lib/config/judgment.config.ts's JUDGMENT_TIER_RULE_CONFIG).
 * 'color' was the other candidate on the table but deliberately NOT used —
 * lib/game/judgment-symbol.tsx's existing doc comment states color is
 * "decorative only, never the deciding cue" as a documented, intentional
 * color-vision-independence choice for this exact game (mirrors Focus's own
 * "never color-only" distractor rule) — adding a judged color rule would
 * have directly reversed that. 'direction' slots into the same
 * Rule-value-shuffled-onto-Left/Up/Right/Down machinery shape/count already
 * use, so nothing about that machinery needed to change shape.
 *
 * v2 (2026-08 후속 보정): the answer domain is now GENUINELY 4-way at
 * Hard/Extreme (`'up'` added — was previously a direction-arrow badge only,
 * dead code as far as the actual answer domain went). Every rule's value
 * domain was widened to 4 distinct values so all three rules can fill all 4
 * buttons: shape gained 'diamond', dotCount gained 4, pointerDirection
 * gained 'down'. Easy/Normal never leave choiceCount 2 (Left/Right only) —
 * see JUDGMENT_TIER_RULE_CONFIG.maxChoiceCount.
 */
export type JudgmentRuleId = 'shape' | 'count' | 'direction'
export type JudgmentAnswer = 'left' | 'right' | 'up' | 'down'

export interface JudgmentStimulus {
  shape: 'circle' | 'square' | 'triangle' | 'diamond'
  dotCount: 1 | 2 | 3 | 4
  /** Which way the small arrow badge (see judgment-symbol.tsx) points — the Direction Rule's cue, decorrelated from shape/dotCount (every shape/count combo sees every direction) so it can't be inferred from the other two attributes. */
  pointerDirection: 'left' | 'up' | 'right' | 'down'
}

/** A value a Rule Mapping can point Left/Up/Right/Down at — a shape identity, a dot count, or a pointer direction. */
export type JudgmentMappingValue = JudgmentStimulus['shape'] | JudgmentStimulus['dotCount'] | JudgmentStimulus['pointerDirection']

/**
 * Which on-screen direction each rule value is currently assigned to — regenerated
 * (shuffled) once per rule segment so the direction can't be memorized by position.
 * `up`/`down` are null on 2-way segments (only Left/Right is in play).
 */
export interface JudgmentRuleMapping {
  ruleId: JudgmentRuleId
  choiceCount: 2 | 4
  left: JudgmentMappingValue
  right: JudgmentMappingValue
  up: JudgmentMappingValue | null
  down: JudgmentMappingValue | null
}

export interface JudgmentTrial {
  /** Processing order within the session (0, 1, 2... in the order the block was resolved). */
  trialIndex: number
  /** Which rule segment this block belonged to (a "segment" = a run of blocks under one fixed rule; distinct from the on-screen "Block" queue item). */
  segmentIndex: number
  ruleId: JudgmentRuleId
  /** The rule active in the immediately preceding segment. Null for the very first segment (nothing to switch from). */
  previousRuleId: JudgmentRuleId | null
  stimulus: JudgmentStimulus
  /** The Left/Down/Right assignment active for this Block's segment — stored so a specific mapping or a direction bias can be analyzed later. */
  ruleMapping: JudgmentRuleMapping
  correctAnswer: JudgmentAnswer
  selectedAnswer: JudgmentAnswer | null
  isCorrect: boolean
  responseTimeMs: number
  /** True only for a segment's first block, and only when that segment isn't the session's first (no prior rule to switch from). */
  isSwitchTrial: boolean
  /** 0 for the switch trial itself (or the first block of the first segment), 1/2/3... afterward within the same segment. */
  trialsSinceSwitch: number
  /** True when the previous rule and the current rule would disagree on this stimulus's answer (generalizes across 2-way and 4-way segments). */
  isConflictTrial: boolean
  /** 2 for 2-way segments (Left/Right only, Easy/Normal's whole session), 4 for 4-way segments (Left/Up/Right/Down, Hard/Extreme from segment index 2 onward) — lets 2-way vs 4-way difficulty be analyzed separately. */
  choiceCount: 2 | 4
  createdAt: string
}

/**
 * Time Attack session summary — replaces the old fixed-16-trial summary now
 * that the session is "however many Blocks got processed before the timer
 * ran out" rather than a fixed trial count.
 */
export interface JudgmentRawSummary {
  processedBlocks: number
  correctBlocks: number
  wrongBlocks: number
  overallAccuracy: number

  /** Longest consecutive-correct streak reached during the session. Game-feel metric, not a Score input. */
  maxCombo: number
  averageResponseTimeMs: number
  /** processedBlocks divided by the actual session duration in seconds. */
  blocksPerSecond: number

  switchTrials: number
  switchCorrect: number
  switchAccuracy: number

  nonSwitchTrials: number
  nonSwitchCorrect: number
  nonSwitchAccuracy: number

  conflictTrials: number
  conflictCorrect: number
  conflictAccuracy: number

  switchAverageResponseTimeMs: number
  nonSwitchAverageResponseTimeMs: number
  /** switchAverageResponseTimeMs - nonSwitchAverageResponseTimeMs. Internal raw metric only — never shown to the user as a scientific claim. */
  switchCostMs: number
  /** How many times the rule changed during the session (i.e. how many segments beyond the first were reached). */
  ruleSwitchCount: number
}

export interface JudgmentGameResult extends BaseGameResult {
  gameId: 'judgment'
  trials: JudgmentTrial[]
  rawSummary: JudgmentRawSummary
}

export type SpatialRotationAngle = 0 | 90 | 180 | 270

/** Why a wrong option was offered — lets Mirror confusion be analyzed separately from generic misses. */
export type SpatialDistractorType = 'mirror' | 'similar' | 'unrelated'

/** One of the 4 candidate cards shown for a question — kept per-trial so a specific question can be reproduced/audited later. */
export interface SpatialOptionRecord {
  shapeId: string
  rotationAngle: SpatialRotationAngle
  isMirrored: boolean
  isCorrect: boolean
  /** Null exactly when isCorrect is true (the correct option isn't "a distractor"). */
  distractorType: SpatialDistractorType | null
}

export interface SpatialTrial {
  trialIndex: number
  difficultyLevel: number
  /** The base shape identity used as the reference for this question. */
  shapeId: string
  /** The CORRECT option's rotation relative to the reference (GAME_SPEC baseline field) — never 0 (see spatial-problems.ts). */
  rotationAngle: SpatialRotationAngle
  /** True when one of this question's 3 distractors was a Mirror of the reference shape (Level 3+). */
  mirrorIncluded: boolean
  optionCount: number
  /** Full composition of all 4 options, for reproducing/auditing a specific question later. */
  options: SpatialOptionRecord[]
  correctOptionIndex: number
  selectedOptionIndex: number | null
  isCorrect: boolean
  responseTimeMs: number
  timedOut: boolean
  createdAt: string
}

export interface SpatialRawSummary {
  totalQuestions: number
  correctAnswers: number
  overallAccuracy: number
  /** Difficulty-weighted average accuracy (0-1). Primary Personal Best axis — GAME_SPEC §72. */
  difficultyWeightedAccuracy: number

  mirrorQuestions: number
  mirrorCorrect: number
  /** 0 when mirrorQuestions is 0 (an abnormal/partial session that never reached Level 3-4) — see calculateSpatialScore's handling of this edge case. */
  mirrorAccuracy: number

  averageResponseTimeMs: number
  timeoutCount: number
  /** Accuracy (0-1) per difficultyLevel — lets Level-by-Level performance be analyzed later. */
  accuracyByDifficulty: Record<number, number>
}

export interface SpatialGameResult extends BaseGameResult {
  gameId: 'spatial'
  trials: SpatialTrial[]
  rawSummary: SpatialRawSummary
}

export type ReasoningType = 'alternation' | 'count' | 'position' | 'compound'

/** Why a wrong option was offered — lets a specific kind of reasoning slip be analyzed separately from a plain miss. */
export type ReasoningDistractorType = 'repeat-previous' | 'reverse-direction' | 'partial-attribute'

/** One of the 4 candidate cards shown for a question — kept per-trial so a specific question can be reproduced/audited later. */
export interface ReasoningOptionRecord {
  isCorrect: boolean
  /** Null when isCorrect is true, or when a distractor doesn't cleanly fit one of the named archetypes (still a valid wrong answer, just not classified). */
  distractorType: ReasoningDistractorType | null
}

export interface ReasoningTrial {
  trialIndex: number
  /** Per-instance id (templateId + a random seed) — identifies this exact generated question. */
  questionId: string
  /** Which hand-authored rule Template generated this question — lets performance be analyzed per Template, not just per Type/Level. */
  templateId: string
  reasoningType: ReasoningType
  difficultyLevel: number
  optionCount: number
  options: ReasoningOptionRecord[]
  correctOptionIndex: number
  selectedOptionIndex: number | null
  isCorrect: boolean
  responseTimeMs: number
  timedOut: boolean
  createdAt: string
}

export interface ReasoningRawSummary {
  totalQuestions: number
  correctAnswers: number
  overallAccuracy: number
  /** Difficulty-weighted average accuracy (0-1). Primary Personal Best axis — GAME_SPEC §82. */
  difficultyWeightedAccuracy: number
  /** Accuracy (0-1) per difficultyLevel. */
  accuracyByDifficulty: Record<number, number>
  /** Accuracy (0-1) per ReasoningType — only types actually seen this session have an entry. */
  accuracyByReasoningType: Partial<Record<ReasoningType, number>>
  averageResponseTimeMs: number
  timeoutCount: number
}

export interface ReasoningGameResult extends BaseGameResult {
  gameId: 'reasoning'
  trials: ReasoningTrial[]
  rawSummary: ReasoningRawSummary
}

// ---------------------------------------------------------------------------
// Second game per stat (see lib/game/game-registry.ts) — each stat still
// reports the same `gameId: StatId`; `variant` disambiguates which of the
// stat's registered games actually produced a given result. Kept as
// independent, simpler types rather than shoehorned into the existing
// Trial/RawSummary shapes above, since e.g. "이야기 기억" has nothing in
// common with the grid-recall Memory game's per-cell trial log.
// ---------------------------------------------------------------------------

/**
 * 2026-08 content rework: this game's underlying task changed from a
 * read-a-story-then-answer-questions format to a Visual Object Memory
 * format (show objects, hide them, ask a 4-choice question about what was/
 * wasn't there — see lib/game/story-memory-data.ts). The gameId/variant
 * wire strings (`gameId: 'memory'`, `variant: 'story-recall'` below) and
 * this whole type's field NAMES were deliberately left exactly as they were
 * — only this union's two literal values changed — so existing
 * PlayerSkillState records / Hard+Extreme unlock progress for this exact
 * slot keep working; only the question categories actually being asked
 * changed. 'absent' = "방금 보지 못했던 물건은?", 'color' = "그 물건은 무슨
 * 색이었나요?" (Hard/Extreme only).
 */
export type StoryQuestionCategory = 'absent' | 'color'

export interface StoryMemoryAnswer {
  questionIndex: number
  category: StoryQuestionCategory
  selectedIndex: number | null
  correctIndex: number
  isCorrect: boolean
  responseTimeMs: number
}

export interface StoryMemoryRawSummary {
  /** Kept for shape compatibility — no longer a real "story" id, just a per-session identifier (see lib/game/story-memory-data.ts#pickObjectMemorySession). */
  storyId: string
  totalQuestions: number
  correctAnswers: number
  accuracy: number
  averageResponseTimeMs: number
}

export interface StoryMemoryGameResult extends BaseGameResult {
  gameId: 'memory'
  variant: 'story-recall'
  answers: StoryMemoryAnswer[]
  rawSummary: StoryMemoryRawSummary
}

/**
 * 2026-08 content rework: this game's underlying task changed from "click
 * the object matching a periodically-changing target color" to a Stroop
 * interference task (a color word rendered in a mismatched ink color — see
 * lib/config/color-target.config.ts). gameId/variant wire strings
 * (`gameId: 'focus'`, `variant: 'color-target'` below) were deliberately
 * left exactly as they were, same reasoning as StoryMemoryGameResult's doc
 * comment — only this trial/summary shape changed.
 */
export interface ColorTargetClickEvent {
  kind: 'correct' | 'wrong' | 'timeout'
  /** Which rule was active for this trial — 'ink' = click the rendered color, 'meaning' = click the color the word names. */
  rule: 'ink' | 'meaning'
  /** True when the word's meaning and its rendered ink color differ (the real Stroop-interference trials). */
  isIncongruent: boolean
  /** True only for a rule-block's first trial, and only when that block isn't the session's first (no prior rule to switch from) — mirrors JudgmentTrial.isSwitchTrial. */
  isSwitchTrial: boolean
  /** The correct answer's color id for this trial. */
  colorId: string
  selectedColorId: string | null
  reactionTimeMs: number | null
  createdAt: string
}

export interface ColorTargetRawSummary {
  totalTrials: number
  correctCount: number
  wrongCount: number
  timeoutCount: number
  accuracy: number
  averageReactionTimeMs: number
  switchTrials: number
  switchCorrect: number
  switchAccuracy: number
}

export interface ColorTargetGameResult extends BaseGameResult {
  gameId: 'focus'
  variant: 'color-target'
  events: ColorTargetClickEvent[]
  rawSummary: ColorTargetRawSummary
}

export interface DodgeObstacleEvent {
  kind: 'dodged' | 'collided'
  lane: 0 | 1 | 2
  atMs: number
}

export interface DodgeObstacleRawSummary {
  obstaclesDodged: number
  collisions: number
  survivedMs: number
  averageMoveReactionMs: number
}

export interface DodgeObstacleGameResult extends BaseGameResult {
  gameId: 'reaction'
  variant: 'dodge-run'
  events: DodgeObstacleEvent[]
  rawSummary: DodgeObstacleRawSummary
}

/**
 * 2026-08 content rework: this game's underlying task changed from a
 * subjective multi-choice "best decision" scenario (0-100 partial-credit
 * `selectedScore`) to a binary (A/B) fact-comparison quiz with one
 * objectively correct answer — see lib/game/decision-scenarios.ts. Binary
 * right/wrong doesn't have a meaningful "partial credit" concept, so this
 * switched to the same isCorrect-based shape every other accuracy-scored
 * game already uses. gameId/variant wire strings untouched (see
 * StoryMemoryGameResult's doc comment for why).
 */
export interface BestChoiceAnswer {
  roundIndex: number
  scenarioId: string
  selectedOption: 'A' | 'B' | null
  correctOption: 'A' | 'B'
  isCorrect: boolean
  responseTimeMs: number
  timedOut: boolean
}

export interface BestChoiceRawSummary {
  totalRounds: number
  correctCount: number
  accuracy: number
  averageResponseTimeMs: number
  timeouts: number
}

export interface BestChoiceGameResult extends BaseGameResult {
  gameId: 'judgment'
  variant: 'best-choice'
  answers: BestChoiceAnswer[]
  rawSummary: BestChoiceRawSummary
}

export interface FitPuzzleRoundResult {
  roundIndex: number
  pieceCount: number
  correctPlacements: number
  misplacements: number
  rotations: number
  completed: boolean
  completionMs: number
}

export interface FitPuzzleRawSummary {
  totalRounds: number
  roundsCompleted: number
  correctPlacements: number
  misplacements: number
  rotations: number
  totalCompletionMs: number
}

export interface FitPuzzleGameResult extends BaseGameResult {
  gameId: 'spatial'
  variant: 'fit-puzzle'
  rounds: FitPuzzleRoundResult[]
  rawSummary: FitPuzzleRawSummary
}

export interface NumberPatternAnswer {
  questionIndex: number
  ruleType: string
  difficulty: 'easy' | 'normal' | 'hard' | 'extreme'
  selectedValue: number | null
  correctValue: number
  isCorrect: boolean
  responseTimeMs: number
  timedOut: boolean
}

export interface NumberPatternRawSummary {
  totalQuestions: number
  correctAnswers: number
  accuracy: number
  hardCorrect: number
  hardTotal: number
  averageResponseTimeMs: number
}

export interface NumberPatternGameResult extends BaseGameResult {
  gameId: 'reasoning'
  variant: 'number-pattern'
  answers: NumberPatternAnswer[]
  rawSummary: NumberPatternRawSummary
}

export type GameResult =
  | ReactionGameResult
  | MemoryGameResult
  | FocusGameResult
  | JudgmentGameResult
  | SpatialGameResult
  | ReasoningGameResult
  | StoryMemoryGameResult
  | ColorTargetGameResult
  | DodgeObstacleGameResult
  | BestChoiceGameResult
  | FitPuzzleGameResult
  | NumberPatternGameResult

export interface StatStatus {
  /** First-play result. Locked the first time this stat is ever completed; never overwritten after. */
  initial: GameResult | null
  /** Best Valid Performance so far. */
  current: GameResult | null
  /** Every attempt (valid or not), oldest to newest. */
  history: GameResult[]
}

export type StatStatusMap = Record<StatId, StatStatus>
