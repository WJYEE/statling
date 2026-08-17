import {
  CLEAN_COOLDOWN_MS,
  CLEAN_EXP,
  CLEAN_HAPPINESS_EFFECT,
  FEED_COOLDOWN_MS,
  FEED_EXP,
  PET_COOLDOWN_MS,
  PET_INTIMACY_EXP,
  PLAY_COOLDOWN_MS,
  PLAY_EXP,
  PLAY_VARIANT_IDS,
  ROOM_CLEAN_EFFECT_AMOUNT,
  ROOM_CLEAN_MAX_THRESHOLD,
  SHOWER_COOLDOWN_MS,
  SHOWER_EXP,
  TALK_COOLDOWN_MS,
  TALK_INTIMACY_EXP,
} from '@/lib/config/pet-care.config'
import {
  feedEffectFor,
  feedMessageFor,
  feedTier,
  petAlreadySatisfied,
  petEffectFor,
  petIntimacyTier,
  petMessageFor,
  playEffectFor,
  playMessageFor,
  playTier,
  showerEffectFor,
  showerMessageFor,
  showerTier,
} from '@/lib/pet-care/care-reactions'
import { clampStat } from '@/lib/pet-care/decay'
import { applyExpGain, getNewlyUnlockedRewards, type ExpGainResult } from '@/lib/pet-care/leveling'
import type { CareActionId, CareStatId, PetAnimation, PetCareState, RoomCareState } from '@/lib/pet-care/types'

export interface CooldownStatus {
  onCooldown: boolean
  remainingMs: number
}

const COOLDOWN_MS_BY_ACTION: Record<CareActionId, number> = {
  feed: FEED_COOLDOWN_MS,
  shower: SHOWER_COOLDOWN_MS,
  clean: CLEAN_COOLDOWN_MS,
  play: PLAY_COOLDOWN_MS,
  pet: PET_COOLDOWN_MS,
  talk: TALK_COOLDOWN_MS,
}

export function getCooldownStatus(
  cooldowns: PetCareState['cooldowns'],
  action: CareActionId,
  now: Date,
): CooldownStatus {
  const last = cooldowns[action]
  if (last === undefined) return { onCooldown: false, remainingMs: 0 }
  const elapsed = now.getTime() - last
  const remaining = COOLDOWN_MS_BY_ACTION[action] - elapsed
  return remaining > 0 ? { onCooldown: true, remainingMs: remaining } : { onCooldown: false, remainingMs: 0 }
}

export interface ActionResult {
  petState: PetCareState
  roomState?: RoomCareState
  deltas: Partial<Record<CareStatId, number>>
  message?: string
  animation: PetAnimation
  playVariantId?: string
  dialogue?: string
  levelUp?: ExpGainResult
  /** Raw intimacy EXP actually granted by this action (0 when on cooldown or the action's "already satisfied" tier gates it to 0) — GA4's Growth|xp_earned event reads this directly rather than re-deriving it from intimacyExp before/after (which level-rollover would make lossy). */
  expGained: number
}

function gainExp(state: PetCareState, exp: number): { intimacyLevel: number; intimacyExp: number; levelUp?: ExpGainResult } {
  if (exp <= 0) return { intimacyLevel: state.intimacyLevel, intimacyExp: state.intimacyExp }
  const result = applyExpGain({ intimacyLevel: state.intimacyLevel, intimacyExp: state.intimacyExp }, exp)
  return { intimacyLevel: result.level, intimacyExp: result.exp, levelUp: result.leveledUp ? result : undefined }
}

function withCooldown(state: PetCareState, action: CareActionId, now: Date): PetCareState {
  return { ...state, cooldowns: { ...state.cooldowns, [action]: now.getTime() } }
}

function applyDeltas(stats: PetCareState['stats'], deltas: Partial<Record<CareStatId, number>>): PetCareState['stats'] {
  const next = { ...stats }
  for (const [key, delta] of Object.entries(deltas) as [CareStatId, number][]) {
    next[key] = clampStat(next[key] + delta)
  }
  return next
}

