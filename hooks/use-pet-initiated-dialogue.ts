'use client'

import { useEffect, useRef, useState } from 'react'
import { PET_AUTONOMY_CONFIG } from '@/lib/config/pet-autonomy.config'
import { DIALOGUE_MEMORY_REFERENCE_CHANCE, USER_NOTE_ECHO_CHANCE } from '@/lib/config/talk.config'
import {
  entryEventToDialogueCategory,
  milestoneDialogueCategory,
  pickCareMemoryText,
  pickDailyGreetingText,
  pickGameNameMemoryText,
  pickInitiatedDialogue,
  pickMemoryCommentText,
  pickMemoryReferenceLine,
  pickStateRequestCategory,
  type InitiatedDialogueCategory,
} from '@/lib/pet-care/initiated-dialogue'
import { loadDialogueMemory } from '@/lib/pet-care/dialogue-memory-storage'
import { computeRelationshipStage } from '@/lib/pet-care/relationship-stage'
import {
  shouldShowCareMemory,
  shouldShowGameNameMemory,
  shouldShowGrowthCallback,
  shouldShowMemoryComment,
  type PetMemory,
} from '@/lib/pet-care/pet-memory'
import { loadUserNotes } from '@/lib/pet-care/user-notes-storage'
import { computeEntryEvent, daysSince, getMilestoneDay, toLocalDateKey, type VisitContext } from '@/lib/pet-care/visit-context'
import type { CareStatId, SecondaryTag } from '@/lib/pet-care/types'

/** How often the ambient loop re-checks whether a state-request/general line is due — an internal poll rate, not a user-facing cooldown itself (those are PET_AUTONOMY_CONFIG's cooldown fields). */
const AMBIENT_POLL_MS = 10_000
const ENTRY_GREETING_HOLD_MS = 3_000
const AMBIENT_HOLD_MS = 2_600

export interface UsePetInitiatedDialogueInput {
  memory: PetMemory
  visitContext: VisitContext
  hasPendingGameReaction: boolean
  intimacyLevel: number
  stats: Record<CareStatId, number>
  secondaryTags: SecondaryTag[]
  suppressed: boolean
  onDialogueShown: (id: string, kind: 'general' | 'stateRequest' | 'welcome') => void
  onMemoryCommentShown: () => void
}

/**
 * Two independent timers: a one-shot entry greeting (700-1500ms after
 * mount, gated to once per calendar day via `lastWelcomeDialogueAt`), and a
 * session-long ambient poll (state-request lines at a 5min cooldown,
 * general/idle/memory lines at a 90s cooldown) — plus an imperative
 * `trigger()` the autonomous scheduler calls for its own ask* actions, which
 * shares the same 5min state-request cooldown so an autonomous "gesture"
 * doesn't force text out more often than the state-request rule allows.
 */
