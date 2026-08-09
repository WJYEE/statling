import { HARD_TO_EXTREME_SCORE, NORMAL_TO_HARD_SCORE } from '@/lib/config/difficulty.config'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { getBestScoreAtDifficulty, type PlayerSkillState } from '@/lib/game/player-skill-storage'

/**
 * Whether `difficulty` is playable right now for `gameId`. Easy and Normal
 * are always unlocked (Easy is pure practice, Normal is what Intro/First
 * Play always uses — see spec §17's role table). Hard unlocks once this
 * exact game's own best Normal score clears NORMAL_TO_HARD_SCORE; Extreme
 * unlocks once its best Hard score clears HARD_TO_EXTREME_SCORE. Unlock is
 * per-game, not global — clearing the bar on one game never unlocks Hard on
 * a different game.
 */
export function isDifficultyUnlocked(state: PlayerSkillState, gameId: string, difficulty: GameDifficulty): boolean {
  if (difficulty === 'easy' || difficulty === 'normal') return true
  if (difficulty === 'hard') return (getBestScoreAtDifficulty(state, gameId, 'normal') ?? 0) >= NORMAL_TO_HARD_SCORE
  return (getBestScoreAtDifficulty(state, gameId, 'hard') ?? 0) >= HARD_TO_EXTREME_SCORE
}

/**
 * Player-facing "how to unlock" copy for a locked tier — deliberately plain
 * natural language, never the internal normalizedScore/threshold numbers
 * (players only ever see their own raw records — ms/accuracy/time — never
 * this 0-100 composite, so a number here would be meaningless to them). See
 * unlockProgressPercent below for the numeric side of this, shown only as a
 * bar/percent, never as "70점"-style text. Null for Easy/Normal, which are
 * never locked and need no hint.
 */
export function unlockHintFor(difficulty: GameDifficulty): string | null {
  if (difficulty === 'hard') return 'Normal에서 좋은 기록을 달성하면 해금돼요.'
  if (difficulty === 'extreme') return 'Hard에서 좋은 기록을 달성하면 해금돼요.'
  return null
}

/**
 * 0-100 progress toward unlocking `difficulty`, derived from the exact same
 * score isDifficultyUnlocked checks against — for a locked-tier progress
 * bar/percent that never has to render the internal normalizedScore or
 * threshold itself. Null for Easy/Normal (nothing to unlock, no progress to
 * show). Naturally reaches 100 exactly when isDifficultyUnlocked flips true,
 * since both read the same underlying score/threshold pair.
 */
export function unlockProgressPercent(state: PlayerSkillState, gameId: string, difficulty: GameDifficulty): number | null {
  if (difficulty === 'easy' || difficulty === 'normal') return null
  const priorBest =
    difficulty === 'hard'
      ? (getBestScoreAtDifficulty(state, gameId, 'normal') ?? 0)
      : (getBestScoreAtDifficulty(state, gameId, 'hard') ?? 0)
  const target = difficulty === 'hard' ? NORMAL_TO_HARD_SCORE : HARD_TO_EXTREME_SCORE
  return Math.min(100, Math.max(0, Math.round((priorBest / target) * 100)))
}

/** "Hard 해금!" / "Extreme 해금!" — the card's state once a previously-locked tier becomes playable, replacing the lock/hint UI. Null for Easy/Normal, which were never locked to begin with. */
export function unlockedBadgeFor(difficulty: GameDifficulty): string | null {
  if (difficulty === 'hard') return 'Hard 해금!'
  if (difficulty === 'extreme') return 'Extreme 해금!'
  return null
}
