import type { RawRecord } from '@/lib/brain-bet'
import type { InputType, NumberPatternAnswer, NumberPatternRawSummary } from '@/lib/game/types'
import { clampScore, normalizeForInput, scoreFromReactionTime } from '@/lib/scoring/shared'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function summarizeNumberPatternAnswers(answers: NumberPatternAnswer[]): NumberPatternRawSummary {
  const correctAnswers = answers.filter((a) => a.isCorrect).length
  // v3: sessions are now drawn from a single tier-exclusive pool (see
  // number-pattern-data.ts), so 'hard'/'extreme'-tagged questions only ever
  // appear in a Hard/Extreme player's own session — count both as the
  // "hardest content answered" bucket instead of only 'hard'.
  const hardAnswers = answers.filter((a) => a.difficulty === 'hard' || a.difficulty === 'extreme')
  const answered = answers.filter((a) => !a.timedOut)
  const averageResponseTimeMs =
    answered.length > 0 ? answered.reduce((s, a) => s + a.responseTimeMs, 0) / answered.length : 0

  return {
    totalQuestions: answers.length,
    correctAnswers,
    accuracy: answers.length > 0 ? correctAnswers / answers.length : 0,
    hardCorrect: hardAnswers.filter((a) => a.isCorrect).length,
    hardTotal: hardAnswers.length,
    averageResponseTimeMs: Math.round(averageResponseTimeMs),
  }
}

/**
 * "숫자 규칙" — 추리력 스탯의 두 게임 중 수리적 규칙 추론(숫자 수열의 규칙을
 * 찾는 능력)을 측정하는 쪽. 짝인 "규칙 찾기"(lib/scoring/reasoning.ts)는
 * 시각적·추상적 규칙 추론을 측정한다.
 *
 * normalizedScore = 정확도 75% + 난이도 보너스 15% + 시간 10% (spec §9) — a
 * fast wrong guess never beats a considered correct one, since accuracy is
 * by far the largest weight and the time component only kicks in on
 * answered (non-timed-out) questions. hardDifficultyBonus(hardCorrect/
 * hardTotal, 0-1)를 유지하는 이유: 이 게임엔 규칙 찾기의
 * difficultyWeightedAccuracy 같은 난이도 가중 정확도가 따로 없어서,
 * hardCorrect/hardTotal이 유일하게 고난도 문제 수행을 반영하는 수단이다
 * (규칙 찾기에는 반대로 이걸 추가하지 않는다 — 이미 난이도 가중 정확도가
 * 있어 중복 반영이 되므로).
 */
export function calculateNumberPatternScore(summary: NumberPatternRawSummary, inputType: InputType): number {
  const accuracyScore = clamp01(summary.accuracy)
  const hardDifficultyBonus = clamp01(summary.hardTotal > 0 ? summary.hardCorrect / summary.hardTotal : 0)
  const timeScore = clamp01(
    summary.averageResponseTimeMs > 0
      ? scoreFromReactionTime(normalizeForInput(summary.averageResponseTimeMs, inputType), 2500, 13000) / 100
      : 0,
  )
  return clampScore(accuracyScore * 75 + hardDifficultyBonus * 15 + timeScore * 10)
}

export function formatNumberPatternRawRecord(summary: NumberPatternRawSummary): RawRecord {
  return {
    primary: `정답 ${summary.correctAnswers}/${summary.totalQuestions}`,
    secondary: `최고 난이도 ${summary.hardCorrect}문제 성공`,
  }
}
