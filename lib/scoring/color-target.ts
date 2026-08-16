import type { RawRecord } from '@/lib/brain-bet'
import type { ColorTargetClickEvent, ColorTargetRawSummary } from '@/lib/game/types'
import { clampScore, scoreFromReactionTime } from '@/lib/scoring/shared'

export function summarizeColorTargetEvents(events: ColorTargetClickEvent[]): ColorTargetRawSummary {
  const correctCount = events.filter((e) => e.kind === 'correct').length
  const wrongCount = events.filter((e) => e.kind === 'wrong').length
  const timeoutCount = events.filter((e) => e.kind === 'timeout').length
  const reactionTimes = events.filter((e) => e.kind === 'correct' && e.reactionTimeMs != null).map((e) => e.reactionTimeMs as number)
  const averageReactionTimeMs = reactionTimes.length > 0 ? reactionTimes.reduce((s, v) => s + v, 0) / reactionTimes.length : 0

  const switchTrials = events.filter((e) => e.isSwitchTrial)
  const switchCorrect = switchTrials.filter((e) => e.kind === 'correct').length

  return {
    totalTrials: events.length,
    correctCount,
    wrongCount,
    timeoutCount,
    accuracy: events.length > 0 ? correctCount / events.length : 0,
    averageReactionTimeMs: Math.round(averageReactionTimeMs),
    switchTrials: switchTrials.length,
    switchCorrect,
    switchAccuracy: switchTrials.length > 0 ? switchCorrect / switchTrials.length : 0,
  }
}

/**
 * normalizedScore = 정확도 70% + 평균 반응 속도 30% — same weighting shape
 * as the pre-rework version. switchAccuracy is deliberately NOT folded into
 * the score: Easy/Normal never switch rules at all (switchTrials always 0),
 * so giving it a normalizedScore weight would make those tiers structurally
 * unable to reach the same ceiling as Hard/Extreme for reasons that have
 * nothing to do with how well they were played. It's still tracked and
 * shown as its own raw stat (see formatColorTargetRawRecord) — same
 * "component score, not ranking sort key" treatment as Judgment's own
 * switchAccuracy.
 */
export function calculateColorTargetScore(summary: ColorTargetRawSummary): number {
  const accuracyPart = summary.accuracy * 70
  const reactionPart = summary.averageReactionTimeMs > 0 ? (scoreFromReactionTime(summary.averageReactionTimeMs, 350, 1500) / 100) * 30 : 0
  return clampScore(accuracyPart + reactionPart)
}

export function formatColorTargetRawRecord(summary: ColorTargetRawSummary): RawRecord {
  const secondaryParts = [`평균 반응 ${summary.averageReactionTimeMs}ms`]
  if (summary.switchTrials > 0) secondaryParts.push(`전환 직후 정확도 ${Math.round(summary.switchAccuracy * 100)}%`)
  return {
    primary: `정확도 ${Math.round(summary.accuracy * 100)}%`,
    secondary: secondaryParts.join(' · '),
  }
}
