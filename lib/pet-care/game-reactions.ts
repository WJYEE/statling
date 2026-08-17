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
 * One dialogue line per GAME per tier — keyed by `PendingGameReaction.gameId`
 * (see lib/pet-care/pet-memory.ts#recordGameCompletion: `result.variant ??
 * result.gameId`), not just the 6 stats, so a game's own reaction actually
 * reflects what was played (e.g. "장애물을 피했어" only ever shows up after
 * 장애물 피하기, never after 신호 반응). Every "meh" line stays encouraging
 * and never frames the attempt as a failure (spec: "실패로 단정하지 않는다").
 *
 * The 6 "classic" games' variant-less `gameId` equals their stat name
 * (`'reaction'`, `'memory'`, ...) — that's deliberate, not a coincidence: it
 * means `pickReactionDialogue`'s fallback for an unrecognized gameId can
 * just re-key into this same table by `pending.stat`, with no separate
 * fallback table to keep in sync.
 */
const GAME_REACTION_DIALOGUE: Record<string, Record<ReactionTier, string[]>> = {
  reaction: {
    great: ['신호가 뜨자마자 딱 눌렀어!', '반응 속도가 번개 같았어!'],
    good: ['타이밍 좋게 눌렀어.', '신호를 잘 캐치했어.'],
    meh: ['이번엔 살짝 늦었나 봐.', '다음엔 더 빠르게 반응할 수 있을 거야.'],
  },
  'dodge-run': {
    great: ['장애물을 하나도 안 놓쳤어!', '요리조리 정말 잘 피했어!'],
    good: ['장애물을 곧잘 피해다녔어.', '몇 개 부딪혔지만 잘 버텼어.'],
    meh: ['장애물이 좀 빡빡했나 봐.', '다음엔 더 잘 피할 수 있을 거야.'],
  },
  memory: {
    great: ['패턴을 하나도 안 틀렸어!', '기억력이 진짜 좋다!'],
    good: ['차근차근 잘 기억해냈어.', '패턴을 곧잘 따라갔어.'],
    meh: ['패턴이 좀 헷갈렸나 봐.', '다음엔 더 또렷하게 기억날 거야.'],
  },
  'story-recall': {
    great: ['봤던 물건을 하나도 안 놓쳤어!', '어디에 뭐가 있었는지 정확히 기억했네!'],
    good: ['물건 위치를 곧잘 기억해냈어.', '차근차근 잘 떠올렸어.'],
    meh: ['물건이 좀 헷갈렸나 봐.', '다음엔 더 눈에 익을 거야.'],
  },
  focus: {
    great: ['끝까지 흔들림 없이 집중했어!', '방해 요소에도 안 흔들렸어!'],
    good: ['꾸준히 잘 지켜봤어.', '침착하게 잘 찾아냈어.'],
    meh: ['집중이 살짝 흐트러졌나 봐.', '다음엔 더 잘 보일 거야.'],
  },
  'color-target': {
    great: ['색이 바뀌어도 헷갈리지 않았어!', '규칙이 바뀔 때마다 딱 알아챘어!'],
    good: ['색깔 구분을 곧잘 했어.', '규칙 전환에 잘 적응했어.'],
    meh: ['색이 좀 헷갈렸나 봐.', '다음엔 더 빨리 알아챌 수 있을 거야.'],
  },
  judgment: {
    great: ['조건이 바뀌어도 정확히 선택했어!', '판단력이 정말 빨랐어!'],
    good: ['차분하게 잘 골랐어.', '괜찮은 선택이었어.'],
    meh: ['조금 헷갈리는 상황이었나 봐.', '다음엔 더 수월할 거야.'],
  },
  'best-choice': {
    great: ['상황에 딱 맞는 선택만 골랐어!', '고민 없이 정확하게 선택했어!'],
    good: ['괜찮은 선택들이었어.', '차근차근 잘 골랐어.'],
    meh: ['이번엔 선택이 좀 아쉬웠나 봐.', '다음엔 더 나은 선택을 할 수 있을 거야.'],
  },
  spatial: {
    great: ['회전한 모양을 바로바로 찾아냈어!', '머릿속으로 돌리는 감각이 정말 좋아!'],
    good: ['하나씩 잘 맞춰나갔어.', '침착하게 잘 풀었어.'],
    meh: ['모양이 좀 헷갈렸나 봐.', '다음엔 더 눈에 익을 거야.'],
  },
  'fit-puzzle': {
    great: ['조각을 딱딱 돌려서 완벽하게 맞췄어!', '퍼즐 맞추는 손이 예술이야!'],
    good: ['조각을 곧잘 돌려 맞췄어.', '차근차근 퍼즐을 채워나갔어.'],
    meh: ['조각 방향이 좀 헷갈렸나 봐.', '다음엔 더 수월하게 맞출 수 있을 거야.'],
  },
  reasoning: {
    great: ['숨은 규칙을 바로 알아챘어!', '논리적으로 척척 풀어냈어!'],
    good: ['차근차근 규칙을 찾아냈어.', '꽤 그럴듯한 답이었어.'],
    meh: ['규칙이 좀 까다로웠나 봐.', '다음엔 더 눈에 들어올 거야.'],
  },
  'number-pattern': {
    great: ['숫자 규칙을 정확하게 짚어냈어!', '패턴 읽는 눈이 예리하다!'],
    good: ['차근차근 규칙을 찾아냈어.', '숫자 흐름을 잘 따라갔어.'],
    meh: ['숫자 규칙이 좀 까다로웠나 봐.', '다음엔 더 눈에 들어올 거야.'],
  },
}

/**
 * "미니게임 최고기록 갱신 시" — a small, separate pool per game (not per
 * tier: a personal best always outranks great/good/meh, see
 * resolveGameReaction) so the celebration line actually names what was
 * just broken a record at, instead of one generic "신기록!" for all 12
 * games. Same gameId-first/stat-fallback keying as GAME_REACTION_DIALOGUE.
 */
const GAME_REACTION_PERSONAL_BEST_DIALOGUE: Record<string, string[]> = {
  reaction: ['지금까지 중에 제일 빨랐어!!', '이 속도 실화야?! 완전 신기록이야!'],
  'dodge-run': ['이렇게 오래 안 부딪힌 건 처음이야!', '장애물 피하기 신기록! 완전 날렵했어!'],
  memory: ['기억력 신기록이야! 대단해!', '이렇게 많이 외운 건 처음이야!'],
  'story-recall': ['물건 기억하기 신기록이야!', '이렇게 정확히 기억한 건 처음이야!'],
  focus: ['집중력 신기록! 완전 몰입했었어!', '이렇게 오래 집중한 건 처음이야!'],
  'color-target': ['색깔 구분 신기록이야!', '이렇게 안 헷갈린 건 처음이야!'],
  judgment: ['판단력 신기록이야!', '이렇게 정확한 선택은 처음이야!'],
  'best-choice': ['선택하기 신기록이야!', '이렇게 잘 고른 건 처음이야!'],
  spatial: ['도형 찾기 신기록이야!', '이렇게 빨리 찾은 건 처음이야!'],
  'fit-puzzle': ['퍼즐 맞추기 신기록이야!', '이렇게 빨리 맞춘 건 처음이야!'],
  reasoning: ['규칙 찾기 신기록이야!', '이렇게 빨리 알아챈 건 처음이야!'],
  'number-pattern': ['숫자 규칙 신기록이야!', '이렇게 잘 맞춘 건 처음이야!'],
}

/** Falls back to the stat's own (classic-game) pool when `gameId` doesn't match any registered game — defends against a stale/unrecognized id without ever throwing or showing nothing. */
function pickReactionDialogue(gameId: string, stat: StatId, tier: ReactionTier): string {
  const pool = (GAME_REACTION_DIALOGUE[gameId] ?? GAME_REACTION_DIALOGUE[stat])[tier]
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Same gameId-first/stat-fallback lookup as pickReactionDialogue, for the personal-best pool. */
function pickPersonalBestDialogue(gameId: string, stat: StatId): string {
  const pool = GAME_REACTION_PERSONAL_BEST_DIALOGUE[gameId] ?? GAME_REACTION_PERSONAL_BEST_DIALOGUE[stat]
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
 * dialogue/effect table for all 6 stats, and pickReactionDialogue/
 * pickPersonalBestDialogue fall back to the stat-level pool for any
 * unrecognized gameId. A personal-best completion always plays 'celebrate'
 * (-> the 'excited' art) regardless of which stat/game it was —
 * "미니게임 최고기록 갱신 시" outranks the per-stat animation table below —
 * and its dialogue comes from GAME_REACTION_PERSONAL_BEST_DIALOGUE instead
 * of the normal tier pool, so a record-breaking run gets a stronger, game-
 * specific line rather than just a regular "great" one.
 */
export function resolveGameReaction(pending: PendingGameReaction): GameReactionResolution {
  const tier = reactionTierFor(pending.normalizedScore)
  const dialogue = pending.isPersonalBest
    ? pickPersonalBestDialogue(pending.gameId, pending.stat)
    : pickReactionDialogue(pending.gameId, pending.stat, tier)
  return {
    animation: pending.isPersonalBest ? 'celebrate' : ANIMATION_BY_STAT[pending.stat],
    dialogue,
    deltas: { happiness: GAME_REACTION_HAPPINESS_BY_TIER[tier] },
    intimacyExp: GAME_REACTION_EXP_GAIN,
  }
}

export function energyDeltaFor(pending: PendingGameReaction): number {
  return GAME_REACTION_ENERGY_BY_TIER[reactionTierFor(pending.normalizedScore)]
}
