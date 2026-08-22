'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FREE_TEXT_ACK_EXPRESSION,
  FREE_TEXT_ACK_RESPONSE,
  pickRandomQuestion,
  type TalkChoice,
  type TalkQuestion,
} from '@/lib/pet-care/talk-questions'
import { loadDialogueMemory, recordAnsweredQuestionId, recordDialogueAnswer } from '@/lib/pet-care/dialogue-memory-storage'
import { saveUserNote } from '@/lib/pet-care/user-notes-storage'
import { RECENT_QUESTION_HISTORY_SIZE, TALK_FOLLOWUP_TRANSITION_MS } from '@/lib/config/talk.config'
import { scheduleSync } from '@/lib/sync/sync-dispatcher'
import type { CharacterStateKey } from '@/lib/character-state-assets'
import type { StatId } from '@/lib/brain-bet'

export interface UsePetTalkInput {
  /**
   * Called the instant a ROOT question opens (never for a follow-up step —
   * see chooseAnswer's `next` branch), with the question itself —
   * room-screen.tsx uses it to register the over-talk streak
   * (hooks/use-pet-care.ts's `registerTalkOpen`). The question's own text
   * is NOT spoken here anymore (that used to go through `care.sayText`,
   * which auto-hides after a few seconds regardless of whether an answer
   * has been picked yet) — room-screen.tsx instead reads it straight from
   * `activeQuestion.text` (this hook's own return value) for as long as it
   * stays open, so the prompt is never duplicated in the choice panel below
   * AND never disappears/gets preempted before the player answers.
   */
  onOpen: (question: TalkQuestion) => void
  /** Called once the conversation actually ends (a leaf choice picked, or — for the one isFreeText question — text submitted) — applies cooldown/exp/speech via hooks/use-pet-care.ts's `answerTalk`, which puts the reply in the same character speech bubble. `expression`, when given, is what room-screen.tsx holds the character art on for a few seconds. */
  onAnswered: (responseText: string, expression?: CharacterStateKey) => void
  /** Called for an intermediate follow-up step's own reaction line — no cooldown/exp effect (see hooks/use-pet-care.ts's `sayText`), just speech, since the conversation isn't over yet. */
  onIntermediateReaction: (responseText: string, expression?: CharacterStateKey) => void
  /** The current pet's primaryStat — resolves a choice's `statResponses` variant, if any (see talk-questions.ts). */
  topStat: StatId
}

/**
 * Owns the 대화 button's question state: which question is currently up
 * (root or a follow-up step), and the two ways to resolve it (pick a
 * choice, or submit typed text for the special free-text question). The
 * popup itself (talk-question-card.tsx) only ever shows the choices/input —
 * never the question text or the answer text, both of which live in the
 * character's own speech bubble (see onOpen/onAnswered above) so nothing is
 * ever shown twice. Deliberately doesn't touch PetCareState itself — every
 * resolution path calls back into onAnswered/onIntermediateReaction so
 * hooks/use-pet-care.ts stays the one place stats/cooldown/speech actually
 * change, same separation usePetMemory already has via its own injected
 * `applyEffect`.
 */
export function usePetTalk({ onOpen, onAnswered, onIntermediateReaction, topStat }: UsePetTalkInput) {
  const [activeQuestion, setActiveQuestion] = useState<TalkQuestion | null>(null)
  /** True only during the brief gap between picking a choice with a follow-up and that follow-up question actually appearing — see chooseAnswer. Folded into `isActive` so autonomy/ambient dialogue stay suppressed through the gap. */
  const [isTransitioning, setIsTransitioning] = useState(false)
  /**
   * "새로고침/재접속 후에도 최근 질문이 바로 반복되지 않도록" (spec §6) —
   * seeded from the persisted DialogueMemory window (lib/pet-care/
   * dialogue-memory-storage.ts) instead of the old session-only ref, and
   * every openQuestion() call both updates this and persists immediately.
   */
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>(() => loadDialogueMemory().answeredQuestionIds)
  const transitionTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (transitionTimeoutRef.current !== null) window.clearTimeout(transitionTimeoutRef.current)
    },
    [],
  )

  function openRootQuestion() {
    const question = pickRandomQuestion(recentQuestionIds)
    setRecentQuestionIds(recordAnsweredQuestionId(question.id, RECENT_QUESTION_HISTORY_SIZE))
    // Phase 2D-4 — recordAnsweredQuestionId above is a real DialogueMemory
    // write (the recent-question window), not just "a talk screen opened",
    // so this is a legitimate sync point — merely viewing the 대화 button
    // with no question chosen never reaches this line at all.
    scheduleSync('dialogue_memory')
    setActiveQuestion(question)
    onOpen(question)
  }

  /**
   * Phase 3D-3 — `openingLine`, when given (room-screen.tsx#pickTalkOpeningMemoryLine,
   * gated by TALK_OPENING_MEMORY_CHANCE), shows a short memory callback first
   * via the SAME isTransitioning + onIntermediateReaction + TALK_FOLLOWUP_TRANSITION_MS
   * beat chooseAnswer's `next` branch already uses, before the real question
   * opens — so `talk.isActive` (and everything that already keys off it:
   * autonomy suppression, the care-action buttons' disabled state) stays true
   * through the gap for free, with no new state anywhere. Omitted (the
   * default, and every pre-3D-3 call site), this is byte-for-byte the old
   * openQuestion().
   */
  function openQuestion(openingLine?: { text: string }) {
    if (openingLine) {
      setIsTransitioning(true)
      onIntermediateReaction(openingLine.text)
      transitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false)
        openRootQuestion()
      }, TALK_FOLLOWUP_TRANSITION_MS)
      return
    }
    openRootQuestion()
  }

  /** Backing out without answering costs nothing — no cooldown, no exp — and cancels any pending follow-up transition too. */
  function cancelQuestion() {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current)
      transitionTimeoutRef.current = null
    }
    setIsTransitioning(false)
    setActiveQuestion(null)
  }

  /** A choice's character-flavor variant for the current pet's primaryStat, falling back to its default response. */
  function resolveResponseText(choice: TalkChoice): string {
    return choice.statResponses?.[topStat] ?? choice.response
  }

  function chooseAnswer(choice: TalkChoice) {
    if (choice.memory) {
      recordDialogueAnswer(choice.memory.key, choice.memory.value)
      scheduleSync('dialogue_memory')
    }
    const responseText = resolveResponseText(choice)

    if (choice.next) {
      // Intermediate step — react (no stat/cooldown effect), hide the
      // question card for a beat (TalkQuestionCard only renders while
      // activeQuestion is set — see room-screen.tsx), then swap in the
      // follow-up question. No onOpen() here: this isn't the player
      // re-pressing 대화, so it shouldn't count toward the over-talk streak.
      setActiveQuestion(null)
      setIsTransitioning(true)
      onIntermediateReaction(responseText, choice.expression)
      transitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false)
        setActiveQuestion(choice.next!)
      }, TALK_FOLLOWUP_TRANSITION_MS)
      return
    }

    setActiveQuestion(null)
    onAnswered(responseText, choice.expression)
  }

  function submitFreeText(text: string) {
    const trimmed = text.trim()
    setActiveQuestion(null)
    if (!trimmed) return
    saveUserNote(trimmed)
    onAnswered(FREE_TEXT_ACK_RESPONSE, FREE_TEXT_ACK_EXPRESSION)
  }

  return {
    activeQuestion,
    isActive: activeQuestion !== null || isTransitioning,
    openQuestion,
    cancelQuestion,
    chooseAnswer,
    submitFreeText,
  }
}
