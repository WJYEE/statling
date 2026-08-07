'use client'

import { useRef, useState } from 'react'
import {
  FREE_TEXT_ACK_EXPRESSION,
  FREE_TEXT_ACK_RESPONSE,
  pickRandomQuestion,
  pushRecentQuestionId,
  type TalkChoice,
  type TalkQuestion,
} from '@/lib/pet-care/talk-questions'
import { saveUserNote } from '@/lib/pet-care/user-notes-storage'
import type { CharacterStateKey } from '@/lib/character-state-assets'

export interface UsePetTalkInput {
  /** Called the instant a question opens — see hooks/use-pet-care.ts's `registerTalkOpen` (over-talk streak tracking only, no stats/cooldown effect of its own). */
  onOpen: () => void
  /** Called once an answer is actually given (a choice picked, or — for the one isFreeText question — text submitted) — applies cooldown/exp/speech via hooks/use-pet-care.ts's `answerTalk`. `expression`, when given, is what room-screen.tsx holds the character art on for a few seconds. */
  onAnswered: (responseText: string, expression?: CharacterStateKey) => void
}

/**
 * Owns the 대화 button's question-and-choices flow: which question is
 * currently up, and the two ways to resolve it (pick a choice, or submit
 * typed text for the special free-text question). Deliberately doesn't
 * touch PetCareState itself — both resolution paths call back into
 * `onAnswered` so hooks/use-pet-care.ts stays the one place stats/cooldown/
 * speech actually change, same separation usePetMemory already has via its
 * own injected `applyEffect`.
 */
export function usePetTalk({ onOpen, onAnswered }: UsePetTalkInput) {
  const [activeQuestion, setActiveQuestion] = useState<TalkQuestion | null>(null)
  /** "간단한 최근 질문 회피" — session-only (not persisted), same in-memory shape as e.g. usePetAutonomy's lastActionIdRef. */
  const recentQuestionIdsRef = useRef<string[]>([])

  function openQuestion() {
    const question = pickRandomQuestion(recentQuestionIdsRef.current)
    recentQuestionIdsRef.current = pushRecentQuestionId(recentQuestionIdsRef.current, question.id)
    setActiveQuestion(question)
    onOpen()
  }

  /** Backing out without answering costs nothing — no cooldown, no exp. */
  function cancelQuestion() {
    setActiveQuestion(null)
  }

  function chooseAnswer(choice: TalkChoice) {
    setActiveQuestion(null)
    onAnswered(choice.response, choice.expression)
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
    isActive: activeQuestion !== null,
    openQuestion,
    cancelQuestion,
    chooseAnswer,
    submitFreeText,
  }
}
