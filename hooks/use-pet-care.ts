'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AUTO_SLEEP_ENERGY_PER_TICK,
  AUTO_SLEEP_TICK_MS,
  LIVE_TICK_INTERVAL_MS,
  ROOM_ATTENTION_THRESHOLD,
  ATTENTION_THRESHOLD,
  REACTION_FEEDBACK_MS,
  OVERPET_COUNT_THRESHOLD,
  OVERPET_WINDOW_MS,
  OVERPET_REACTION_HOLD_MS,
} from '@/lib/config/pet-care.config'
import {
  GIFT_LEVEL_INTERVAL,
  OVERTALK_COUNT_THRESHOLD,
  OVERTALK_REACTION_HOLD_MS,
  OVERTALK_WINDOW_MS,
} from '@/lib/config/character-state.config'
import {
  buildDirectEffect,
  getCooldownStatus,
  performClean,
  performFeed,
  performPet,
  performPlay,
  performShower,
  performTalkAnswer,
  type ActionResult,
  type CooldownStatus,
} from '@/lib/pet-care/actions'
import { applyPetDecay, applyRoomDecay, clampStat } from '@/lib/pet-care/decay'
import { computeMood, computeSecondaryTags } from '@/lib/pet-care/mood'
import { expRequiredForLevel, getNewlyUnlockedRewards, type RewardUnlock } from '@/lib/pet-care/leveling'
import { createDefaultPetCareState, loadPetCareState, savePetCareState } from '@/lib/pet-care/pet-care-storage'
import { getLevelGiftDecoAsset, type SupportedDecoAsset } from '@/lib/deco-supported-assets'
import { grantDecoReward, loadDecoInventoryState, saveDecoInventoryState } from '@/lib/deco-inventory-storage'
import { createDefaultRoomCareState, loadRoomCareState, saveRoomCareState } from '@/lib/pet-care/room-care-storage'
import type { CareActionId, CareStatId, Mood, PetAnimation, PetCareState, RoomCareState, SecondaryTag } from '@/lib/pet-care/types'
import { useSound } from '@/hooks/use-sound'
import { trackCareInteraction } from '@/lib/missions/mission-tracker'

const ACTION_IDS: CareActionId[] = ['feed', 'shower', 'clean', 'play', 'pet', 'talk']

export interface FloatingDelta {
  id: string
  statId: CareStatId
  delta: number
}

export interface LevelUpEvent {
  key: number
  level: number
  unlocks: RewardUnlock[]
}

/**
 * `lonely` deliberately does NOT force 'sad' here (unlike a real sad mood) —
 * it stays plain 'idle' so the animation switch's idle-family `break` cases
 * let it fall through to characterStateForInteraction's mood switch, which
 * resolves lonely to its own 'cry' art. Forcing 'sad' here would intercept
 * that resolution earlier (the 'sad' PetAnimation case returns 'sad'
 * unconditionally), making 'cry' unreachable in practice.
 */
function idleAnimationForMood(mood: Mood): PetAnimation {
  if (mood === 'sleepy') return 'sleep'
  if (mood === 'sad') return 'sad'
  return 'idle'
}

/** Highest GIFT_LEVEL_INTERVAL milestone among the levels just crossed, or null if none — see PetCareState.giftReadyLevel. */
function giftMilestoneCrossed(levelsGained: number[]): number | null {
  const milestones = levelsGained.filter((level) => level % GIFT_LEVEL_INTERVAL === 0)
  return milestones.length > 0 ? Math.max(...milestones) : null
}

let deltaIdSeq = 0
function nextDeltaId(): string {
  deltaIdSeq += 1
  return `delta_${Date.now()}_${deltaIdSeq}`
}

/**
 * Orchestrates PetCareState + RoomCareState for the Room screen: loads +
 * applies offline decay on mount (mirrors the existing
 * `useState(() => loadSavedRoomState())` idiom already used for room
 * layout — RoomScreen only ever mounts client-side, so this never causes a
 * hydration mismatch), ticks decay live while the screen stays open, and
 * exposes a single `performAction` dispatcher plus derived
 * mood/animation/speech/floating-delta view state.
 */
