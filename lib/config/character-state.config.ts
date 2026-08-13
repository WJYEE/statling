/**
 * Every threshold/timing knob that decides WHICH of the 24 character-art
 * states (lib/character-state-assets.ts) shows, centralized here so tuning
 * "how low is hungry" or "how long does the reconnect flash last" is always
 * a one-line config edit, never a hunt through the mapping logic itself.
 *
 * Distinct from lib/config/pet-care.config.ts, which owns action EFFECTS
 * (how much a button press changes a stat, cooldowns, exp) — this file only
 * owns thresholds that pick an EXPRESSION for a given stat/state snapshot.
 * Draft values — easy to retune once real usage data exists.
 */

// ---- lib/pet-care/mood.ts's Mood bands (relocated here from local consts) ----
export const HUNGRY_THRESHOLD = 30
export const DIRTY_THRESHOLD = 30
export const LONELY_THRESHOLD = 30
export const SLEEPY_THRESHOLD = 20
export const SAD_THRESHOLD = 30
export const JOYFUL_THRESHOLD = 85
export const HAPPY_THRESHOLD = 65

/**
 * 'tired' art band: energy below this but at/above SLEEPY_THRESHOLD (energy
 * that low is already the 'sleep' art, checked first — see
 * characterStateForInteraction). Distinct from Mood itself (Mood has no
 * 'tired' value) — this is purely an art-selection tier layered on top of
 * whichever non-urgent mood (sad/joyful/happy/calm) is currently active.
 */
export const TIRED_ENERGY_THRESHOLD = 45

/**
 * 'sick' art: satiety AND cleanliness BOTH at/below these — deliberately
 * checked independently of Mood (mood.ts's own hungry-before-dirty priority
 * means Mood alone can never represent "both are bad at once"). Replaces the
 * old cleanliness-only escalation, which didn't match the "정말 아픈" reading
 * spec now calls for.
 */
export const SICK_CLEANLINESS_THRESHOLD = 15
export const SICK_SATIETY_THRESHOLD = 15

/**
 * 'happy' art requires ALL FOUR of satiety/cleanliness/affection/happiness
 * to clear this bar — a holistic "genuinely doing well" read, stricter than
 * Mood's own happy/joyful (which is happiness-only). When Mood reads
 * happy/joyful but the other three stats aren't equally high, the art falls
 * back to plain 'idle' rather than overstating how the pet's doing.
 */
export const HAPPY_ALL_STATS_THRESHOLD = 65

/** 'love' art: affection this high (practically maxed) outranks the ordinary happy/joyful read. */
export const LOVE_AFFECTION_THRESHOLD = 100
/** 'excited' art: happiness this high (practically maxed) outranks the ordinary happy/joyful read — but still loses to 'love' (see the priority ladder in characterStateForInteraction). */
export const EXCITED_HAPPINESS_THRESHOLD = 100

/** 'love' art's other trigger: total minigame completions logged in PetMemory reaching this — "꾸준히 플레이했을 때" — see lib/pet-care/pet-memory.ts#isConsistentPlayer. */
export const LOVE_CONSISTENT_PLAY_COUNT_THRESHOLD = 20

/**
 * "너무 많이 대화했을 때" (angry) — mirrors OVERPET_* in pet-care.config.ts
 * exactly, just for the 대화 button instead of 쓰다듬기.
 */
export const OVERTALK_COUNT_THRESHOLD = 5
export const OVERTALK_WINDOW_MS = 90_000
export const OVERTALK_REACTION_HOLD_MS = 2_000

/** How long the brief "화났어요" flash plays right after entering the Room following a long absence (visit-context.ts's isLongAbsence) — a momentary flourish, not a lingering mood. */
export const RECONNECT_ANGRY_HOLD_MS = 1_800

/**
 * Every N intimacy levels, a claimable 'gift' state opens (and stays open —
 * see PetCareState.giftReadyLevel) until the player taps the Statling. Set
 * to match the level_gift Statling Decoration table's interval
 * (SUPPORTED_DECO_ASSETS in lib/deco-supported-assets.ts, Lv.5/10/.../50) —
 * every gift now delivers a real Statling Decoration on claim (see
 * hooks/use-pet-care.ts#claimGift), no longer just a presentational moment.
 */
export const GIFT_LEVEL_INTERVAL = 5
