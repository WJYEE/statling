import type { GameDifficulty } from '@/lib/game/difficulty'
import type { JudgmentRuleId, JudgmentStimulus } from '@/lib/game/types'

/**
 * Judgment ("Rule Switch") tuning constants — GAME_SPEC §55-63.
 *
 * v2: Time Attack rework. Instead of a fixed 16-Trial session, the player
 * keeps clearing a continuous queue of Blocks until a global timer runs out;
 * "Score priority: Accuracy > Rule Switch Adaptation > Speed" is preserved,
 * but Speed is now inherent to the format (processing more Blocks in the same
 * window requires being fast) rather than a separate per-trial timer.
 * v3: gameScore reworked to accuracy 60% + switch 15% + conflict 15% +
 * throughput 10%, clamped 0-100 (was an unbounded ~1000+-scale formula where
 * throughput dominated far more than the stated priority intended).
 * v4: Real play no longer switches rule mid-session and the session length
 * was cut 15s → 10s. Purely a behavior/pacing change — the gameScore formula
 * itself is untouched.
 * v5: Narrowed v4 to Intro (First Play) only — Free Play keeps the original
 * Rule Switch behavior (Tutorial demos both rules, Real play switches once)
 * unchanged. Intro now fixes ONE rule for both its Tutorial and Real play
 * (picked once per session), never demoing or switching to the other rule at
 * all. Still purely a behavior change; gameScore formula untouched.
 * v6 (2026-08 difficulty rework): session length no longer scales by tier at
 * all (getJudgmentGameDurationForDifficulty now always returns
 * JUDGMENT_GAME_DURATION_MS) — difficulty instead comes from rule COUNT and
 * SWITCH FREQUENCY, both tier-specific (see JUDGMENT_TIER_RULE_CONFIG below
 * and getSegmentConfig's new `difficulty` parameter). A 3rd rule
 * ('direction') joins shape/count at Hard+. Free Play's Real session now
 * genuinely rotates through its tier's rule pool instead of switching
 * exactly once; Intro (First Play, `forcedRuleId`) is untouched — it still
 * fixes one rule for the whole session regardless of tier.
 */
export const JUDGMENT_GAME_VERSION = 'judgment_v6'

/** Total real-play session length — fixed across every difficulty tier now (see module doc comment v6). */
export const JUDGMENT_GAME_DURATION_MS = 10_000

/** Kept as a function (not read directly) so call sites didn't need to change shape — always returns JUDGMENT_GAME_DURATION_MS regardless of tier now; see module doc comment v6. */
export function getJudgmentGameDurationForDifficulty(_difficulty: GameDifficulty): number {
  return JUDGMENT_GAME_DURATION_MS
}

/** Default Block count per fixed-rule segment (used from segment index 2 onward — see getSegmentConfig for the shorter early-segment lengths). Processing-count-based switching (not time-based) keeps a fast player's extra throughput naturally reaching more/harder segments. */
export const JUDGMENT_SEGMENT_LENGTH = 8

/** Block count for segments 0-1 (the eased-difficulty ramp, before the single Rule Switch) — shortened from JUDGMENT_SEGMENT_LENGTH so the session actually reaches segment 2 (3-way + full Conflict) at least once, without changing anything about how easy those early segments themselves are (same Conflict ratios, same 2-way choice count). Trimmed from 4 to 3 alongside the 20s→15s session cut, same ~25% ratio. */
export const JUDGMENT_EARLY_SEGMENT_LENGTH = 3

/** How many Blocks are visible in the queue at once (current + upcoming preview). */
export const JUDGMENT_QUEUE_PREVIEW_COUNT = 6

/** Target band for the share of Conflict-type stimuli within a segment once full difficulty is reached (segment index 2+); the actual ratio is randomized inside this band per segment. */
export const JUDGMENT_CONFLICT_RATIO_MIN = 0.4
export const JUDGMENT_CONFLICT_RATIO_MAX = 0.6

/** Conflict ratio ceiling for segment index 1 (the one-and-only Rule Switch) — kept low so the switch itself is the only new thing a first-time player has to absorb. */
export const JUDGMENT_EARLY_CONFLICT_RATIO_MAX = 0.15

