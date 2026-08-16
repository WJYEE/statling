import type { RawRecord } from '@/lib/brain-bet'
import type { DodgeObstacleMode } from '@/lib/config/dodge-obstacle.config'
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
 * v3 (2026-08 후속 보정): only Extreme (mode 'endless') still ends on the
 * first collision, so `survivedMs`'s 25% weight only carries real signal
 * there — Easy/Normal/Hard (mode 'fixed-time') always run the full session
 * clock regardless of how many times the player got hit, so survivedMs is
 * now a near-constant for them and would just dilute the score with a
 * value that stops discriminating between players. For 'fixed-time' tiers
 * the formula drops to 회피율 70% + 반응속도 30% — every collision still
 * shows up as a direct penalty through the 회피율 term's denominator
 * (obstaclesDodged / (obstaclesDodged + collisions)), satisfying "충돌은
 * score에 명확한 감점" without needing a separate penalty term. 'endless'
 * keeps the original 회피율 50% + 반응속도 25% + 생존시간 25%.
 */
export const DODGE_OBSTACLE_SURVIVAL_SCORE_MIN_MS = 5_000
export const DODGE_OBSTACLE_SURVIVAL_SCORE_MAX_MS = 60_000

export function calculateDodgeObstacleScore(summary: DodgeObstacleRawSummary, mode: DodgeObstacleMode): number {
  const total = summary.obstaclesDodged + summary.collisions
  const dodgeRate = total > 0 ? summary.obstaclesDodged / total : 0
  const reactionScore =
    summary.averageMoveReactionMs > 0 ? scoreFromReactionTime(summary.averageMoveReactionMs, 200, 900) / 100 : 1

  if (mode === 'fixed-time') {
    return clampScore(dodgeRate * 70 + reactionScore * 30)
  }

  const survivalPart =
    normalizeUpward(summary.survivedMs, DODGE_OBSTACLE_SURVIVAL_SCORE_MIN_MS, DODGE_OBSTACLE_SURVIVAL_SCORE_MAX_MS) * 25
  return clampScore(dodgeRate * 50 + reactionScore * 25 + survivalPart)
}

export function formatDodgeObstacleRawRecord(summary: DodgeObstacleRawSummary, mode: DodgeObstacleMode): RawRecord {
  const seconds = (summary.survivedMs / 1000).toFixed(1)
  if (mode === 'fixed-time') {
    return {
      primary: `회피 ${summary.obstaclesDodged}개`,
      secondary: `충돌 ${summary.collisions}회 · ${seconds}초 플레이`,
    }
  }
  return {
    primary: `생존 ${seconds}초`,
    secondary: `회피 ${summary.obstaclesDodged}개`,
  }
}