export function usePetInitiatedDialogue(input: UsePetInitiatedDialogueInput) {
  const [speech, setSpeech] = useState<string | null>(null)
  /** Bumped on every showSpeech/dismiss call — see showSpeech's doc comment for why this (not text equality) is what an auto-hide timer checks before clearing. Also exposed as `speechId` so room-screen.tsx can build a React key that changes even when two different lines happen to render identical text. */
  const [speechId, setSpeechId] = useState(0)

  const speechRef = useRef<string | null>(null)
  speechRef.current = speech
  const speechGenRef = useRef(0)
  const speechTimeoutIdRef = useRef<number | null>(null)
  const memoryRef = useRef(input.memory)
  memoryRef.current = input.memory
  const suppressedRef = useRef(input.suppressed)
  suppressedRef.current = input.suppressed
  const statsRef = useRef(input.stats)
  statsRef.current = input.stats
  const secondaryTagsRef = useRef(input.secondaryTags)
  secondaryTagsRef.current = input.secondaryTags
  const intimacyLevelRef = useRef(input.intimacyLevel)
  intimacyLevelRef.current = input.intimacyLevel
  const onDialogueShownRef = useRef(input.onDialogueShown)
  onDialogueShownRef.current = input.onDialogueShown
  const onMemoryCommentShownRef = useRef(input.onMemoryCommentShown)
  onMemoryCommentShownRef.current = input.onMemoryCommentShown

  const timeoutsRef = useRef<number[]>([])

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    timeoutsRef.current.push(id)
    return id
  }

  // No SFX here either — see hooks/use-pet-care.ts's showSpeech doc comment;
  // the room-entry chirp now happens once via room-screen.tsx's
  // playCharacterVoice on mount, not on every ambient/greeting line.
  //
  // Cancels any still-pending auto-hide timer from a PREVIOUS line before
  // scheduling this one's, and the scheduled callback only ever clears
  // `speech` if `speechGenRef` still matches the generation it captured —
  // i.e. this exact call's own instance is still the live one. Text-content
  // equality (`cur === text`) used to be the only guard here, which meant a
  // stale timer from an earlier, already-dismissed line could wrongly clear
  // a brand-new line whenever the two happened to render identical text
  // (see lib/pet-care/initiated-dialogue.ts's duplicate lines across
  // different categories) — a generation counter can never collide that way.
  function showSpeech(text: string, holdMs: number) {
    if (speechTimeoutIdRef.current !== null) window.clearTimeout(speechTimeoutIdRef.current)
    const generation = ++speechGenRef.current
    setSpeech(text)
    setSpeechId(generation)
    speechTimeoutIdRef.current = schedule(() => {
      if (speechGenRef.current === generation) setSpeech(null)
    }, holdMs)
  }

  // One-shot entry greeting.
  useEffect(() => {
    const alreadyGreetedToday =
      !!memoryRef.current.lastWelcomeDialogueAt &&
      toLocalDateKey(new Date(memoryRef.current.lastWelcomeDialogueAt)) === toLocalDateKey(new Date())
    if (alreadyGreetedToday) return

    const event = computeEntryEvent(input.visitContext, input.hasPendingGameReaction)
    let category = entryEventToDialogueCategory(event, input.visitContext.absenceTier)
    if (!category) return // pendingGameReaction: no entry line, the game-reaction channel speaks instead

    // Phase 3D-2 — "함께한 기간" milestone override: only ever considered on
    // a plain "오늘 첫 방문" day, never preempting firstMeeting (day 0, no
    // milestone can match anyway) or longAbsenceReturn (a returning-from-
    // absence greeting stays the priority on the rare day both would apply
    // — see visit-context.ts#getMilestoneDay's own doc comment for why an
    // exact day-match needs no new stored flag at all).
    if (event === 'todayFirstVisit') {
      const milestoneDay = getMilestoneDay(daysSince(memoryRef.current.firstMetAt, new Date()))
      if (milestoneDay) category = milestoneDialogueCategory(milestoneDay)
    }

    const { welcomeDelayMinMs, welcomeDelayMaxMs } = PET_AUTONOMY_CONFIG
    const delay = welcomeDelayMinMs + Math.random() * (welcomeDelayMaxMs - welcomeDelayMinMs)
    schedule(() => {
      // Phase 3D-2 — dailyGreeting alone gets a relationship-stage-aware
      // pick (see pickDailyGreetingText's own doc comment); every other
      // category is unchanged from before this Phase.
      const line =
        category === 'dailyGreeting'
          ? pickDailyGreetingText(
              computeRelationshipStage(intimacyLevelRef.current, daysSince(memoryRef.current.firstMetAt, new Date())),
              intimacyLevelRef.current,
              memoryRef.current.recentInitiatedDialogueIds,
            )
          : pickInitiatedDialogue(category, intimacyLevelRef.current, memoryRef.current.recentInitiatedDialogueIds)
      showSpeech(line.text, ENTRY_GREETING_HOLD_MS)
      onDialogueShownRef.current(line.id, 'welcome')
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  // Session-long ambient poll.
  useEffect(() => {
    function tryShowAmbient() {
      if (suppressedRef.current || speechRef.current !== null) return
      const mem = memoryRef.current
      const now = Date.now()

      const stateReady =
        !mem.lastStateRequestDialogueAt ||
        now - new Date(mem.lastStateRequestDialogueAt).getTime() >= PET_AUTONOMY_CONFIG.requestDialogueCooldownMs
      if (stateReady) {
        const category = pickStateRequestCategory(statsRef.current, secondaryTagsRef.current)
        if (category) {
          const line = pickInitiatedDialogue(category, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
          showSpeech(line.text, AMBIENT_HOLD_MS)
          onDialogueShownRef.current(line.id, 'stateRequest')
          return
        }
      }

      const generalReady =
        !mem.lastInitiatedDialogueAt ||
        now - new Date(mem.lastInitiatedDialogueAt).getTime() >= PET_AUTONOMY_CONFIG.initiatedDialogueCooldownMs
      if (!generalReady) return

      // "가끔 이전 답변을 참조" (spec §5) — checked first, at a low fixed
      // odds, so it never crowds out the existing memoryStat/note-echo/idle
      // lines below; when it doesn't fire (the common case) everything below
      // behaves exactly as it did before this feature existed.
      if (Math.random() < DIALOGUE_MEMORY_REFERENCE_CHANCE) {
        const referenceLine = pickMemoryReferenceLine(loadDialogueMemory())
        if (referenceLine) {
          showSpeech(referenceLine.text, AMBIENT_HOLD_MS)
          onDialogueShownRef.current(referenceLine.id, 'general')
          return
        }
      }

      // Phase 3D-3 — "behavioral memory" tier (spec §10): game, then care,
      // both sharing memoryComment's own daily budget/gate (see
      // pet-memory.ts#shouldShowCareMemory/#shouldShowGameNameMemory's doc
      // comments) via the same onMemoryCommentShownRef callback — so at most
      // ONE of {game-name, stat-level game, care, growth} fires per day,
      // whichever this priority order finds eligible first.
      const gameNameId = shouldShowGameNameMemory(mem, new Date())
      if (gameNameId) {
        const line = pickGameNameMemoryText(gameNameId, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
        showSpeech(line.text, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(line.id, 'general')
        onMemoryCommentShownRef.current()
        return
      }

      const memoryStat = shouldShowMemoryComment(mem, new Date())
      if (memoryStat) {
        const line = pickMemoryCommentText(memoryStat, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
        showSpeech(line.text, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(line.id, 'general')
        onMemoryCommentShownRef.current()
        return
      }

      const careAction = shouldShowCareMemory(mem, new Date())
      if (careAction) {
        const stage = computeRelationshipStage(intimacyLevelRef.current, daysSince(mem.firstMetAt, new Date()))
        const line = pickCareMemoryText(careAction, stage, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
        showSpeech(line.text, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(line.id, 'general')
        onMemoryCommentShownRef.current()
        return
      }

      // Phase 3D-2 — growth callback ("처음 만났을 때보다 우리 꽤 친해진 것
      // 같아"): shares memoryComment's own daily budget/gate on purpose (see
      // pet-memory.ts#shouldShowGrowthCallback's doc comment) — reusing the
      // same onMemoryCommentShownRef callback here is what makes that a
      // single combined "one memory-style comment per day" budget rather
      // than a second independent stored flag.
      if (shouldShowGrowthCallback(mem, new Date())) {
        const line = pickInitiatedDialogue('growthCallback', intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
        showSpeech(line.text, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(line.id, 'general')
        onMemoryCommentShownRef.current()
        return
      }

      // "이후 Statling이 가끔 해당 문구를 말풍선으로 다시 말하도록" — the one
      // isFreeText 대화 question's saved answers (lib/pet-care/talk-questions.ts),
      // echoed back at the same cadence/cooldown as any other ambient line.
      const notes = loadUserNotes()
      if (notes.length > 0 && Math.random() < USER_NOTE_ECHO_CHANCE) {
        const note = notes[Math.floor(Math.random() * notes.length)]
        showSpeech(`저번에 네가 나한테 "${note.text}"라고 했었잖아. 기억하고 있어!`, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(`note-echo-${note.id}`, 'general')
        return
      }

      // Occasional unprompted self-talk (spec §7) instead of always the
      // observational idleThought line — same category/cooldown treatment,
      // just an alternating source so the player isn't always the only one
      // "starting" a conversation.
      const idleCategory: InitiatedDialogueCategory = Math.random() < 0.5 ? 'selfMusing' : 'idleThought'
      const line = pickInitiatedDialogue(idleCategory, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
      showSpeech(line.text, AMBIENT_HOLD_MS)
      onDialogueShownRef.current(line.id, 'general')
    }

    const id = window.setInterval(tryShowAmbient, AMBIENT_POLL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once interval; all inputs read via refs
  }, [])

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id))
      timeoutsRef.current = []
    },
    [],
  )

  /** Imperative entry point for the autonomous scheduler's askFood/askPlay/askAttention — shares the state-request cooldown, so it silently no-ops (the autonomous animation still plays on its own) if a state-request line was already shown too recently. */
  function trigger(category: InitiatedDialogueCategory) {
    if (suppressedRef.current || speechRef.current !== null) return
    const mem = memoryRef.current
    const now = Date.now()
    const stateReady =
      !mem.lastStateRequestDialogueAt ||
      now - new Date(mem.lastStateRequestDialogueAt).getTime() >= PET_AUTONOMY_CONFIG.requestDialogueCooldownMs
    if (!stateReady) return

    const line = pickInitiatedDialogue(category, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
    showSpeech(line.text, AMBIENT_HOLD_MS)
    onDialogueShownRef.current(line.id, 'stateRequest')
  }

  /**
   * Tap-to-dismiss / preempted-by-a-higher-priority-source support — cancels
   * the pending auto-hide timeout (not just the visible state) so an early
   * dismiss can never let that timer clear a *different*, later line that
   * happens to reuse the same generation-adjacent slot. See showSpeech's doc
   * comment for the matching generation-counter half of this fix.
   */
  function dismiss() {
    if (speechTimeoutIdRef.current !== null) {
      window.clearTimeout(speechTimeoutIdRef.current)
      speechTimeoutIdRef.current = null
    }
    speechGenRef.current += 1
    setSpeech(null)
  }

  return { active: speech !== null, speech, speechId, trigger, dismiss }
}