/** How long the departing Block's clear/shake + "+1"/"MISS" flourish stays visible. Purely cosmetic — input for the next Block is already accepted before this finishes. */
export const JUDGMENT_BLOCK_EXIT_MS = 220
/** How long the compact "RULE CHANGE!" overlay blocks input during the Tutorial's rule demo (also used for the Tutorial → Real transition banner) — raised from 650ms to 1600ms so the rule callout was actually readable, then trimmed back down ~1s once the callout got its own persistent reminder alongside it. */
export const JUDGMENT_RULE_SWITCH_OVERLAY_MS = 600
/** How long the one-time "선택지가 하나 더 늘어났어요!" heads-up stays up — only at the 2-way → 3-way step (segment index 1 → 2). Not scored. */
export const JUDGMENT_THIRD_OPTION_INTRO_MS = 900

/**
 * Combo Bonus Time — a pure gameplay reward (extends the Time Attack clock),
 * never a Score input (Score/PB keep their existing Accuracy > Switch >
 * Conflict priority untouched; more time just means more Blocks CAN be
 * processed, which naturally shows up in processedBlocks/correctBlocks).
 * Draft values, easy to retune after Beta data.
 */
export const JUDGMENT_COMBO_BONUS_INTERVAL = 10
/** Lowered three times now, each time alongside a session-duration cut, to keep a full 2-grant bonus roughly the same ~6% share of the base duration: 2000ms (35s session) → 1500ms (25s session) → 1200ms (20s session) → 900ms (15s session). */
export const JUDGMENT_COMBO_BONUS_TIME_MS = 900
/** Caps total session length growth from Combo Bonuses (2 grants = max +3s). */
export const JUDGMENT_MAX_COMBO_TIME_BONUSES = 2
/** How long the "10 COMBO! +2초" pop-up stays visible. */
export const JUDGMENT_COMBO_BONUS_FEEDBACK_MS = 700

/** Tutorial: fixed, easy, always-2-way Blocks — 3 per rule, discarded from scoring, no timer. pointerDirection is set but functionally irrelevant here since Tutorial only ever tests shape/count. */
export const JUDGMENT_TUTORIAL_SEGMENT_LENGTH = 3
export const JUDGMENT_TUTORIAL_SHAPE_STIMULI: JudgmentStimulus[] = [
  { shape: 'circle', dotCount: 1, pointerDirection: 'left' },
  { shape: 'square', dotCount: 2, pointerDirection: 'right' },
  { shape: 'circle', dotCount: 2, pointerDirection: 'up' },
]
export const JUDGMENT_TUTORIAL_COUNT_STIMULI: JudgmentStimulus[] = [
  { shape: 'square', dotCount: 1, pointerDirection: 'right' },
  { shape: 'circle', dotCount: 2, pointerDirection: 'left' },
  { shape: 'square', dotCount: 2, pointerDirection: 'up' },
]

/**
 * Which rules a tier's Free Play Real session rotates through, and how many
 * Blocks per segment from segment index 2 onward (segments 0-1 always use
 * JUDGMENT_EARLY_SEGMENT_LENGTH — a universal warm-up before full difficulty
 * kicks in, same as before this rework). Smaller segmentLength = more
 * frequent switches. Hard/Extreme add 'direction' as a genuine 3rd rule;
 * Easy/Normal stay at the original 2 (shape/count), differing only by how
 * often they switch.
 */
export interface JudgmentTierRuleConfig {
  rules: JudgmentRuleId[]
  segmentLength: number
}

export const JUDGMENT_TIER_RULE_CONFIG: Record<GameDifficulty, JudgmentTierRuleConfig> = {
  easy: { rules: ['shape', 'count'], segmentLength: 8 },
  normal: { rules: ['shape', 'count'], segmentLength: 5 },
  hard: { rules: ['shape', 'count', 'direction'], segmentLength: 4 },
  extreme: { rules: ['shape', 'count', 'direction'], segmentLength: 2 },
}

