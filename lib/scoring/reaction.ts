import type { RawRecord } from '@/lib/brain-bet'
import {
  REACTION_ABNORMAL_MS_THRESHOLD,
  REACTION_ABNORMAL_REPEAT_COUNT,
} from '@/lib/config/reaction.config'
import type { InputType, InvalidReason, ReactionRawSummary, ReactionTrial } from '@/lib/game/types'
import { clampScore, normalizeForInput, scoreFromReactionTime } from '@/lib/scoring/shared'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = mean(values.map((v) => (v - avg) ** 2))
  return Math.sqrt(variance)
}

/**
 * Summarizes valid trials into the aggregate fields GAME_SPEC §29-30 lists.
 * Falls back to all-zero timing fields when every trial was a false start
 * (validTimes empty) — previously this let `medianReactionMs` come out `NaN`
 * (median of an empty array) and `bestReactionMs` come out `Infinity`
 * (`Math.min()` of nothing), both of which could reach the user as literal
 * "NaN ms" / "Best Infinity ms" on the result screen.
 */
export function summarizeReactionTrials(trials: ReactionTrial[]): ReactionRawSummary {
  const validTimes = trials
    .filter((t) => !t.isFalseStart && t.reactionMs != null)
    .map((t) => t.reactionMs as number)
  // Raw (unrounded) counterpart of validTimes, same trials/order — see
  // ReactionTrial.reactionMsRaw. Used only to derive medianReactionMsRaw.
  const validTimesRaw = trials
    .filter((t) => !t.isFalseStart && t.reactionMsRaw != null)
    .map((t) => t.reactionMsRaw as number)
  const falseStarts = trials.filter((t) => t.isFalseStart).length

  if (validTimes.length === 0) {
    return {
      validTrials: 0,
      falseStarts,
      averageReactionMs: 0,
      medianReactionMs: 0,
      bestReactionMs: 0,
      consistency: 0,
      medianReactionMsRaw: 0,
    }
  }

  return {
    validTrials: validTimes.length,
    falseStarts,
    averageReactionMs: Math.round(mean(validTimes)),
    medianReactionMs: Math.round(median(validTimes)),
    bestReactionMs: Math.min(...validTimes),
    consistency: Math.round(standardDeviation(validTimes)),
    medianReactionMsRaw: median(validTimesRaw),
  }
}

/**
 * Reaction Game Score — normalizedScore = 반응속도 70% + 유효시행비율 30%.
 * 다른 5개 스탯과 달리 "정확도 우선" 원칙을 그대로 적용하지 않는다 —
 * Reaction은 정답 개념이 없고, validityRatio(false start 안 하기)는 집중만
 * 하면 대부분 1.0에 가깝게 나와 실력 변별력이 거의 없다. "순발력"이라는
 * 스탯명이 실제로 측정하겠다고 약속하는 값은 속도이므로, 속도를 지배적
 * 가중치로 둔다. validity를 완전히 빼지 않는 이유는, 신호가 뜨기 전에
 * 마구 눌러 운 좋은 시행을 노리는 전략을 점수에서도 어느 정도 억제하기
 * 위함 — evaluateReactionValidity의 이상치 감지는 신호 이후 비정상적으로
 * 빠른 반응만 걸러내고 false start 자체는 걸러내지 않는다.
 * consistency(반응 편차)는 원래 공식에서도 base 1000 대비 0.5 가중치로
 * 사실상 영향이 없었으므로 점수에서 제외하고, raw record 표시용 참고
 * 값으로만 남긴다. 0–100으로 클램프되어 다른 게임(장애물 피하기 포함)의
 * gameScore와 직접 비교 가능하다.
 */
export const REACTION_SCORE_WEIGHTS = {
  /** speedScore(0-1, scoreFromReactionTime 결과) × this — 순발력의 핵심 지표. */
  speedWeight: 70,
  /** validityRatio(유효 시행 수 / 전체 시행 수, 0-1) × this. */
  validityWeight: 30,
}

/**
 * medianReactionMs가 이 값 이하면 만점, 이 값 이상이면 speedScore 0점.
 * 200ms는 생리학적 한계(~150ms)가 아니라 "집중하면 실제로 도달 가능한
 * 상위권" 수준으로 잡은 절대 기준값이다 — 이 프로젝트는 서버/집계 데이터가
 * 없어 다른 유저 대비 상대 백분위를 계산할 방법이 아직 없으므로(참고:
 * BaseGameResult.final은 실제 퍼센타일이 생기기 전까지 항상 undefined),
 * 지금은 절대 기준으로 대신한다. 실제 플레이 데이터가 쌓이면 재조정.
 */
export const REACTION_SPEED_BEST_MS = 200
export const REACTION_SPEED_WORST_MS = 500

/** `inputType` (see lib/game/device.ts#detectDevice) normalizes the measured ms for touch's inherent input latency before scoring — never applied to the raw displayed record. */
export function calculateReactionScore(summary: ReactionRawSummary, inputType: InputType): number {
  const { validityWeight, speedWeight } = REACTION_SCORE_WEIGHTS
  const totalTrials = summary.validTrials + summary.falseStarts
  const validityRatio = totalTrials > 0 ? summary.validTrials / totalTrials : 0
  const speedScore =
    summary.validTrials > 0
      ? scoreFromReactionTime(
          normalizeForInput(summary.medianReactionMs, inputType),
          REACTION_SPEED_BEST_MS,
          REACTION_SPEED_WORST_MS,
        ) / 100
      : 0

  return clampScore(validityRatio * validityWeight + speedScore * speedWeight)
}

/**
 * Formats the raw summary into the display RawRecord — never invents a "pts"
 * unit (GAME_SPEC §3-5). Leads with the average (mean, not the scoring-only
 * median) so the headline number reflects the whole session rather than a
 * single lucky trial, with the best single trial right alongside it — a
 * bare "Best" figure with no average to compare it against previously read
 * as the only number that mattered.
 */
export function formatReactionRawRecord(summary: ReactionRawSummary): RawRecord {
  if (summary.validTrials === 0) {
    return { primary: '기록 없음', secondary: `False Start ${summary.falseStarts}회` }
  }
  const secondaryParts = [`최고 기록 ${summary.bestReactionMs}ms`]
  if (summary.falseStarts > 0) secondaryParts.push(`False Start ${summary.falseStarts}회`)
  return {
    primary: `평균 ${summary.averageReactionMs}ms`,
    secondary: secondaryParts.join(' · '),
  }
}

/**
 * Minimal anti-cheat (GAME_SPEC §33, §95-96): flags sessions with clearly
 * abnormal timing without invalidating a whole session from a single fast
 * trial — only repeated abnormal trials trigger the flag.
 */
export function evaluateReactionValidity(trials: ReactionTrial[]): {
  isValidAttempt: boolean
  invalidReason: InvalidReason
} {
  const validTimes = trials
    .filter((t) => !t.isFalseStart && t.reactionMs != null)
    .map((t) => t.reactionMs as number)
  const abnormalCount = validTimes.filter((ms) => ms <= REACTION_ABNORMAL_MS_THRESHOLD).length

  if (abnormalCount >= REACTION_ABNORMAL_REPEAT_COUNT) {
    return { isValidAttempt: false, invalidReason: 'abnormally_fast_repeat' }
  }
  return { isValidAttempt: true, invalidReason: null }
}
