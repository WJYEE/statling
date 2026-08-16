'use client'

import { useEffect, useRef, useState } from 'react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  BEST_CHOICE_INTRO_COUNTDOWN_SECONDS,
  getBestChoiceRoundCountForDifficulty,
  getBestChoiceTimeLimitMsForDifficulty,
} from '@/lib/config/best-choice.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickComparisonQuestions } from '@/lib/game/decision-scenarios'
import type { BestChoiceAnswer, BestChoiceRawSummary } from '@/lib/game/types'
import { calculateBestChoiceScore, summarizeBestChoiceAnswers } from '@/lib/scoring/best-choice'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing' | 'feedback'

interface BestChoiceGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { answers: BestChoiceAnswer[]; rawSummary: BestChoiceRawSummary; gameScore: number }) => void
  onBack: () => void
}

const TUTORIAL: TutorialContent = {
  goal: '두 가지 중 사실에 맞는 답을 최대한 빠르고 정확하게 골라요.',
  steps: ['질문을 읽고 두 선택지를 비교하세요.', '사실에 맞는 쪽을 고르세요.', '정답/오답 여부는 바로 알려드려요.'],
  scoring: '정확도가 가장 중요하고, 응답 속도도 함께 반영해요. 빠른 오답보다 느린 정답이 더 좋은 점수예요.',
  example: '"둘 중 더 큰 동물은?" 코끼리 vs 개미 -> 정답: 코끼리',
}

/** "무엇을 선택할까" — Judgment-stat game, now a binary (A/B) fact-comparison quiz (2026-08 rework). */
export function BestChoiceGame({ index, mode, difficulty, onComplete, onBack }: BestChoiceGameProps) {
  const stat = STATS.judgment
  const { play } = useSound()
  const timeLimitMs = getBestChoiceTimeLimitMsForDifficulty(difficulty)
  const [rounds] = useState(() => pickComparisonQuestions(difficulty, getBestChoiceRoundCountForDifficulty(difficulty)))
  const [stage, setStage] = useState<Stage>('intro')
  const [roundIndex, setRoundIndex] = useState(0)
  const [answers, setAnswers] = useState<BestChoiceAnswer[]>([])
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const shownAtRef = useRef(0)
  const round = rounds[roundIndex]

  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen) return
    if (remainingMs <= 0) {
      handleChoose(null, true)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleChoose reads latest round/roundIndex via closure recreated each render
  }, [stage, remainingMs, tutorialOpen])

  const startGame = () => setStage('countdown')

  const startRound = (rIndex: number) => {
    setSelectedOption(null)
    setRemainingMs(timeLimitMs)
    shownAtRef.current = performance.now()
    setRoundIndex(rIndex)
    setStage('playing')
  }

  const handleChoose = (option: 'A' | 'B' | null, timedOut = false) => {
    if (stage !== 'playing') return
    const responseTimeMs = Math.round(performance.now() - shownAtRef.current)
    const isCorrect = option === round.correctOption
    const answer: BestChoiceAnswer = {
      roundIndex,
      scenarioId: round.id,
      selectedOption: option,
      correctOption: round.correctOption,
      isCorrect,
      responseTimeMs,
      timedOut,
    }
    const updated = [...answers, answer]
    play(isCorrect ? 'answer-correct' : 'wrong')
    setAnswers(updated)
    setSelectedOption(option)
    setStage('feedback')

    window.setTimeout(() => {
      if (roundIndex + 1 < rounds.length) {
        startRound(roundIndex + 1)
      } else {
        const rawSummary = summarizeBestChoiceAnswers(updated)
        const gameScore = calculateBestChoiceScore(rawSummary)
        onComplete({ answers: updated, rawSummary, gameScore })
      }
    }, 700)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="무엇을 선택할까"
        mode={mode}
        index={index}
        objective="사실에 맞는 답을 빠르고 정확하게 고르세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {roundIndex + 1} / {rounds.length} · {secondsLeft}s
            </span>
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
        onBack={onBack}
      />
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              둘 중 사실에 맞는 답을 빠르고 정확하게 골라보세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={BEST_CHOICE_INTRO_COUNTDOWN_SECONDS} onDone={() => startRound(0)} label="곧 시작해요" />
        )}

        {(stage === 'playing' || stage === 'feedback') && round && (
          <div className="flex flex-1 flex-col gap-5 rounded-3xl bg-card px-6 py-7 toy-border toy-shadow-lg">
            <p className="text-pretty text-center font-display text-lg font-bold leading-snug text-foreground">
              {round.prompt}
            </p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(['A', 'B'] as const).map((option) => {
                const label = option === 'A' ? round.optionA : round.optionB
                const isSelected = selectedOption === option
                const isCorrectOption = stage === 'feedback' && option === round.correctOption
                const isWrongSelected = stage === 'feedback' && isSelected && option !== round.correctOption
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={stage === 'feedback'}
                    onClick={() => handleChoose(option)}
                    className={cn(
                      'rounded-2xl px-4 py-5 text-center text-base font-bold toy-border transition-colors',
                      isCorrectOption
                        ? 'bg-primary text-primary-foreground'
                        : isWrongSelected
                          ? 'bg-destructive/20 text-foreground'
                          : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {stage === 'feedback' && (
              <p className="animate-pop-in text-pretty text-center text-sm font-semibold text-foreground">
                {selectedOption === round.correctOption ? '정답이에요!' : `아쉬워요! 정답은 "${round.correctOption === 'A' ? round.optionA : round.optionB}"예요.`}
              </p>
            )}
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="무엇을 선택할까"
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
