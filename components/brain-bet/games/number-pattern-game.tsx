'use client'

import { useEffect, useRef, useState } from 'react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  getNumberPatternTimeLimitForDifficulty,
  NUMBER_PATTERN_INTRO_COUNTDOWN_SECONDS,
  NUMBER_PATTERN_QUESTION_COUNT,
} from '@/lib/config/number-pattern.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { detectDevice } from '@/lib/game/device'
import { pickNumberPatternSession } from '@/lib/game/number-pattern-data'
import type { NumberPatternAnswer, NumberPatternRawSummary } from '@/lib/game/types'
import { calculateNumberPatternScore, summarizeNumberPatternAnswers } from '@/lib/scoring/number-pattern'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing' | 'feedback'

interface NumberPatternGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { answers: NumberPatternAnswer[]; rawSummary: NumberPatternRawSummary; gameScore: number }) => void
  onBack: () => void
}

const TUTORIAL: TutorialContent = {
  goal: '숫자들이 나열된 규칙을 찾아, 빈칸에 들어갈 값을 골라요.',
  steps: ['수열을 보고 규칙을 파악하세요.', '빈칸(?)에 들어갈 값을 선택지에서 고르세요.', '정답 후 어떤 규칙이었는지 짧은 설명이 나와요.'],
  scoring: '정확도를 가장 크게 반영하고, 어려운 문제를 맞히면 추가 점수가 있어요. 빠른 오답보다 신중한 정답이 더 높은 점수를 받아요.',
  example: '2, 4, 6, 8, ? -> 2씩 커지는 규칙이므로 정답은 10',
}

/** "숫자 규칙" — new Reasoning-stat game (spec §9). Questions are drawn each session from a verified static bank (see lib/game/number-pattern-data.ts), never runtime-random-generated. */
export function NumberPatternGame({ index, mode, difficulty, onComplete, onBack }: NumberPatternGameProps) {
  const stat = STATS.reasoning
  const { play } = useSound()
  const [questions] = useState(() => pickNumberPatternSession(mode, difficulty, NUMBER_PATTERN_QUESTION_COUNT))
  const timeLimitMs = getNumberPatternTimeLimitForDifficulty(difficulty)
  const [stage, setStage] = useState<Stage>('intro')
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<NumberPatternAnswer[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const shownAtRef = useRef(0)
  const question = questions[qIndex]

  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen) return
    if (remainingMs <= 0) {
      handleAnswer(null, true)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAnswer reads latest question/index via closure recreated each render
  }, [stage, remainingMs, tutorialOpen])

  const startGame = () => setStage('countdown')

  const startQuestion = (i: number) => {
    setSelected(null)
    setRemainingMs(timeLimitMs)
    shownAtRef.current = performance.now()
    setQIndex(i)
    setStage('playing')
  }

  const handleAnswer = (value: number | null, timedOut = false) => {
    if (stage !== 'playing') return
    const responseTimeMs = Math.round(performance.now() - shownAtRef.current)
    const answer: NumberPatternAnswer = {
      questionIndex: qIndex,
      ruleType: question.ruleType,
      difficulty: question.difficulty,
      selectedValue: value,
      correctValue: question.answer,
      isCorrect: value === question.answer,
      responseTimeMs,
      timedOut,
    }
    const updated = [...answers, answer]
    play(answer.isCorrect ? 'answer-correct' : 'wrong')
    setAnswers(updated)
    setSelected(value)
    setStage('feedback')

    window.setTimeout(() => {
      if (qIndex + 1 < questions.length) {
        startQuestion(qIndex + 1)
      } else {
        const rawSummary = summarizeNumberPatternAnswers(updated)
        const gameScore = calculateNumberPatternScore(rawSummary, detectDevice().inputType)
        onComplete({ answers: updated, rawSummary, gameScore })
      }
    }, 800)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="숫자 규칙"
        mode={mode}
        index={index}
        objective="빈칸에 들어갈 숫자를 규칙에 맞게 고르세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {qIndex + 1} / {questions.length} · {secondsLeft}s
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
              숫자 수열의 규칙을 찾아 빈칸을 채워보세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={NUMBER_PATTERN_INTRO_COUNTDOWN_SECONDS} onDone={() => startQuestion(0)} label="곧 시작해요" />
        )}

        {(stage === 'playing' || stage === 'feedback') && question && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl bg-card px-6 py-10 toy-border toy-shadow-lg">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {question.sequence.map((n, i) => (
                <span
                  key={i}
                  className={cn(
                    'grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-extrabold toy-border',
                    n === null ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {n === null ? '?' : n}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {question.choices.map((choice) => {
                const isSelected = selected === choice
                const isCorrectChoice = stage === 'feedback' && choice === question.answer
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={stage === 'feedback'}
                    onClick={() => handleAnswer(choice)}
                    className={cn(
                      'rounded-2xl px-5 py-3 font-display text-lg font-extrabold toy-border transition-colors',
                      isCorrectChoice
                        ? 'bg-primary text-primary-foreground'
                        : isSelected
                          ? 'bg-destructive/20 text-foreground'
                          : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {choice}
                  </button>
                )
              })}
            </div>

            {stage === 'feedback' && (
              <p className="animate-pop-in text-pretty text-center text-sm font-semibold text-muted-foreground">
                {question.explanation}
              </p>
            )}
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="숫자 규칙"
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
