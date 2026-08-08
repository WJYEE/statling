'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { USER_NOTE_MAX_LENGTH } from '@/lib/config/talk.config'
import type { TalkChoice, TalkQuestion } from '@/lib/pet-care/talk-questions'

interface TalkQuestionCardProps {
  question: TalkQuestion
  /** Non-null once a choice/free-text has been resolved — swaps the card's content over to the answer (see hooks/use-pet-talk.ts) instead of unmounting it, so the whole exchange stays inside one popup. */
  answerText: string | null
  onChoose: (choice: TalkChoice) => void
  onSubmitFreeText: (text: string) => void
  onClose: () => void
}

/**
 * The ONE popup the 대화 button ever shows — question + choices (or the
 * free-text field), then, in the same card, the Statling's answer once
 * given. Auto-closes itself a few seconds after answering (hooks/
 * use-pet-talk.ts's TALK_ANSWER_AUTO_CLOSE_MS), but the whole card is also
 * clickable to dismiss early once answered, plus the X button works at
 * either stage — the "talk directly to your pet" feel this is going for
 * means never leaving a stale answer bubble hanging around. Rendered by
 * room-screen.tsx as an absolute overlay INSIDE the room canvas wrapper
 * (siblings with RoomCanvas/RoomCleanOverlay there), pinned to the bottom
 * edge so it sits right under the Statling and overlaps the room
 * background — never a second bottom sheet elsewhere on the screen.
 * `bg-card/95 backdrop-blur-sm` (not a flat `bg-card`) so it stays readable
 * over whatever background art happens to be behind it.
 */
export function TalkQuestionCard({ question, answerText, onChoose, onSubmitFreeText, onClose }: TalkQuestionCardProps) {
  const [freeText, setFreeText] = useState('')
  const isAnswered = answerText !== null

  return (
    <div
      onClick={isAnswered ? onClose : undefined}
      className="animate-pop-in absolute inset-x-2 bottom-2 z-[60] flex max-h-[70%] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-card/95 px-4 py-3.5 toy-border toy-shadow-sm backdrop-blur-sm sm:inset-x-3 sm:bottom-3"
    >
      {isAnswered ? (
        <div key="answer" className="animate-pop-in flex items-start gap-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            <MessageCircle size={13} strokeWidth={2.6} />
          </span>
          <p className="text-pretty font-display text-sm font-extrabold leading-snug text-foreground">{answerText}</p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            aria-label="닫기"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <div key="question" className="animate-pop-in flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-pretty font-display text-sm font-extrabold leading-snug text-foreground">{question.text}</p>
            <button
              type="button"
              onClick={onClose}
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
      )}
    </div>
  )
}
