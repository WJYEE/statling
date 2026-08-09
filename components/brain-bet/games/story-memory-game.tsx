'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  STORY_MEMORY_INTRO_COUNTDOWN_SECONDS,
  getStoryMemoryQuestionTimeLimitForDifficulty,
} from '@/lib/config/story-memory.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickNextStoryRound } from '@/lib/game/story-memory-data'
import type { StoryMemoryAnswer, StoryMemoryRawSummary } from '@/lib/game/types'
import { calculateStoryMemoryScore, summarizeStoryMemoryAnswers } from '@/lib/scoring/story-memory'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'reading' | 'question' | 'feedback'

interface StoryMemoryGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { answers: StoryMemoryAnswer[]; rawSummary: StoryMemoryRawSummary; gameScore: number }) => void
  onBack: () => void
}

const TUTORIAL: TutorialContent = {
  goal: '짧은 이야기를 읽고 세부 내용을 기억한 뒤, 질문에 답해요.',
  steps: ['이야기를 읽을 시간이 충분히 주어져요.', '시간이 끝나면 이야기가 사라지고 질문이 나와요.', '기억나는 대로 선택지 중 하나를 골라요.'],
  scoring: '정답률과 답변 속도를 함께 반영해요. 오답보다는 정확히 기억하는 것이 더 중요해요.',
  example: '"민수는 빨간 우산을 들고 학교에 갔어요" -> "우산은 무슨 색이었나요?" 정답: 빨간색',
}

/**
 * "이야기 기억" — Memory-stat game. Reading time is fixed and non-skippable
 * (no "다 읽었어요" early-exit) — a skippable reading phase would let a
 * player who rushes through in ~1s reach the questions "faster" without
 * actually reading, so every player reads for exactly the same short,
 * deliberately tight duration instead. Only the question-answering phase is
 * scored on speed.
 */
export function StoryMemoryGame({ index, mode, difficulty, onComplete, onBack }: StoryMemoryGameProps) {
  const stat = STATS.memory
  const { play } = useSound()
  const questionTimeLimitMs = useMemo(
    () => getStoryMemoryQuestionTimeLimitForDifficulty(difficulty),
    [difficulty],
  )
  const [round] = useState(() => pickNextStoryRound())
  const [stage, setStage] = useState<Stage>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<StoryMemoryAnswer[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const questionShownAtRef = useRef(0)

  // Reading-phase countdown (readingSeconds, fixed) — paused while the tutorial is open.
  useEffect(() => {
    if (stage !== 'reading' || tutorialOpen) return
    if (remainingMs <= 0) {
      setStage('question')
      setQuestionIndex(0)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
  }, [stage, remainingMs, tutorialOpen])

  // Per-question countdown, paused while the tutorial is open.
  useEffect(() => {
    if (stage !== 'question' || tutorialOpen) return
    if (remainingMs <= 0) {
      handleAnswer(null)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAnswer closes over current question state intentionally re-created each render
  }, [stage, remainingMs, tutorialOpen])

  const startGame = () => setStage('countdown')

  const startReading = () => {
    setRemainingMs(round.readingSeconds * 1000)
    setStage('reading')
  }

  const startQuestion = (qIndex: number) => {
    setSelected(null)
    setRemainingMs(questionTimeLimitMs)
    questionShownAtRef.current = performance.now()
    setStage('question')
    setQuestionIndex(qIndex)
  }

  const handleAnswer = (choiceIndex: number | null) => {
    if (stage !== 'question') return
    const question = round.questions[questionIndex]
    const responseTimeMs = Math.round(performance.now() - questionShownAtRef.current)
    const answer: StoryMemoryAnswer = {
      questionIndex,
      category: question.category,
      selectedIndex: choiceIndex,
      correctIndex: question.answerIndex,
      isCorrect: choiceIndex === question.answerIndex,
      responseTimeMs,
    }
    const updated = [...answers, answer]
    play(answer.isCorrect ? 'answer-correct' : 'wrong')
    setAnswers(updated)
    setSelected(choiceIndex)
    setStage('feedback')

    window.setTimeout(() => {
      if (questionIndex + 1 < round.questions.length) {
        startQuestion(questionIndex + 1)
      } else {
        const rawSummary = summarizeStoryMemoryAnswers(round.id, updated)
        const gameScore = calculateStoryMemoryScore(rawSummary)
        onComplete({ answers: updated, rawSummary, gameScore })
      }
    }, 700)
  }

  const question = round.questions[questionIndex]
  const readingProgressPct = stage === 'reading' ? Math.round((remainingMs / (round.readingSeconds * 1000)) * 100) : 0

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="이야기 기억"
        mode={mode}
        index={index}
        objective="이야기를 읽고 세부 내용을 기억하세요."
        statusSlot={
          stage === 'question' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {questionIndex + 1} / {round.questions.length}
            </span>
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
        onBack={onBack}
      />
      <p className="text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              짧은 이야기를 읽고, 나중에 나오는 질문에 답해보세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={STORY_MEMORY_INTRO_COUNTDOWN_SECONDS} onDone={startReading} label="이야기가 곧 나와요" />
        )}

        {stage === 'reading' && (
          <div className="flex flex-1 flex-col rounded-3xl bg-card px-6 py-8 toy-border toy-shadow-lg">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="읽기 시간"
              aria-valuenow={readingProgressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-primary transition-all duration-100" style={{ width: `${readingProgressPct}%` }} />
            </div>
            <p className="mt-6 text-pretty text-center font-display text-xl font-bold leading-relaxed text-foreground">
              {round.story}
            </p>
          </div>
        )}

        {(stage === 'question' || stage === 'feedback') && question && (
          <div className="flex flex-1 flex-col gap-4 rounded-3xl bg-card px-6 py-8 toy-border toy-shadow-lg">
            <p className="text-pretty text-center font-display text-lg font-bold leading-snug text-foreground">
              {question.question}
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {question.choices.map((choice, i) => {
                const isSelected = selected === i
                const isCorrectChoice = stage === 'feedback' && i === question.answerIndex
                const isWrongSelected = stage === 'feedback' && isSelected && i !== question.answerIndex
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={stage === 'feedback'}
                    onClick={() => handleAnswer(i)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-bold toy-border transition-colors',
                      isCorrectChoice ? 'bg-primary text-primary-foreground' : isWrongSelected ? 'bg-destructive/20 text-foreground' : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {choice}
                    {isCorrectChoice && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                    {isWrongSelected && <X size={16} strokeWidth={3} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="이야기 기억"
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
