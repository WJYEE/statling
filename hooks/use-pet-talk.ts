'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FREE_TEXT_ACK_EXPRESSION,
  FREE_TEXT_ACK_RESPONSE,
  pickRandomQuestion,
  pushRecentQuestionId,
  type TalkChoice,
  type TalkQuestion,
} from '@/lib/pet-care/talk-questions'
import { saveUserNote } from '@/lib/pet-care/user-notes-storage'
import { TALK_ANSWER_AUTO_CLOSE_MS } from '@/lib/config/talk.config'
import type { CharacterStateKey } from '@/lib/character-state-assets'

export interface UsePetTalkInput {
  /** Called the instant a question opens — see hooks/use-pet-care.ts's `registerTalkOpen` (over-talk streak tracking only, no stats/cooldown effect of its own). */
  onOpen: () => void
  /** Called once an answer is actually given (a choice picked, or — for the one isFreeText question — text submitted) — applies cooldown/exp/speech via hooks/use-pet-care.ts's `answerTalk`. `expression`, when given, is what room-screen.tsx holds the character art on for a few seconds. */
  onAnswered: (responseText: string, expression?: CharacterStateKey) => void
}

/**
 * Owns the 대화 button's ENTIRE single-popup flow: which question is up,
 * and — once answered — the response text that same popup switches to
 * showing before it closes. `activeQuestion` stays set for both stages
 * (question and answered) so the one card in room-screen.tsx never has to
 * unmount/remount between them; `answerText` is what tells it which stage
 * to render (see talk-question-card.tsx). Deliberately doesn't touch
 * PetCareState itself — both resolution paths call back into `onAnswered`
 * so hooks/use-pet-care.ts stays the one place stats/cooldown/speech
 * actually change, same separation usePetMemory already has via its own
 * injected `applyEffect`.
 */
export function usePetTalk({ onOpen, onAnswered }: UsePetTalkInput) {
  const [activeQuestion, setActiveQuestion] = useState<TalkQuestion | null>(null)
  /** Non-null once a choice/free-text has been resolved — the popup shows this instead of the question/choices until it auto-closes or the player dismisses it. */
  const [answerText, setAnswerText] = useState<string | null>(null)
  /** "간단한 최근 질문 회피" — session-only (not persisted), same in-memory shape as e.g. usePetAutonomy's lastActionIdRef. */
  const recentQuestionIdsRef = useRef<string[]>([])
  const autoCloseTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (autoCloseTimeoutRef.current !== null) window.clearTimeout(autoCloseTimeoutRef.current)
    },
    [],
  )

  function clearAutoClose() {
    if (autoCloseTimeoutRef.current !== null) {
      window.clearTimeout(autoCloseTimeoutRef.current)
      autoCloseTimeoutRef.current = null
    }
  }

  function openQuestion() {
    clearAutoClose()
    const question = pickRandomQuestion(recentQuestionIdsRef.current)
    recentQuestionIdsRef.current = pushRecentQuestionId(recentQuestionIdsRef.current, question.id)
    setAnswerText(null)
    setActiveQuestion(question)
    onOpen()
  }

  /** Closes the popup from either stage — backing out before answering costs nothing (no cooldown/exp); closing after answering just dismisses early instead of waiting for the auto-close timer. */
  function cancelQuestion() {
    clearAutoClose()
    setActiveQuestion(null)
    setAnswerText(null)
  }

  function resolveAnswer(responseText: string, expression?: CharacterStateKey) {
    setAnswerText(responseText)
    onAnswered(responseText, expression)
    clearAutoClose()
    autoCloseTimeoutRef.current = window.setTimeout(() => {
      setActiveQuestion(null)
      setAnswerText(null)
    }, TALK_ANSWER_AUTO_CLOSE_MS)
  }

  function chooseAnswer(choice: TalkChoice) {
    resolveAnswer(choice.response, choice.expression)
  }

  function submitFreeText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    saveUserNote(trimmed)
    resolveAnswer(FREE_TEXT_ACK_RESPONSE, FREE_TEXT_ACK_EXPRESSION)
  }

  return {
    activeQuestion,
    answerText,
    isActive: activeQuestion !== null,
    openQuestion,
    cancelQuestion,
    chooseAnswer,
    submitFreeText,
  }
}