/** Cooldown is checked here (not just in the UI) so a stale double-click can never double-apply an effect. */
function blockedByCooldown(state: PetCareState, action: CareActionId, now: Date): ActionResult | null {
  const status = getCooldownStatus(state.cooldowns, action, now)
  if (!status.onCooldown) return null
  return { petState: state, deltas: {}, animation: 'idle', expGained: 0 }
}

export function performFeed(state: PetCareState, now: Date): ActionResult {
  const blocked = blockedByCooldown(state, 'feed', now)
  if (blocked) return blocked

  const tier = feedTier(state.stats.satiety)
  const deltas = feedEffectFor(tier)
  const nextStats = applyDeltas(state.stats, deltas)

  const feedExpGained = tier === 'high' ? 0 : FEED_EXP
  const expGain = gainExp(state, feedExpGained)
  const petState = withCooldown(
    { ...state, stats: nextStats, intimacyLevel: expGain.intimacyLevel, intimacyExp: expGain.intimacyExp },
    'feed',
    now,
  )

  // Always 'eat' here — whether the already-full case still shows 'eat' art
  // or falls back to idle/happy is a mapping decision, made from raw stats
  // by characterStateForInteraction, not duplicated here.
  return { petState, deltas, message: feedMessageFor(tier), animation: 'eat', levelUp: expGain.levelUp, expGained: feedExpGained }
}

export function performShower(state: PetCareState, now: Date): ActionResult {
  const blocked = blockedByCooldown(state, 'shower', now)
  if (blocked) return blocked

  const tier = showerTier(state.stats.cleanliness)
  const deltas = showerEffectFor(tier)
  const nextStats = applyDeltas(state.stats, deltas)

  const showerExpGained = tier === 'high' ? 0 : SHOWER_EXP
  const expGain = gainExp(state, showerExpGained)
  const petState = withCooldown(
    { ...state, stats: nextStats, intimacyLevel: expGain.intimacyLevel, intimacyExp: expGain.intimacyExp },
    'shower',
    now,
  )

  // Always 'wash' here — already-clean reading as 'surprised' instead is a
  // mapping decision, made from raw stats by characterStateForInteraction.
  return { petState, deltas, message: showerMessageFor(tier), animation: 'wash', levelUp: expGain.levelUp, expGained: showerExpGained }
}

export function performClean(state: PetCareState, room: RoomCareState, now: Date): ActionResult {
  const blocked = blockedByCooldown(state, 'clean', now)
  if (blocked) return { ...blocked, roomState: room }

  const alreadyClean = room.cleanliness >= ROOM_CLEAN_MAX_THRESHOLD
  const deltas: Partial<Record<CareStatId, number>> = alreadyClean ? {} : { happiness: CLEAN_HAPPINESS_EFFECT }

  const nextRoom: RoomCareState = alreadyClean
    ? room
    : { cleanliness: clampStat(room.cleanliness + ROOM_CLEAN_EFFECT_AMOUNT), lastCleanedAt: now.toISOString() }

  const nextStats = applyDeltas(state.stats, deltas)

  const cleanExpGained = alreadyClean ? 0 : CLEAN_EXP
  const expGain = gainExp(state, cleanExpGained)
  const petState = withCooldown(
    { ...state, stats: nextStats, intimacyLevel: expGain.intimacyLevel, intimacyExp: expGain.intimacyExp },
    'clean',
    now,
  )

  return {
    petState,
    roomState: nextRoom,
    deltas,
    message: alreadyClean ? '방이 아직 깨끗해요!' : undefined,
    animation: 'shake',
    levelUp: expGain.levelUp,
    expGained: cleanExpGained,
  }
}

