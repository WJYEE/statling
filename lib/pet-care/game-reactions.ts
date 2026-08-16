import {
  GAME_REACTION_ENERGY_BY_TIER,
  GAME_REACTION_EXP_GAIN,
  GAME_REACTION_GOOD_THRESHOLD,
  GAME_REACTION_GREAT_THRESHOLD,
  GAME_REACTION_HAPPINESS_BY_TIER,
} from '@/lib/config/game-reactions.config'
import type { GameResult } from '@/lib/game/types'
import type { CareStatId, PendingGameReaction, PetAnimation } from '@/lib/pet-care/types'
import type { StatId } from '@/lib/brain-bet'

export type ReactionTier = 'great' | 'good' | 'meh'

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0.5
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Pulls a 0-1 "how well did they do" signal out of whichever of the 12
 * GameResult shapes this is (see lib/game/types.ts) — none of them expose a
 * ready-made normalized score, only game-specific accuracy-like fields (or,
 * for a few, raw counts this derives a ratio from). Falls back to a neutral
 * 0.5 for anything unrecognized or zero-denominator, so a missing/odd field
 * never crashes the reaction — it just reads as an average result.
 */
export function normalizedScoreFor(result: GameResult): { normalizedScore: number; accuracy?: number } {
  let accuracy: number

  // Narrowing via `'field' in result.rawSummary` (a value-shape check) rather
  // than `result.variant === '...'` — the latter can't fully narrow the
  // rawSummary union here, since a couple of the classic games' `variant`
  // field is typed as plain `string | undefined` rather than a literal, so
  // TS can't exclude them just from an equality comparison. `result.rawSummary`
  // is re-read inside each case (not hoisted above the switch) so it picks up
  // the narrowing the switch on `result.gameId` already did.
  switch (result.gameId) {
    case 'reaction':
      accuracy =
        'obstaclesDodged' in result.rawSummary
          ? ratio(result.rawSummary.obstaclesDodged, result.rawSummary.obstaclesDodged + result.rawSummary.collisions)
          : ratio(result.rawSummary.validTrials, result.rawSummary.validTrials + result.rawSummary.falseStarts)
      break
    case 'memory':
      accuracy = 'weightedAccuracy' in result.rawSummary ? result.rawSummary.weightedAccuracy : result.rawSummary.accuracy
      break
    case 'focus':
      accuracy = 'weightedAccuracy' in result.rawSummary ? result.rawSummary.weightedAccuracy : result.rawSummary.accuracy
      break
    case 'judgment':
      accuracy = 'overallAccuracy' in result.rawSummary ? result.rawSummary.overallAccuracy : result.rawSummary.accuracy
      break
    case 'spatial':
      accuracy =
        'difficultyWeightedAccuracy' in result.rawSummary
          ? result.rawSummary.difficultyWeightedAccuracy
          : ratio(result.rawSummary.correctPlacements, result.rawSummary.correctPlacements + result.rawSummary.misplacements)
      break
    case 'reasoning':
      accuracy =
        'difficultyWeightedAccuracy' in result.rawSummary
          ? result.rawSummary.difficultyWeightedAccuracy
          : result.rawSummary.accuracy
      break
    default:
      accuracy = 0.5
  }

  accuracy = clamp01(Number.isFinite(accuracy) ? accuracy : 0.5)
  return { normalizedScore: Math.round(accuracy * 100), accuracy }
}

export function reactionTierFor(normalizedScore: number): ReactionTier {
  const score01 = normalizedScore / 100
  if (score01 >= GAME_REACTION_GREAT_THRESHOLD) return 'great'
  if (score01 >= GAME_REACTION_GOOD_THRESHOLD) return 'good'
  return 'meh'
}

/**
 * One dialogue line per stat per tier — every "meh" line stays encouraging
 * and never frames the attempt as a failure (spec: "실패로 단정하지 않는다").
 */
