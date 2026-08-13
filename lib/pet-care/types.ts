import type { StatId } from '@/lib/brain-bet'
import type { CareActionId } from '@/lib/room'

/** The pet's 5 core care stats — 0-100, clamped everywhere they're written. */
export type CareStatId = 'satiety' | 'cleanliness' | 'affection' | 'energy' | 'happiness'

/** Single representative emotion, computed from `stats` by lib/pet-care/mood.ts — priority order, never combined. */
export type Mood = 'hungry' | 'dirty' | 'lonely' | 'sleepy' | 'sad' | 'joyful' | 'happy' | 'calm'

/** Extra badges that can show alongside `Mood` — independent axes (e.g. the room, not the pet itself). */
export type SecondaryTag = 'roomMessy'

/**
 * Visual motion the character plays right now. Distinct from `Mood`: an
 * action (e.g. `eat`) briefly overrides whatever idle motion the current
 * mood would otherwise pick, then falls back to the mood's idle animation.
 *
 * The last 10 values (lookLeft..ponder) are autonomous-only — never
 * triggered by a user button, only by lib/pet-care/autonomous-actions.ts.
 * `sleep`/`idle` are shared between the mood-idle fallback and the
 * autonomous scheduler's own `sleep`/`idle` picks, since they already read
 * the same either way. `ponder` is the "가끔 랜덤으로" musing beat behind the
 * 'thinking' art — see autonomous-action-selector.ts's BASE_WEIGHTS.
 */
export type PetAnimation =
  | 'idle'
  | 'jump'
  | 'eat'
  | 'wash'
  | 'shake'
  | 'play'
  | 'pet'
  | 'talk'
  | 'sleep'
  | 'sad'
  | 'lookLeft'
  | 'lookRight'
  | 'hop'
  | 'walk'
  | 'askFood'
  | 'askPlay'
  | 'askAttention'
  | 'celebrate'
  | 'playAlone'
  | 'ponder'

/** Horizontal zone the pet currently occupies inside the Room canvas — see lib/pet-care/autonomous-action-selector.ts#zoneAfter. */
export type PetZone = 'left' | 'center' | 'right'

/** One tick of the autonomous behavior scheduler (hooks/use-pet-autonomy.ts). Never triggered by user input. */
export type AutonomousActionId =
  | 'idle'
  | 'lookLeft'
  | 'lookRight'
  | 'smallHop'
  | 'walkLeft'
  | 'walkRight'
  | 'sleep'
  | 'askFood'
  | 'askPlay'
  | 'askAttention'
  | 'celebrate'
  | 'playAlone'
  | 'ponder'

/** Priority state the Room screen composes speech/animation from — see lib/pet-care/interaction-mode.ts. Purely a derived display value; gating itself is done via linear hook call order (see room-screen.tsx). */
export type PetInteractionMode = 'idle' | 'autonomous' | 'userAction' | 'speaking' | 'levelUp' | 'gameReaction'

/** Per-action last-successful-use timestamps (epoch ms). Missing key = never used = always available. */
export interface CooldownState {
  feed?: number
  shower?: number
  clean?: number
  play?: number
  pet?: number
  talk?: number
}

export interface PetCareState {
  stats: Record<CareStatId, number>
  /** Care/intimacy level — deliberately named apart from the unrelated 6-stat "성장" (growth) system. */
  intimacyLevel: number
  /** Exp accumulated toward the next level; reset to (overflow) on level-up. */
  intimacyExp: number
  /** Reward levels already granted — guards against re-granting on reload/replay. */
  unlockedRewardLevels: number[]
  /**
   * The most recent GIFT_LEVEL_INTERVAL milestone (see
   * lib/config/character-state.config.ts) crossed and not yet fully claimed.
   * Tapping the Statling (hooks/use-pet-care.ts#claimGift) grants this
   * level's Statling Decoration to the inventory but deliberately leaves
   * this set, so the gift PNG/bubble stay up behind the reward popup
   * (components/brain-bet/gift-reward-popup.tsx) — it only becomes null once
   * the popup's 확인 button fires `dismissGiftClaim`. See
   * lib/deco-supported-assets.ts's `level_gift` unlockSource for the level
   * -> Statling Decoration mapping. Deliberately separate from
   * `unlockedRewardLevels`/leveling.ts's REWARD_UNLOCKS, an unrelated older
   * placeholder table.
   */
  giftReadyLevel: number | null
  /** ISO timestamp — the ground truth decay is computed from. */
  lastUpdatedAt: string
  cooldowns: CooldownState
  /** Last "놀기" mini-variant shown, so the next one is never a repeat. */
  lastPlayVariantId?: string
}

/**
 * The room's cleanliness — deliberately a separate concept from the pet's
 * own `cleanliness` stat (which "씻기" manages). Storage-only; has nothing
 * to do with RoomState (furniture layout) in lib/room/room-state.ts.
 */
export interface RoomCareState {
  cleanliness: number
  lastCleanedAt: string
}

/**
 * A minigame completion waiting to be shown as a pet reaction next time the
 * player is in the Room — written by lib/pet-care/pet-memory.ts#recordGameCompletion
 * (called from game-flow.tsx's on*Complete handlers), consumed exactly once by
 * hooks/use-pet-memory.ts. `gameId` is the specific registered game
 * (lib/game/game-registry.ts key, e.g. 'reasoning-number-pattern') when a
 * variant exists, otherwise just the stat itself for a classic game.
 */
export interface PendingGameReaction {
  gameId: string
  stat: StatId
  normalizedScore: number
  accuracy?: number
  /** Mirrors GameResult.isPersonalBest — a personal-best completion always reads as 'excited' (see lib/pet-care/game-reactions.ts), regardless of which stat it was. */
  isPersonalBest: boolean
  completedAt: string
}

export type { CareActionId }