/**
 * The rule/difficulty progression by segment index for a given tier. Segment
 * 0 always plays 'shape' (a familiar, unswitched start for every tier);
 * segment 1 is the tier's own rule pool's 2nd entry (still 2-way, Conflict
 * capped low); segment 2+ cycles through the tier's full rule pool
 * (`segmentIndex % rules.length`) at the tier's own segmentLength, ramped to
 * 3-way + the full Conflict band.
 *
 * This is Free Play's behavior. Intro (First Play) still overrides the
 * `ruleId` this returns with one fixed rule for the whole session (see
 * judgment-game.tsx's `forcedRuleId` thread) — Intro's difficulty ramp
 * (choiceCount/length/conflict ratios) still comes from here unchanged, but
 * it's effectively always read at 'normal' (Intro is only ever played at
 * Normal), so its pacing is unaffected by the Hard/Extreme rule pool.
 */
export function getSegmentConfig(
  segmentIndex: number,
  difficulty: GameDifficulty,
): { ruleId: JudgmentRuleId; choiceCount: 2 | 3; length: number; conflictRatioMin: number; conflictRatioMax: number } {
  const tierConfig = JUDGMENT_TIER_RULE_CONFIG[difficulty]
  if (segmentIndex === 0) {
    return { ruleId: 'shape', choiceCount: 2, length: JUDGMENT_EARLY_SEGMENT_LENGTH, conflictRatioMin: 0, conflictRatioMax: 0 }
  }
  if (segmentIndex === 1) {
    return {
      ruleId: tierConfig.rules[1 % tierConfig.rules.length],
      choiceCount: 2,
      length: JUDGMENT_EARLY_SEGMENT_LENGTH,
      conflictRatioMin: 0,
      conflictRatioMax: JUDGMENT_EARLY_CONFLICT_RATIO_MAX,
    }
  }
  return {
    ruleId: tierConfig.rules[segmentIndex % tierConfig.rules.length],
    choiceCount: 3,
    length: tierConfig.segmentLength,
    conflictRatioMin: JUDGMENT_CONFLICT_RATIO_MIN,
    conflictRatioMax: JUDGMENT_CONFLICT_RATIO_MAX,
  }
}

/**
 * Judgment Game Score — normalizedScore = overallAccuracy 60% + switchAccuracy
 * 15% + conflictAccuracy 15% + throughput 10%, clampScore 0-100.
 *
 * Stated priority is Accuracy > Rule Switch Adaptation > Speed — the old
 * unbounded formula (`correctBlocks * overallAccuracy * 100`) didn't actually
 * match that: correctBlocks scales with raw session length/pace (roughly
 * 5-20+), so in practice throughput dominated the score far more than
 * switchAccuracyBonus/conflictAccuracyBonus (both capped at 100/80 flat)
 * ever could. This version enforces the stated priority directly as
 * percentage weights instead. wrongBlocks isn't penalized separately —
 * overallAccuracy already reflects every wrong Block, so a flat penalty on
 * top would double-count the same mistake (same reasoning as dropping
 * Focus's old speed term and Memory's perfectRounds bonus).
 */
export const JUDGMENT_SCORE_WEIGHTS = {
  /** overallAccuracy (0-1) × this — the dominant term. */
  accuracyWeight: 60,
  /** switchAccuracy (0-1) × this — Judgment's signature trait: adapting the instant the rule changes. */
  switchWeight: 15,
  /** conflictAccuracy (0-1) × this — resisting interference from the previous rule. */
  conflictWeight: 15,
  /** throughputScore (0-1, normalizeUpward of correctBlocks) × this — speed, ranked last per the stated priority. */
  throughputWeight: 10,
}

/**
 * correctBlocks-to-throughputScore bounds — draft values based on the 15s
 * session length (scaled down from the 20s-session 4/16 bounds by the same
 * ~25% the session itself was cut) and ~8-block segments
 * (JUDGMENT_SEGMENT_LENGTH): a slow but careful player might clear ~3, a fast
 * accurate player ~12+ (helped by Combo Bonus Time). Retune once real usage
 * data exists.
 */
export const JUDGMENT_THROUGHPUT_MIN_BLOCKS = 3
export const JUDGMENT_THROUGHPUT_MAX_BLOCKS = 12
