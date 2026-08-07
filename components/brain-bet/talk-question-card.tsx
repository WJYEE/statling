'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { USER_NOTE_MAX_LENGTH } from '@/lib/config/talk.config'
import type { TalkChoice, TalkQuestion } from '@/lib/pet-care/talk-questions'

interface TalkQuestionCardProps {
  question: TalkQuestion
  onChoose: (choice: TalkChoice) => void
  onSubmitFreeText: (text: string) => void
  onCancel: () => void
}

/**
 * The 대화 button's question prompt — up to 3 choice buttons, or (for the
 * one isFreeText question) a short text field, plus a close affordance for
 * backing out without answering. Rendered by room-screen.tsx as an absolute
 * overlay INSIDE the room canvas wrapper (siblings with RoomCanvas/
 * RoomCleanOverlay there), pinned to the bottom edge so it sits right under
 * the Statling and overlaps the room background — not pushed down below the
 * care-action row. `bg-card/95 backdrop-blur-sm` (not a flat `bg-card`) so
 * it stays readable over whatever background art happens to be behind it.
 */
export function TalkQuestionCard({ question, onChoose, onSubmitFreeText, onCancel }: TalkQuestionCardProps) {
  const [freeText, setFreeText] = useState('')

  return (
    <div
      className="animate-pop-in absolute inset-x-2 bottom-2 z-[60] flex max-h-[70%] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-card/95 px-4 py-3.5 toy-border toy-shadow-sm backdrop-blur-sm sm:inset-x-3 sm:bottom-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-pretty font-display text-sm font-extrabold leading-snug text-foreground">{question.text}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X size={15} strokeWidth={2.4} />
        </button>
      </div>

      {question.isFreeText ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!freeText.trim()) return
            onSubmitFreeText(freeText)
            setFreeText('')
          }}
          className="flex items-center gap-2"
        >
          <input
            value={freeText}
            onChange={(event) => setFreeText(event.target.value.slice(0, USER_NOTE_MAX_LENGTH))}
            placeholder="하고 싶은 말을 적어주세요"
            maxLength={USER_NOTE_MAX_LENGTH}
            className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none toy-border"
          />
          <ToyButton type="submit" disabled={!freeText.trim()} className="px-3.5 py-2 text-sm">
            전달
          </ToyButton>
        </form>
      ) : (
        <div className="flex flex-col gap-1.5">
          {question.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoose(choice)}
              className="rounded-xl bg-secondary px-3 py-2 text-left text-sm font-bold text-secondary-foreground toy-border transition-transform active:translate-y-0.5"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
