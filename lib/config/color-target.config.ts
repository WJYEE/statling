import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * v2 (2026-08 content rework): "특정 색만 클릭" is now a Stroop interference
 * task — a color word rendered in a (usually mismatched) ink color, with
 * TWO possible rules: 'ink' (click the rendered color, ignore the word) or
 * 'meaning' (click the color the word names, ignore how it's rendered).
 * Difficulty now comes from rule count + how often the rule switches +
 * incongruent-trial ratio, not from a shrinking session clock — see
 * STROOP_TIER_CONFIG. Session format changed from a real-time countdown to
 * a fixed trial count (closer to Judgment's block-queue shape than the old
 * continuously-reshuffling-objects format), so rule-switch checkpoints land
 * on clean block boundaries.
 */
export const COLOR_TARGET_GAME_VERSION = 'color_target_v2'

export const STROOP_INTRO_COUNTDOWN_SECONDS = 3
/** How long the "이번에는 OO을 클릭!" banner + 3-2-1 countdown blocks input when the rule switches — always shown, even at Extreme, so a player is never caught not knowing the current rule. */
export const STROOP_RULE_SWITCH_COUNTDOWN_SECONDS = 3

export type StroopRule = 'ink' | 'meaning'

export interface StroopColorDef {
  id: string
  label: string
  colorVar: string
}

/** 5 colors total; a tier only ever uses its first `colorCount` of these. */
export const STROOP_COLOR_PALETTE: StroopColorDef[] = [
  { id: 'red', label: '빨강', colorVar: '--stat-spatial' },
  { id: 'blue', label: '파랑', colorVar: '--stat-focus' },
  { id: 'green', label: '초록', colorVar: '--stat-judgment' },
  { id: 'yellow', label: '노랑', colorVar: '--stat-reaction' },
  { id: 'purple', label: '보라', colorVar: '--stat-reasoning' },
]

export interface StroopTierConfig {
  /** 1 entry = never switches (Easy/Normal); 2 entries = switches every `blockSize` trials (Hard/Extreme). */
  rules: StroopRule[]
  /** Trials per rule-block before a switch. Only meaningful when rules.length > 1. */
  blockSize: number
  trialCount: number
  /** Share of trials where the word's meaning and ink color differ — the real interference trials. */
  incongruentRatio: number
  perTrialTimeLimitMs: number
  /** How many of STROOP_COLOR_PALETTE's 5 colors are in play this tier. */
  colorCount: number
}

export const STROOP_TIER_CONFIG: Record<GameDifficulty, StroopTierConfig> = {
  easy: { rules: ['ink'], blockSize: 16, trialCount: 16, incongruentRatio: 0.35, perTrialTimeLimitMs: 2200, colorCount: 3 },
  normal: { rules: ['ink'], blockSize: 20, trialCount: 20, incongruentRatio: 0.5, perTrialTimeLimitMs: 1800, colorCount: 4 },
  hard: { rules: ['ink', 'meaning'], blockSize: 6, trialCount: 24, incongruentRatio: 0.6, perTrialTimeLimitMs: 1600, colorCount: 5 },
  extreme: { rules: ['ink', 'meaning'], blockSize: 3, trialCount: 24, incongruentRatio: 0.75, perTrialTimeLimitMs: 1400, colorCount: 5 },
}

export function getStroopTierConfig(difficulty: GameDifficulty): StroopTierConfig {
  return STROOP_TIER_CONFIG[difficulty]
}
