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
 * backing out without answering. Rendered by room-screen.tsx right where
 * the care-action row normally sits, only while a question is open.
 */
export function TalkQuestionCard({ question, onChoose, onSubmitFreeText, onCancel }: TalkQuestionCardProps) {
  const [freeText, setFreeText] = useState('')

  return (
    <div className="animate-pop-in mt-2 flex flex-col gap-2.5 rounded-2xl bg-card px-4 py-3.5 toy-border toy-shadow-sm sm:mt-3">
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