const GAME_REACTION_DIALOGUE: Record<StatId, Record<ReactionTier, string[]>> = {
  memory: {
    great: ['이야기 속 내용을 정말 잘 기억했네!', '기억해낸 게 오늘따라 꽤 많았어.'],
    good: ['차근차근 잘 기억해냈어.', '이야기를 잘 따라갔구나.'],
    meh: ['조금 헷갈리는 이야기였나 봐.', '다음엔 더 익숙해질 거야.'],
  },
  focus: {
    great: ['끝까지 집중한 게 느껴졌어!', '색이 바뀌어도 잘 따라갔네.'],
    good: ['꾸준히 잘 지켜봤어.', '침착하게 잘 찾아냈어.'],
    meh: ['조금 까다로운 문제였어.', '다음엔 더 잘 보일 거야.'],
  },
  reaction: {
    great: ['방금 정말 빨랐어!', '장애물을 멋지게 피했어.'],
    good: ['반응이 꽤 괜찮았어.', '잘 피해다녔어.'],
    meh: ['조금 서두른 것 같아.', '다음엔 더 빨라질 거야.'],
  },
  judgment: {
    great: ['조건을 보고 정말 잘 선택했네!', '빠르면서도 신중했어.'],
    good: ['차분하게 잘 골랐어.', '괜찮은 선택이었어.'],
    meh: ['조금 헷갈리는 상황이었나 봐.', '다음엔 더 수월할 거야.'],
  },
  spatial: {
    great: ['조각을 돌려 맞추는 게 멋졌어!', '모양을 보는 감각이 정말 좋았어.'],
    good: ['하나씩 잘 맞춰나갔어.', '침착하게 잘 풀었어.'],
    meh: ['조금 어려운 모양이었나 봐.', '다음엔 더 눈에 익을 거야.'],
  },
  reasoning: {
    great: ['숫자 규칙을 잘 찾아냈구나!', '규칙을 알아차리는 게 빨랐어.'],
    good: ['차근차근 규칙을 찾아냈어.', '꽤 그럴듯한 답이었어.'],
    meh: ['조금 까다로운 규칙이었어.', '다음엔 더 눈에 들어올 거야.'],
  },
}

function pickReactionDialogue(stat: StatId, tier: ReactionTier): string {
  const pool = GAME_REACTION_DIALOGUE[stat][tier]
  return pool[Math.floor(Math.random() * pool.length)]
}

const ANIMATION_BY_STAT: Record<StatId, PetAnimation> = {
  memory: 'lookLeft', // "생각하는" 모션 대용 — 별도 think 애니메이션 없이 기존 값 재사용
  focus: 'lookRight',
  reaction: 'hop',
  judgment: 'idle',
  spatial: 'lookLeft',
  reasoning: 'celebrate',
}

export interface GameReactionResolution {
  animation: PetAnimation
  dialogue: string
  deltas: Partial<Record<CareStatId, number>>
  intimacyExp: number
}

/**
 * Never fails on missing tier data — resolveGameReaction always has a full
 * dialogue/effect table for all 6 stats. A personal-best completion always
 * plays 'celebrate' (-> the 'excited' art) regardless of which stat it was —
 * "미니게임 최고기록 갱신 시" outranks the per-stat animation table below.
 */
export function resolveGameReaction(pending: PendingGameReaction): GameReactionResolution {
  const tier = reactionTierFor(pending.normalizedScore)
  return {
    animation: pending.isPersonalBest ? 'celebrate' : ANIMATION_BY_STAT[pending.stat],
    dialogue: pickReactionDialogue(pending.stat, tier),
    deltas: { happiness: GAME_REACTION_HAPPINESS_BY_TIER[tier] },
    intimacyExp: GAME_REACTION_EXP_GAIN,
  }
}

export function energyDeltaFor(pending: PendingGameReaction): number {
  return GAME_REACTION_ENERGY_BY_TIER[reactionTierFor(pending.normalizedScore)]
}
