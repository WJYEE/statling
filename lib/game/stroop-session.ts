import { STROOP_COLOR_PALETTE, type StroopRule, type StroopTierConfig } from '@/lib/config/color-target.config'

export interface StroopTrialSpec {
  trialIndex: number
  rule: StroopRule
  /** Which color WORD is displayed. */
  wordColorId: string
  /** Which color the word is RENDERED in. */
  inkColorId: string
  /** = inkColorId when rule is 'ink', = wordColorId when rule is 'meaning'. */
  correctColorId: string
  /** True when wordColorId !== inkColorId — the real Stroop-interference trials. */
  isIncongruent: boolean
  /** True only for a rule-block's first trial, and only when that block isn't the session's first (mirrors JudgmentTrial.isSwitchTrial). */
  isSwitchTrial: boolean
}

/** Generates a full, fixed-length trial sequence up front for one session — deterministic length (config.trialCount), rule blocks laid out by config.blockSize/config.rules. */
export function generateStroopSession(config: StroopTierConfig): StroopTrialSpec[] {
  const colors = STROOP_COLOR_PALETTE.slice(0, config.colorCount)
  const trials: StroopTrialSpec[] = []

  for (let i = 0; i < config.trialCount; i++) {
    const blockIndex = Math.floor(i / config.blockSize)
    const rule = config.rules[blockIndex % config.rules.length]
    const isSwitchTrial = config.rules.length > 1 && i > 0 && i % config.blockSize === 0

    const wordColor = colors[Math.floor(Math.random() * colors.length)]
    const makeIncongruent = Math.random() < config.incongruentRatio
    const otherColors = colors.filter((c) => c.id !== wordColor.id)
    const inkColor = makeIncongruent ? otherColors[Math.floor(Math.random() * otherColors.length)] : wordColor
    const correctColorId = rule === 'ink' ? inkColor.id : wordColor.id

    trials.push({
      trialIndex: i,
      rule,
      wordColorId: wordColor.id,
      inkColorId: inkColor.id,
      correctColorId,
      isIncongruent: inkColor.id !== wordColor.id,
      isSwitchTrial,
    })
  }

  return trials
}
