import type { RawRecord } from '@/lib/brain-bet'
import type { DodgeObstacleEvent, DodgeObstacleRawSummary } from '@/lib/game/types'
import { clampScore, normalizeUpward, scoreFromReactionTime } from '@/lib/scoring/shared'

export function summarizeDodgeObstacleEvents(
  events: DodgeObstacleEvent[],
  survivedMs: number,
  moveReactionTimesMs: number[],
): DodgeObstacleRawSummary {
  const obstaclesDodged = events.filter((e) => e.kind === 'dodged').length
  const collisions = events.filter((e) => e.kind === 'collided').length
  const averageMoveReactionMs =
    moveReactionTimesMs.length > 0
      ? moveReactionTimesMs.reduce((s, v) => s + v, 0) / moveReactionTimesMs.length
      : 0

  return {
    obstaclesDodged,
    collisions,
    survivedMs,
    averageMoveReactionMs: Math.round(averageMoveReactionMs),
  }
}

/**
 * A run always ends on the first collision now (no fixed session length —
 * see dodge-obstacle-game.tsx), so `survivedMs / durationMs` no longer means
 * anything: there is no denominator. normalizedScore = 회피율 50% + 반응
 * 속도 25% + 생존시간 25%, clampScore 0-100. Survival time's share went up
 * (was 15% of a fixed-duration bonus) since it's now this endless mode's
 * actual headline stat, normalized against a flat 5s-60s band shared by
 * every tier — a higher tier's faster ramp already makes reaching the same
 * wall-clock survival time objectively harder, so the band itself doesn't
 * need to vary per tier (Hard/Extreme scores are never compared to each
 * other's leaderboard anyway, only within their own tier).
 */
export const DODGE_OBSTACLE_SURVIVAL_SCORE_MIN_MS = 5_000
export const DODGE_OBSTACLE_SURVIVAL_SCORE_MAX_MS = 60_000

export function calculateDodgeObstacleScore(summary: DodgeObstacleRawSummary): number {
  const total = summary.obstaclesDodged + summary.collisions
  const dodgeRate = total > 0 ? summary.obstaclesDodged / total : 0
  const dodgePart = dodgeRate * 50
  const reactionPart =
    summary.averageMoveReactionMs > 0
      ? (scoreFromReactionTime(summary.averageMoveReactionMs, 200, 900) / 100) * 25
      : 25
  const survivalPart =
    normalizeUpward(summary.survivedMs, DODGE_OBSTACLE_SURVIVAL_SCORE_MIN_MS, DODGE_OBSTACLE_SURVIVAL_SCORE_MAX_MS) * 25
  return clampScore(dodgePart + reactionPart + survivalPart)
}

export function formatDodgeObstacleRawRecord(summary: DodgeObstacleRawSummary): RawRecord {
  const seconds = (summary.survivedMs / 1000).toFixed(1)
  return {
    primary: `생존 ${seconds}초`,
    secondary: `회피 ${summary.obstaclesDodged}개`,
  }
}
