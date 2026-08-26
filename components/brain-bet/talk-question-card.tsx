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
  onClose: () => void
  /**
   * Same value room-screen.tsx passes to RoomCanvas's own `style` as
   * `maxWidth`/`maxHeight` (its ROOM_CANVAS_MAX_DIMENSION, see that file) —
   * this card is an absolutely-positioned sibling of RoomCanvas inside the
   * SAME wrapper div, not a child of RoomCanvas itself, so it doesn't
   * automatically shrink when RoomCanvas's own max-width/max-height budget
   * shrinks the canvas on a short-but-wide desktop viewport. Without this,
   * the card still spans the wrapper's full (unshrunk) width — up to 728px —
   * while the canvas underneath it can be far narrower (e.g. 500px at
   * 1280x720), so the card visually overflows past both edges of the room
   * art and swallows most of the character instead of reading as a panel
   * attached to it. Passing the identical formula here keeps the two in
   * lockstep at every viewport without duplicating any magic number.
   */
  maxWidth?: string
}

/**
 * The 대화 button's response panel — choice buttons (or, for the one
 * isFreeText question, a short text field), plus a close affordance for
 * backing out without answering. Deliberately does NOT repeat the
 * question's own text here — that's already spoken in the character's
 * speech bubble the instant the question opens, read directly from
 * `talk.activeQuestion.text` for as long as it stays unanswered (see
 * room-screen.tsx's `speech`), and the chosen answer goes there too
 * (`onAnswered` -> `care.answerTalk` -> the same speech bubble). Keeping this panel to
 * "just the thing you tap" instead of restating what the Statling already
 * said is what avoids showing the same line twice on screen. Rendered by
 * room-screen.tsx as an absolute overlay INSIDE the room canvas wrapper
 * (siblings with RoomCanvas/RoomCleanOverlay there), pinned to the bottom
 * edge so it sits right under the Statling and overlaps the room
 * background. `bg-card/95 backdrop-blur-sm` (not a flat `bg-card`) so it
 * stays readable over whatever background art happens to be behind it.
 * `max-h-[70dvh]` (not `max-h-[70%]`) deliberately — the nearest positioned
 * ancestor here is the small square room-canvas wrapper (capped ~280px on
 * mobile), so a percentage-based cap left barely enough room for 3 choices
 * and clipped a 4-choice follow-up question; a viewport-relative cap sizes
 * off the actual screen instead, comfortably fitting up to a handful of
 * choices while still acting as a real ceiling for an unusually long list.
 *
 * Width: `inset-x-0` + `mx-auto` + the `maxWidth` prop (not the fixed
 * `inset-x-2`/`sm:inset-x-3` this used before) — see maxWidth's doc comment
 * above for why a fixed inset from the wrapper's edges isn't enough once
 * RoomCanvas itself can be narrower than that wrapper.
 */
export function TalkQuestionCard({ question, onChoose, onSubmitFreeText, onClose, maxWidth }: TalkQuestionCardProps) {
  const [freeText, setFreeText] = useState('')

  return (
    <div
      className="animate-pop-in absolute inset-x-0 bottom-2 z-[60] mx-auto flex w-full max-h-[70dvh] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-card/95 px-4 py-3.5 toy-border toy-shadow-sm backdrop-blur-sm sm:bottom-3"
      style={maxWidth ? { maxWidth } : undefined}
    >
      <div className="flex items-center justify-end">
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
  )
}
