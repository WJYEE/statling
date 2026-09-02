import type { RawRecord } from '@/lib/brain-bet'
import {
  JUDGMENT_GAME_DURATION_MS,
  JUDGMENT_SCORE_WEIGHTS,
  JUDGMENT_THROUGHPUT_MAX_BLOCKS,
  JUDGMENT_THROUGHPUT_MIN_BLOCKS,
} from '@/lib/config/judgment.config'
import type { JudgmentRawSummary, JudgmentTrial } from '@/lib/game/types'
import { clampScore, normalizeUpward } from '@/lib/scoring/shared'

function accuracyOf(set: JudgmentTrial[]): number {
  return set.length === 0 ? 0 : set.filter((t) => t.isCorrect).length / set.length
}

function averageResponseTimeOf(set: JudgmentTrial[]): number {
  return set.length === 0 ? 0 : Math.round(set.reduce((s, t) => s + t.responseTimeMs, 0) / set.length)
}

function longestCorrectStreak(trials: JudgmentTrial[]): number {
  let longest = 0
  let current = 0
  for (const trial of trials) {
    current = trial.isCorrect ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

/**
 * Summarizes a Time Attack session's processed Blocks (in processing order)
 * into the aggregate fields GAME_SPEC §61-62 lists, extended with the
 * throughput/combo metrics the Time Attack format adds. `elapsedMs` defaults
 * to the full session duration since a Time Attack session always runs to
 * the timer's end (there's no early-completion path).
 */
export function summarizeJudgmentTrials(trials: JudgmentTrial[], elapsedMs: number = JUDGMENT_GAME_DURATION_MS): JudgmentRawSummary {
  const switchSet = trials.filter((t) => t.isSwitchTrial)
  const nonSwitchSet = trials.filter((t) => !t.isSwitchTrial)
  const conflictSet = trials.filter((t) => t.isConflictTrial)

  const switchAverageResponseTimeMs = averageResponseTimeOf(switchSet)
  const nonSwitchAverageResponseTimeMs = averageResponseTimeOf(nonSwitchSet)
  const correctBlocks = trials.filter((t) => t.isCorrect).length
  const elapsedSeconds = Math.max(elapsedMs, 1) / 1000
  const ruleSwitchCount = trials.length === 0 ? 0 : new Set(trials.map((t) => t.segmentIndex)).size - 1

  return {
    processedBlocks: trials.length,
    correctBlocks,
    wrongBlocks: trials.length - correctBlocks,
    overallAccuracy: accuracyOf(trials),

    maxCombo: longestCorrectStreak(trials),
    averageResponseTimeMs: averageResponseTimeOf(trials),
    blocksPerSecond: trials.length === 0 ? 0 : Math.round((trials.length / elapsedSeconds) * 100) / 100,

    switchTrials: switchSet.length,
    switchCorrect: switchSet.filter((t) => t.isCorrect).length,
    switchAccuracy: accuracyOf(switchSet),

    nonSwitchTrials: nonSwitchSet.length,
    nonSwitchCorrect: nonSwitchSet.filter((t) => t.isCorrect).length,
    nonSwitchAccuracy: accuracyOf(nonSwitchSet),

    conflictTrials: conflictSet.length,
    conflictCorrect: conflictSet.filter((t) => t.isCorrect).length,
    conflictAccuracy: accuracyOf(conflictSet),

    switchAverageResponseTimeMs,
    nonSwitchAverageResponseTimeMs,
    switchCostMs: switchAverageResponseTimeMs - nonSwitchAverageResponseTimeMs,
    ruleSwitchCount: Math.max(0, ruleSwitchCount),
  }
}

/**
 * Judgment Time Attack Score — see lib/config/judgment.config.ts for the full
 * weight rationale. overallAccuracy dominates (70% base), switchAccuracy and
 * conflictAccuracy (Judgment's two signature sub-skills) each get 10% base,
 * and throughput (correctBlocks normalized against a realistic session
 * range) gets the smallest share (10%, never redistributed) since it's
 * ranked last in the stated priority.
 *
 * Normalized Score Calibration Audit(2026-09) — a session can genuinely have
 * zero switch and/or zero conflict trials (not "the player got them all
 * wrong," but "this metric never had anything to measure"): Assessment's
 * forced-single-rule session (judgment-game.tsx#buildFixedRuleBlocks) never
 * generates either, and even a real Free Play session could in principle end
 * before its first rule switch. Scoring an unmeasured metric as 0 would
 * silently cap the achievable score below 100 for a reason that has nothing
 * to do with how well the player actually did. This is a general,
 * denominator-driven rule, not an Assessment-specific branch: whichever of
 * switchWeight/conflictWeight belongs to a trial type this session has ZERO
 * of gets folded into accuracyWeight instead, so the weights always sum to
 * the same 100 total regardless of which trial types this particular session
 * happened to contain. throughputWeight is never redistributed — throughput
 * is always measurable (a session that processes nothing legitimately scores
 * 0 there, that's a real result, not a missing metric).
 */
export function calculateJudgmentScore(summary: JudgmentRawSummary): number {
  const { accuracyWeight, switchWeight, conflictWeight, throughputWeight } = JUDGMENT_SCORE_WEIGHTS
  const throughputScore = normalizeUpward(summary.correctBlocks, JUDGMENT_THROUGHPUT_MIN_BLOCKS, JUDGMENT_THROUGHPUT_MAX_BLOCKS)

  const hasSwitchTrials = summary.switchTrials > 0
  const hasConflictTrials = summary.conflictTrials > 0
  const effectiveAccuracyWeight =
    accuracyWeight + (hasSwitchTrials ? 0 : switchWeight) + (hasConflictTrials ? 0 : conflictWeight)
  const effectiveSwitchWeight = hasSwitchTrials ? switchWeight : 0
  const effectiveConflictWeight = hasConflictTrials ? conflictWeight : 0

  return clampScore(
    summary.overallAccuracy * effectiveAccuracyWeight +
      summary.switchAccuracy * effectiveSwitchWeight +
      summary.conflictAccuracy * effectiveConflictWeight +
      throughputScore * throughputWeight,
  )
}

/** Formats the raw summary into the display RawRecord — never invents a "pts" unit (GAME_SPEC §3-5), never overstates as a scientific claim. */
export function formatJudgmentRawRecord(summary: JudgmentRawSummary): RawRecord {
  return {
    primary: `${summary.correctBlocks}개 처리 (정확도 ${Math.round(summary.overallAccuracy * 100)}%)`,
    secondary: `최고 콤보 ${summary.maxCombo} · 전환 직후 정확도 ${Math.round(summary.switchAccuracy * 100)}%`,
  }
}
