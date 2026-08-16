import type { RawRecord } from '@/lib/brain-bet'
import type { BestChoiceAnswer, BestChoiceRawSummary } from '@/lib/game/types'
import { clampScore, scoreFromReactionTime } from '@/lib/scoring/shared'

export function summarizeBestChoiceAnswers(answers: BestChoiceAnswer[]): BestChoiceRawSummary {
  const correctCount = answers.filter((a) => a.isCorrect).length
  const answered = answers.filter((a) => !a.timedOut)
  const averageResponseTimeMs = answered.length > 0 ? answered.reduce((s, a) => s + a.responseTimeMs, 0) / answered.length : 0

  return {
    totalRounds: answers.length,
    correctCount,
    accuracy: answers.length > 0 ? correctCount / answers.length : 0,
    averageResponseTimeMs: Math.round(averageResponseTimeMs),
    timeouts: answers.filter((a) => a.timedOut).length,
  }
}

/** normalizedScore = 정확도 80% + 응답 속도 20% — a fast wrong choice never outscores a slower correct one, since accuracy dominates the formula. */
export function calculateBestChoiceScore(summary: BestChoiceRawSummary): number {
  const accuracyPart = summary.accuracy * 80
  const timePart = summary.averageResponseTimeMs > 0 ? (scoreFromReactionTime(summary.averageResponseTimeMs, 1200, 6000) / 100) * 20 : 0
  return clampScore(accuracyPart + timePart)
}

export function formatBestChoiceRawRecord(summary: BestChoiceRawSummary): RawRecord {
  return {
    primary: `정답 ${summary.correctCount}/${summary.totalRounds}`,
    secondary: `정확도 ${Math.round(summary.accuracy * 100)}%`,
  }
}