export function performPlay(state: PetCareState, now: Date): ActionResult {
  const blocked = blockedByCooldown(state, 'play', now)
  if (blocked) return blocked

  const tier = playTier(state.stats.energy, state.stats.happiness)
  const deltas = playEffectFor(tier, state.stats.happiness)
  const nextStats = applyDeltas(state.stats, deltas)

  const candidates = PLAY_VARIANT_IDS.filter((id) => id !== state.lastPlayVariantId)
  const playVariantId = candidates[Math.floor(Math.random() * candidates.length)]

  const playExpGained = tier === 'high' ? 0 : PLAY_EXP
  const expGain = gainExp(state, playExpGained)
  const petState = withCooldown(
    {
      ...state,
      stats: nextStats,
      intimacyLevel: expGain.intimacyLevel,
      intimacyExp: expGain.intimacyExp,
      lastPlayVariantId: playVariantId,
    },
    'play',
    now,
  )

  // Always 'play' here — already-plenty-happy falling back to idle/happy art
  // instead is a mapping decision, made from raw stats by characterStateForInteraction.
  return { petState, deltas, message: playMessageFor(tier), animation: 'play', playVariantId, levelUp: expGain.levelUp, expGained: playExpGained }
}

export function performPet(state: PetCareState, now: Date): ActionResult {
  const blocked = blockedByCooldown(state, 'pet', now)
  if (blocked) return blocked

  const tier = petIntimacyTier(state.intimacyLevel)
  const alreadySatisfied = petAlreadySatisfied(state.stats.affection)
  const deltas = petEffectFor(alreadySatisfied)
  const nextStats = applyDeltas(state.stats, deltas)

  const petExpGained = alreadySatisfied ? 0 : PET_INTIMACY_EXP
  const expGain = gainExp(state, petExpGained)
  const petState = withCooldown(
    { ...state, stats: nextStats, intimacyLevel: expGain.intimacyLevel, intimacyExp: expGain.intimacyExp },
    'pet',
    now,
  )

  // Always 'pet' here — already-loved-plenty falling back to idle/happy/love
  // art instead (or to 'angry' when over-petted) is a mapping decision, made
  // from raw stats/isOverPetted by characterStateForInteraction.
  return { petState, deltas, message: petMessageFor(tier, alreadySatisfied), animation: 'pet', levelUp: expGain.levelUp, expGained: petExpGained }
}

/**
 * 대화's answer step — the response text/expression comes entirely from
 * whichever choice the player just picked (see lib/pet-care/talk-questions.ts,
 * hooks/use-pet-talk.ts), so this only ever handles the mechanical side
 * (cooldown + intimacy exp), same shape every other performXxx here does.
 * Called once per answered question, never on the question just opening —
 * browsing/canceling a question costs nothing.
 */
export function performTalkAnswer(state: PetCareState, now: Date, responseText: string): ActionResult {
  const blocked = blockedByCooldown(state, 'talk', now)
  if (blocked) return { ...blocked, dialogue: responseText }

  const expGain = gainExp(state, TALK_INTIMACY_EXP)
  const petState = withCooldown(
    { ...state, intimacyLevel: expGain.intimacyLevel, intimacyExp: expGain.intimacyExp },
    'talk',
    now,
  )

  return { petState, deltas: {}, animation: 'talk', dialogue: responseText, levelUp: expGain.levelUp, expGained: TALK_INTIMACY_EXP }
}

/**
 * A care-action-free stat/exp change — the entry point autonomous bonuses
 * (sleep energy, playAlone happiness) and minigame reactions use, so they
 * flow through the exact same clamp/exp/level-up pipeline as a button press
 * without needing their own cooldown (none applies; the caller — PetMemory's
 * daily bonus cap, or the single-consume pendingGameReaction — already
 * guards against re-applying).
 */
export function buildDirectEffect(
  state: PetCareState,
  deltas: Partial<Record<CareStatId, number>>,
  expGain: number,
  now: Date,
): ActionResult {
  const nextStats = applyDeltas(state.stats, deltas)
  const gained = gainExp(state, expGain)
  const petState = {
    ...state,
    stats: nextStats,
    intimacyLevel: gained.intimacyLevel,
    intimacyExp: gained.intimacyExp,
    lastUpdatedAt: now.toISOString(),
  }
  return { petState, deltas, animation: 'idle', levelUp: gained.levelUp, expGained: Math.max(0, expGain) }
}

export { getNewlyUnlockedRewards }
