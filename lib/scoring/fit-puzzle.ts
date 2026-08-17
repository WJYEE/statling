import type { RawRecord } from '@/lib/brain-bet'
import type { FitPuzzleRoundResult, FitPuzzleRawSummary } from '@/lib/game/types'
import { clampScore } from '@/lib/scoring/shared'

export function summarizeFitPuzzleRounds(rounds: FitPuzzleRoundResult[]): FitPuzzleRawSummary {
  return {
    totalRounds: rounds.length,
    roundsCompleted: rounds.filter((r) => r.completed).length,
    correctPlacements: rounds.reduce((s, r) => s + r.correctPlacements, 0),
    misplacements: rounds.reduce((s, r) => s + r.misplacements, 0),
    rotations: rounds.reduce((s, r) => s + r.rotations, 0),
    totalCompletionMs: rounds.reduce((s, r) => s + r.completionMs, 0),
  }
}

/**
 * "퍼즐 끼우기" — 공간감각 스탯의 두 게임 중 공간 구성 능력(조각들을 올바른
 * 위치·방향으로 조합해 전체를 완성하는 능력)을 측정하는 쪽. 짝인 "회전 도형
 * 찾기"(lib/scoring/spatial.ts)는 공간 인지 능력을 측정한다.
 *
 * v2 (2026-08 QA 3차 보정): normalizedScore = 완료 시간 80% + 회전 조작 효율
 * 20% (이전: 정확도 60% + 완료 시간 30% + 회전 효율 10%). misplacements
 * 기반 accuracy 항을 제거했다 — 모든 조각이 서로 다른 footprint를 갖도록
 * 재설계된 이후로는 오배치가 "잘못된 조각을 착각해서" 발생하는 경우가
 * 사실상 없어져(조각만 보고도 목표 슬롯을 거의 구분 가능), 이 항이 항상
 * 100%에 가깝게 고정되어 사실상 아무것도 구분하지 못하는 죽은 가중치가
 * 되었기 때문. 대신 완료 시간(제한 시간 내에 못 끝내면 completionMs가 이미
 * 제한 시간 전체로 기록되므로 "미완료"도 자연히 최저 시간 점수로
 * 반영됨)을 압도적 1순위 지표로, 회전 낭비 여부를 2순위(tie-breaker) 신호로
 * 사용한다 — "형태를 얼마나 빨리 파악해 회전·배치했는가"가 공간 구성 능력의
 * 핵심이라는 판단. misplacements 필드 자체는 FitPuzzleRawSummary/
 * FitPuzzleRoundResult에 남겨뒀다(세션 중 오답 피드백/바운스백 로직이 여전히
 * 이 값을 세므로) — 스코어링에서만 더 이상 사용하지 않는다.
 */
export function calculateFitPuzzleScore(summary: FitPuzzleRawSummary, totalTimeLimitMs: number): number {
  const timeRatio = Math.max(0, 1 - summary.totalCompletionMs / totalTimeLimitMs)
  const timePart = timeRatio * 80

  const expectedRotations = summary.correctPlacements // one rotation each is "expected", not wasted
  const wastedRotations = Math.max(0, summary.rotations - expectedRotations)
  const rotationPenalty = Math.min(20, wastedRotations * 4)
  const manipulationPart = 20 - rotationPenalty

  return clampScore(timePart + manipulationPart)
}

export function formatFitPuzzleRawRecord(summary: FitPuzzleRawSummary): RawRecord {
  return {
    primary: `완성 시간 ${Math.round(summary.totalCompletionMs / 1000)}초`,
    secondary: `회전 ${summary.rotations}회`,
  }
}
