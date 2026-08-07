'use client'

import { useEffect, useRef, useState } from 'react'
import { PET_AUTONOMY_CONFIG } from '@/lib/config/pet-autonomy.config'
import {
  entryEventToDialogueCategory,
  pickInitiatedDialogue,
  pickMemoryCommentText,
  pickStateRequestCategory,
  type InitiatedDialogueCategory,
} from '@/lib/pet-care/initiated-dialogue'
import { shouldShowMemoryComment, type PetMemory } from '@/lib/pet-care/pet-memory'
import { computeEntryEvent, toLocalDateKey, type VisitContext } from '@/lib/pet-care/visit-context'
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

  const speechRef = useRef<string | null>(null)
  speechRef.current = speech
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
  }

  // No SFX here either — see hooks/use-pet-care.ts's showSpeech doc comment;
  // the room-entry chirp now happens once via room-screen.tsx's
  // playCharacterVoice on mount, not on every ambient/greeting line.
  function showSpeech(text: string, holdMs: number) {
    setSpeech(text)
    schedule(() => setSpeech((cur) => (cur === text ? null : cur)), holdMs)
  }

  // One-shot entry greeting.
  useEffect(() => {
    const alreadyGreetedToday =
      !!memoryRef.current.lastWelcomeDialogueAt &&
      toLocalDateKey(new Date(memoryRef.current.lastWelcomeDialogueAt)) === toLocalDateKey(new Date())
    if (alreadyGreetedToday) return

    const event = computeEntryEvent(input.visitContext, input.hasPendingGameReaction)
    const category = entryEventToDialogueCategory(event)
    if (!category) return // pendingGameReaction: no entry line, the game-reaction channel speaks instead

    const { welcomeDelayMinMs, welcomeDelayMaxMs } = PET_AUTONOMY_CONFIG
    const delay = welcomeDelayMinMs + Math.random() * (welcomeDelayMaxMs - welcomeDelayMinMs)
    schedule(() => {
      const line = pickInitiatedDialogue(category, intimacyLevelRef.current, memoryRef.current.recentInitiatedDialogueIds)
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

      const memoryStat = shouldShowMemoryComment(mem, new Date())
      if (memoryStat) {
        const line = pickMemoryCommentText(memoryStat, intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
        showSpeech(line.text, AMBIENT_HOLD_MS)
        onDialogueShownRef.current(line.id, 'general')
        onMemoryCommentShownRef.current()
        return
      }

      const line = pickInitiatedDialogue('idleThought', intimacyLevelRef.current, mem.recentInitiatedDialogueIds)
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

  return { active: speech !== null, speech, trigger, dismiss: () => setSpeech(null) }
}
