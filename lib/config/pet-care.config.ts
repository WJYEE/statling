import type { CareStatId } from '@/lib/pet-care/types'

/** Per-hour decay rate applied while the player is away (and, in small slices, while the screen is open). */
export const DECAY_PER_HOUR: Record<CareStatId, number> = {
  satiety: 2,
  cleanliness: 1,
  affection: 0, // affection never decays purely from time passing — only used to whittle it via interactions
  energy: 1,
  happiness: 0, // happiness decays indirectly (see decay.ts), never a flat per-hour rate of its own
}

/** Never let offline decay drop a stat below this, so a multi-day absence never reads as "abandoned pet". */
export const DECAY_FLOOR: Record<CareStatId, number> = {
  satiety: 15,
  cleanliness: 15,
  affection: 0,
  energy: 10,
  happiness: 20,
}

/** However long the player was actually away, decay is computed for at most this long. */
export const MAX_OFFLINE_DECAY_MS = 48 * 60 * 60 * 1000

/** How often the live (screen-open) decay tick recomputes elapsed-time decay. */
export const LIVE_TICK_INTERVAL_MS = 60_000

/**
 * Energy no longer has a manual "sleep" button — instead, once energy drops
 * below mood.ts's SLEEPY_THRESHOLD the pet automatically reads as asleep and
 * recovers energy on this tick (both live, screen-open ticks in
 * hooks/use-pet-care.ts, and offline elapsed time in decay.ts use the same
 * rate) — energy is meant to never meaningfully block play right now.
 */
export const AUTO_SLEEP_ENERGY_PER_TICK = 15
export const AUTO_SLEEP_TICK_MS = 10_000

export const ROOM_DECAY_PER_HOUR = 1.5
export const ROOM_CLEANLINESS_FLOOR = 10
/** Below this, the room reads as "messy" — drives both the `roomMessy` secondary mood tag and the 청소 button's attention dot. */
export const ROOM_ATTENTION_THRESHOLD = 35

export const STAT_MIN = 0
export const STAT_MAX = 100

/** Below this, a stat is "in need" and its action button shows an attention dot. */
export const ATTENTION_THRESHOLD: Record<CareStatId, number> = {
  satiety: 40,
  cleanliness: 40,
  affection: 35,
  energy: 30,
  happiness: 35,
}

/**
 * Care-action cooldowns — unified to a short 5-10s band (previously
 * 3s-90s, wildly inconsistent) so no action ever blocks play for long.
 * Each action's cooldown is tracked independently (see
 * PetCareState['cooldowns'] / getCooldownStatus in lib/pet-care/actions.ts),
 * and the countdown badge (CareActionButton) already reads whichever action
 * is on cooldown without affecting the others.
 */
export const FEED_COOLDOWN_MS = 8_000
export const SHOWER_COOLDOWN_MS = 8_000
export const CLEAN_COOLDOWN_MS = 8_000
export const PLAY_COOLDOWN_MS = 10_000
export const PET_COOLDOWN_MS = 5_000
export const TALK_COOLDOWN_MS = 5_000

export const FEED_SATIETY_MAX_THRESHOLD = 95
export const SHOWER_CLEANLINESS_MAX_THRESHOLD = 90
export const ROOM_CLEAN_MAX_THRESHOLD = 90

export const FEED_EFFECT = { satiety: 20, happiness: 5 }
export const FEED_EXP = 3

export const SHOWER_EFFECT = { cleanliness: 25, happiness: 3 }
export const SHOWER_EXP = 3

export const ROOM_CLEAN_EFFECT_AMOUNT = 40
export const CLEAN_HAPPINESS_EFFECT = 4
export const CLEAN_EXP = 3

export const PLAY_EFFECT = { happiness: 15, affection: 5, energy: -10 }
export const PLAY_EXP = 5
export const PLAY_VARIANT_IDS = ['ball', 'star-chase', 'run'] as const
/** Above this happiness, "놀기" reads as already-satisfied — same "already full" shape as FEED_SATIETY_MAX_THRESHOLD/SHOWER_CLEANLINESS_MAX_THRESHOLD (suppressed deltas, art falls back to idle/happy instead of the 'play' art). */
export const PLAY_HAPPINESS_MAX_THRESHOLD = 95

export const PET_EFFECT = { affection: 4, happiness: 3 }
export const PET_INTIMACY_EXP = 1
/** Above this affection, "쓰다듬기" reads as already-satisfied — same shape as PLAY_HAPPINESS_MAX_THRESHOLD. */
export const PET_AFFECTION_MAX_THRESHOLD = 95

/**
 * "너무 많이 쓰다듬었을 때" (angry tester art) — PET_COOLDOWN_MS already
 * spaces individual clicks out, so this counts uses over a longer rolling
 * window instead of a rapid-click burst. Crossing the count resets the
 * window (so it fires once per streak, not on every pet after).
 */
export const OVERPET_COUNT_THRESHOLD = 5
export const OVERPET_WINDOW_MS = 90_000
export const OVERPET_REACTION_HOLD_MS = 2_000

export const TALK_INTIMACY_EXP = 1

/**
 * Energy cost of completing one Free Play (성장시키기) mini-game round —
 * NOT the Initial Assessment's 6 diagnostic games, and NOT a mid-game
 * abandon/restart (see game-flow.tsx#recordSkillCompletion, the single
 * choke point every valid completion already flows through). Deliberately
 * a flat per-round cost with no expGain, applied via
 * lib/pet-care/actions.ts#buildDirectEffect — same "no cooldown, caller
 * guards against re-applying" shape PLAY_EFFECT's own energy cost uses,
 * just smaller since a mini-game round is a lighter beat than a full 놀기
 * action. Temporary placeholder value — revisit once overall mini-game
 * difficulty/normalizedScore balancing is done (see difficulty.config.ts's
 * own "임시" note).
 */
export const FREE_PLAY_ENERGY_COST = 5

export const REACTION_FEEDBACK_MS = 1600

/**
 * Thresholds driving the 3-tier care-action reaction split (lib/pet-care/care-reactions.ts)
 * and the state-request initiated dialogue (lib/pet-care/initiated-dialogue.ts) — a
 * separate concern from `ATTENTION_THRESHOLD` (which only drives the button's attention
 * dot) and from mood.ts's own thresholds (which drive the single representative Mood).
 */
export const PET_REACTION_THRESHOLDS = {
  lowHunger: 35,
  lowCleanliness: 35,
  lowHappiness: 35,
  lowAffection: 35,
  lowEnergy: 30,
  highHappiness: 75,
}

/** Ring-buffer sizes for PetMemory's history fields (lib/pet-care/pet-memory.ts). */
export const RECENT_CARE_ACTION_HISTORY_SIZE = 10
export const RECENT_INITIATED_DIALOGUE_HISTORY_SIZE = 8
export const RECENT_GAME_HISTORY_SIZE = 10

/** "최근 게임 기억 대사" conditions — see lib/pet-care/pet-memory.ts#shouldShowMemoryComment. */
export const MEMORY_COMMENT_MIN_STAT_COUNT = 3
export const MEMORY_COMMENT_MIN_STAT_RATIO = 0.4
