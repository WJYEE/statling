/**
 * Every minigame now has 4 tiers. Easy is practice-only (always available,
 * never contributes to a representative record or currentStats — see
 * lib/game/player-skill-storage.ts). Normal is the baseline (what Intro/
 * First Play always uses). Hard/Extreme unlock progressively per-game based
 * on the player's own best score at the tier below (see
 * lib/config/difficulty.config.ts's NORMAL_TO_HARD_SCORE/
 * HARD_TO_EXTREME_SCORE and lib/game/difficulty-unlock.ts).
 */
export type GameDifficulty = 'easy' | 'normal' | 'hard' | 'extreme'

/** Ascending order — index also doubles as "tier rank" for unlock/representative-record comparisons. */
export const GAME_DIFFICULTY_ORDER: GameDifficulty[] = ['easy', 'normal', 'hard', 'extreme']

export interface GameDifficultyDef {
  id: GameDifficulty
  label: string
}

export const GAME_DIFFICULTIES: Record<GameDifficulty, GameDifficultyDef> = {
  easy: { id: 'easy', label: 'EASY' },
  normal: { id: 'normal', label: 'NORMAL' },
  hard: { id: 'hard', label: 'HARD' },
  extreme: { id: 'extreme', label: 'EXTREME' },
}

/**
 * Title-case label for the "스탯명 (난이도)" tag shown next to a stat name on
 * every mini-game's common header (spec: Free Play difficulty UX
 * consistency) — e.g. "순발력 (Easy)". Deliberately separate from
 * GAME_DIFFICULTIES[x].label (all-caps "EASY", used on the tier-select
 * cards in GrowGameScreen), since that spot wants the shoutier all-caps
 * treatment and this one doesn't.
 */
export const GAME_DIFFICULTY_DISPLAY_LABEL: Record<GameDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  extreme: 'Extreme',
}