export function usePetCare() {
  const { play } = useSound()
  const [petState, setPetState] = useState<PetCareState>(() => applyPetDecay(loadPetCareState(), new Date()))
  const [roomState, setRoomState] = useState<RoomCareState>(() => applyRoomDecay(loadRoomCareState(), new Date()))
  const [animationOverride, setAnimationOverride] = useState<PetAnimation | null>(null)
  const [speech, setSpeech] = useState<string | null>(null)
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingDelta[]>([])
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null)
  const [lastUserActionAt, setLastUserActionAt] = useState<number | null>(null)
  const [, forceCooldownTick] = useState(0)
  /** True for OVERPET_REACTION_HOLD_MS right after a petting streak crosses OVERPET_COUNT_THRESHOLD — see the 'pet' case in performAction below. Session-only, not persisted. */
  const [isOverPetted, setIsOverPetted] = useState(false)
  const petClickTimestampsRef = useRef<number[]>([])
  /** Mirrors isOverPetted/petClickTimestampsRef exactly, for the 'talk' action — see the 'talk' case in performAction below. */
  const [isOverTalked, setIsOverTalked] = useState(false)
  const talkClickTimestampsRef = useRef<number[]>([])

  const petStateRef = useRef(petState)
  petStateRef.current = petState
  const roomStateRef = useRef(roomState)
  roomStateRef.current = roomState
  const timeoutsRef = useRef<number[]>([])

  const mood = computeMood(petState.stats)
  const secondaryTags = computeSecondaryTags(roomState.cleanliness)

  // Persist the mount-time decay pass right away so a quick reload doesn't
  // keep recomputing from an even-older baseline.
  useEffect(() => {
    savePetCareState(petStateRef.current)
    saveRoomCareState(roomStateRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  // Live decay tick — real elapsed time each interval, so background-tab
  // throttling never desyncs the total (a late-firing tick just sees a
  // larger elapsedMs, not a wrong one).
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = new Date()
      setPetState((prev) => {
        const next = applyPetDecay(prev, now)
        savePetCareState(next)
        return next
      })
      setRoomState((prev) => {
        const next = applyRoomDecay(prev, now)
        saveRoomCareState(next)
        return next
      })
    }, LIVE_TICK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  // Auto-sleep energy recovery — no manual "sleep" button; once mood reads
  // as 'sleepy' (energy below mood.ts's SLEEPY_THRESHOLD) the pet is already
  // shown asleep (see idleAnimationForMood below), and while that's true
  // energy climbs by AUTO_SLEEP_ENERGY_PER_TICK every AUTO_SLEEP_TICK_MS
  // until it climbs back out of the sleepy range on its own. Mirrors
  // decay.ts's applyOfflineEnergyRecovery, which covers the same recovery
  // for time spent away from the screen entirely.
  useEffect(() => {
    if (mood !== 'sleepy') return
    const id = window.setInterval(() => {
      setPetState((prev) => {
        const next = {
          ...prev,
          stats: { ...prev.stats, energy: clampStat(prev.stats.energy + AUTO_SLEEP_ENERGY_PER_TICK) },
        }
        savePetCareState(next)
        return next
      })
    }, AUTO_SLEEP_TICK_MS)
    return () => window.clearInterval(id)
  }, [mood])

  // Cooldown countdown display — only ticks (every second) while at least
  // one action is actually on cooldown, so idle screens never re-render for
  // nothing.
  useEffect(() => {
    const anyOnCooldown = ACTION_IDS.some((id) => getCooldownStatus(petState.cooldowns, id, new Date()).onCooldown)
    if (!anyOnCooldown) return
    const id = window.setInterval(() => forceCooldownTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [petState.cooldowns])

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id))
      timeoutsRef.current = []
    },
    [],
  )

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    timeoutsRef.current.push(id)
  }

  function showFloatingDeltas(deltas: Partial<Record<CareStatId, number>>) {
    const entries = Object.entries(deltas) as [CareStatId, number][]
    const withIds = entries.filter(([, v]) => v !== 0).map(([statId, delta]) => ({ id: nextDeltaId(), statId, delta }))
    if (withIds.length === 0) return
    setFloatingDeltas((prev) => [...prev, ...withIds])
    schedule(() => {
      setFloatingDeltas((prev) => prev.filter((d) => !withIds.some((w) => w.id === d.id)))
    }, 1500)
  }

  function playAnimation(animation: PetAnimation, holdMs = REACTION_FEEDBACK_MS) {
    setAnimationOverride(animation)
    schedule(() => setAnimationOverride(null), holdMs)
  }

  // No SFX on every care-action message anymore — a chirp on every single
  // feed/wash/play/pet/talk press read as too chatty. Sound is reserved for
  // specific occasional moments instead (room entry, gift-ready, level-up —
  // see room-screen.tsx's playCharacterVoice call sites); this bubble still
  // shows its text either way.
  function showSpeech(text: string, holdMs = 2400) {
    setSpeech(text)
    schedule(() => setSpeech((cur) => (cur === text ? null : cur)), holdMs)
  }

  function finalizeAction(result: ActionResult, room?: RoomCareState) {
    const beforeLevel = petStateRef.current.intimacyLevel
    let finalPetState = result.petState

    if (result.levelUp) {
      const unlocks = getNewlyUnlockedRewards(beforeLevel, result.levelUp.level, finalPetState.unlockedRewardLevels)
      const giftLevel = giftMilestoneCrossed(result.levelUp.levelsGained)
      finalPetState = {
        ...finalPetState,
        unlockedRewardLevels: [...finalPetState.unlockedRewardLevels, ...unlocks.map((u) => u.level)],
        giftReadyLevel: giftLevel ?? finalPetState.giftReadyLevel,
      }
      play('level-up')
      setLevelUpEvent({ key: Date.now(), level: result.levelUp.level, unlocks })
      schedule(() => setLevelUpEvent(null), 4000)
    }

    setPetState(finalPetState)
    savePetCareState(finalPetState)
    if (room) {
      setRoomState(room)
      saveRoomCareState(room)
    }

    showFloatingDeltas(result.deltas)
    playAnimation(result.levelUp ? 'jump' : result.animation)
    if (result.message) showSpeech(result.message)
    else if (result.dialogue) showSpeech(result.dialogue, 3200)
  }

  /**
   * Deferred one macrotask past this action's finalizeAction call (never a
   * microtask — those still run before the browser paints) so the several
   * synchronous localStorage reads/writes inside mission-tracker.ts
   * (activity counters, daily missions, and — worst case — a full
   * sync-achievement re-evaluation) can never sit in front of the Statling's
   * visual reaction. That reaction is already fully triggered by the time
   * this fires; the tracking call only affects bookkeeping the player never
   * watches happen in real time. See lib/missions/mission-tracker.ts.
   */
  function trackCareInteractionDeferred(actionId: CareActionId, now: Date) {
    window.setTimeout(() => trackCareInteraction(actionId, now), 0)
  }

  function performAction(actionId: CareActionId) {
    const now = new Date()
    const pet = petStateRef.current
    const room = roomStateRef.current
    setLastUserActionAt(now.getTime())

    switch (actionId) {
      case 'feed':
        finalizeAction(performFeed(pet, now))
        trackCareInteractionDeferred(actionId, now)
        return
      case 'shower':
        finalizeAction(performShower(pet, now))
        trackCareInteractionDeferred(actionId, now)
        return
      case 'clean': {
        const result = performClean(pet, room, now)
        finalizeAction(result, result.roomState)
        trackCareInteractionDeferred(actionId, now)
        return
      }
      case 'play':
        finalizeAction(performPlay(pet, now))
        trackCareInteractionDeferred(actionId, now)
        return
      case 'pet': {
        const nowMs = now.getTime()
        const recentClicks = [...petClickTimestampsRef.current, nowMs].filter(
          (t) => nowMs - t < OVERPET_WINDOW_MS,
        )
        petClickTimestampsRef.current = recentClicks
        if (recentClicks.length >= OVERPET_COUNT_THRESHOLD) {
          petClickTimestampsRef.current = [] // fires once per streak, not on every pet after
          setIsOverPetted(true)
          schedule(() => setIsOverPetted(false), OVERPET_REACTION_HOLD_MS)
        }
        finalizeAction(performPet(pet, now))
        trackCareInteractionDeferred(actionId, now)
        return
      }
    }
  }

  /**
   * Called when the 대화 button opens a new question (hooks/use-pet-talk.ts),
   * not when it's answered — over-talking is about how often the player
   * keeps re-opening questions, same streak-tracking shape as isOverPetted
   * above. Free of stats/cooldown effects on its own; answerTalk below is
   * what actually costs a cooldown/grants exp, once a choice is made.
   */
  function registerTalkOpen() {
    const nowMs = Date.now()
    const recentClicks = [...talkClickTimestampsRef.current, nowMs].filter((t) => nowMs - t < OVERTALK_WINDOW_MS)
    talkClickTimestampsRef.current = recentClicks
    if (recentClicks.length >= OVERTALK_COUNT_THRESHOLD) {
      talkClickTimestampsRef.current = [] // fires once per streak, not on every open after
      setIsOverTalked(true)
      schedule(() => setIsOverTalked(false), OVERTALK_REACTION_HOLD_MS)
    }
    setLastUserActionAt(nowMs)
  }

  /** The 대화 answer step — see lib/pet-care/actions.ts#performTalkAnswer. `responseText` is whichever choice/free-text acknowledgement hooks/use-pet-talk.ts resolved; this only ever applies the cooldown/exp/speech-bubble side of it. */
  function answerTalk(responseText: string) {
    const now = new Date()
    setLastUserActionAt(now.getTime())
    finalizeAction(performTalkAnswer(petStateRef.current, now, responseText))
    trackCareInteractionDeferred('talk', now)
  }

  /**
   * Tapping the Statling while a gift is ready — grants that level's
   * Statling Decoration to the claim inventory (lib/deco-inventory-storage.ts,
   * idempotent so a double-tap race can never double-grant), clears
   * giftReadyLevel, and shows a small thank-you. Returns the granted asset
   * (for room-screen.tsx to surface a "획득!" toast) or null for a level
   * with no deco mapped / no gift pending — a no-op state-wise either way.
   */
  function claimGift(): SupportedDecoAsset | null {
    const level = petStateRef.current.giftReadyLevel
    if (level === null) return null
    const reward = getLevelGiftDecoAsset(level)
    if (reward) saveDecoInventoryState(grantDecoReward(loadDecoInventoryState(), reward.id))
    const nextState: PetCareState = { ...petStateRef.current, giftReadyLevel: null }
    setPetState(nextState)
    savePetCareState(nextState)
    showSpeech('고마워요! 소중히 간직할게요.')
    return reward ?? null
  }

  /**
   * The entry point autonomous bonuses (sleep/playAlone) and minigame
   * reactions use to touch PetCareState. Shares `finalizeAction`'s
   * clamp/exp/level-up/save/floating-delta handling, but deliberately does
   * NOT touch `animationOverride`/`speech` — the caller (usePetAutonomy /
   * usePetMemory) already owns and displays its own animation/speech for
   * that moment, and composing both here would fight the Room screen's own
   * priority chain (levelUp > gameReaction > userAction > speaking >
   * autonomous). A resulting level-up still shows its Toast/jump exactly
   * like a button-driven one, since that's handled by `finalizeAction`
   * itself and is always the single highest-priority visual regardless of
   * source.
   */
  function applyEffect(deltas: Partial<Record<CareStatId, number>>, expGain: number) {
    const result = buildDirectEffect(petStateRef.current, deltas, expGain, new Date())
    const beforeLevel = petStateRef.current.intimacyLevel
    let finalPetState = result.petState

    if (result.levelUp) {
      const unlocks = getNewlyUnlockedRewards(beforeLevel, result.levelUp.level, finalPetState.unlockedRewardLevels)
      const giftLevel = giftMilestoneCrossed(result.levelUp.levelsGained)
      finalPetState = {
        ...finalPetState,
        unlockedRewardLevels: [...finalPetState.unlockedRewardLevels, ...unlocks.map((u) => u.level)],
        giftReadyLevel: giftLevel ?? finalPetState.giftReadyLevel,
      }
      play('level-up')
      setLevelUpEvent({ key: Date.now(), level: result.levelUp.level, unlocks })
      schedule(() => setLevelUpEvent(null), 4000)
      playAnimation('jump')
    }

    setPetState(finalPetState)
    savePetCareState(finalPetState)
    showFloatingDeltas(result.deltas)
  }

  const cooldowns: Record<CareActionId, CooldownStatus> = Object.fromEntries(
    ACTION_IDS.map((id) => [id, getCooldownStatus(petState.cooldowns, id, new Date())]),
  ) as Record<CareActionId, CooldownStatus>

  const attentionFlags: Record<CareActionId, boolean> = {
    feed: petState.stats.satiety < ATTENTION_THRESHOLD.satiety && !cooldowns.feed.onCooldown,
    shower: petState.stats.cleanliness < ATTENTION_THRESHOLD.cleanliness && !cooldowns.shower.onCooldown,
    clean: roomState.cleanliness < ROOM_ATTENTION_THRESHOLD && !cooldowns.clean.onCooldown,
    play: petState.stats.happiness < ATTENTION_THRESHOLD.happiness && !cooldowns.play.onCooldown,
    pet: petState.stats.affection < ATTENTION_THRESHOLD.affection && !cooldowns.pet.onCooldown,
    talk: (mood === 'lonely' || mood === 'sad') && !cooldowns.talk.onCooldown,
  }

  return {
    petState,
    roomState,
    mood,
    secondaryTags: secondaryTags as SecondaryTag[],
    animation: animationOverride ?? idleAnimationForMood(mood),
    /** True only while a real action/level-up override is playing — lets room-screen tell "genuinely reacting right now" apart from "just the idle/mood fallback" when composing with autonomy/gameReaction. */
    reactionActive: animationOverride !== null,
    speech,
    floatingDeltas,
    levelUpEvent,
    isOverPetted,
    isOverTalked,
    lastUserActionAt,
    expToNext: expRequiredForLevel(petState.intimacyLevel),
    cooldowns,
    attentionFlags,
    performAction,
    applyEffect,
    claimGift,
    registerTalkOpen,
    answerTalk,
    /** Puts a line straight in the character's speech bubble with no stat/cooldown/exp effect — same direct showSpeech call claimGift uses for its own fixed thank-you line, just for an arbitrary caller-supplied line (room-screen.tsx uses it to show a 대화 question's prompt text). */
    sayText: (text: string, holdMs?: number) => showSpeech(text, holdMs),
    /** Tap-to-dismiss support — lets room-screen close the bubble immediately instead of waiting out its auto-hide timer. */
    dismissSpeech: () => setSpeech(null),
  }
}
