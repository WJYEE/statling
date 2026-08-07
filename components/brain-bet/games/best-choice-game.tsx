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
} from '@/lib/config/best-choice.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickDecisionScenarios } from '@/lib/game/decision-scenarios'
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
}

const TUTORIAL: TutorialContent = {
  goal: '주어진 상황과 목표를 보고, 제한 시간 안에 가장 효율적인 선택지를 골라요.',
  steps: ['상황과 목표를 확인하세요.', '선택지 중 목표를 가장 잘 만족하는 것을 고르세요.', '고른 직후 왜 그 선택이 좋은지 짧은 설명이 나와요.'],
  scoring: '도덕적 정답이 아니라, 목표에 얼마나 효율적인 선택인지로 점수를 매겨요. 속도보다 정확도가 더 중요해요.',
  example: '목표: "5분 안에 가장 많이 옮기기" -> 한 번에 여러 개를 옮기는 선택이 가장 좋아요.',
}

/** "무엇을 선택할까" — new Judgment-stat game (spec §7). */
export function BestChoiceGame({ index, mode, difficulty, onComplete }: BestChoiceGameProps) {
  const stat = STATS.judgment
  const { play } = useSound()
  // Computed once at mount (lazy useState initializer) — at 'normal' (Load multiplier 1)
  // this is exactly BEST_CHOICE_ROUND_COUNT, so First Play stays unchanged.
  const [scenarios] = useState(() => pickDecisionScenarios(getBestChoiceRoundCountForDifficulty(difficulty)))
  const [stage, setStage] = useState<Stage>('intro')
  const [roundIndex, setRoundIndex] = useState(0)
  const [answers, setAnswers] = useState<BestChoiceAnswer[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const shownAtRef = useRef(0)

  const scenario = scenarios[roundIndex]

  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen) return
    if (remainingMs <= 0) {
      handleChoose(null, true)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleChoose reads latest scenario/round via closure recreated each render
  }, [stage, remainingMs, tutorialOpen])

  const startGame = () => setStage('countdown')

  const startRound = (rIndex: number) => {
    setSelectedIndex(null)
    setRemainingMs(scenarios[rIndex].timeLimitSeconds * 1000)
    shownAtRef.current = performance.now()
    setRoundIndex(rIndex)
    setStage('playing')
  }

  const handleChoose = (choiceIndex: number | null, timedOut = false) => {
    if (stage !== 'playing') return
    const responseTimeMs = Math.round(performance.now() - shownAtRef.current)
    const bestPossibleScore = Math.max(...scenario.choices.map((c) => c.score))
    const answer: BestChoiceAnswer = {
      roundIndex,
      scenarioId: scenario.id,
      selectedIndex: choiceIndex,
      selectedScore: choiceIndex != null ? scenario.choices[choiceIndex].score : 0,
      bestPossibleScore,
      responseTimeMs,
      timedOut,
    }
    const updated = [...answers, answer]
    play(answer.selectedIndex != null && answer.selectedScore === bestPossibleScore ? 'answer-correct' : 'wrong')
    setAnswers(updated)
    setSelectedIndex(choiceIndex)
    setStage('feedback')

    window.setTimeout(() => {
      if (roundIndex + 1 < scenarios.length) {
        startRound(roundIndex + 1)
      } else {
        const rawSummary = summarizeBestChoiceAnswers(updated)
        const gameScore = calculateBestChoiceScore(rawSummary)
        onComplete({ answers: updated, rawSummary, gameScore })
      }
    }, 800)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const chosenFeedback = selectedIndex != null ? scenario.choices[selectedIndex].feedback : '시간이 초과되었어요.'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="무엇을 선택할까"
        mode={mode}
        index={index}
        objective="목표에 가장 효율적인 선택지를 고르세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {roundIndex + 1} / {scenarios.length} · {secondsLeft}s
            </span>
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
      />
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              상황과 목표를 읽고, 가장 효율적인 선택을 골라보세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={BEST_CHOICE_INTRO_COUNTDOWN_SECONDS} onDone={() => startRound(0)} label="곧 시작해요" />
        )}

        {(stage === 'playing' || stage === 'feedback') && scenario && (
          <div className="flex flex-1 flex-col gap-4 rounded-3xl bg-card px-6 py-7 toy-border toy-shadow-lg">
            <div>
              <p className="text-pretty text-center font-display text-lg font-bold leading-snug text-foreground">
                {scenario.prompt}
              </p>
              <p className="mt-1.5 text-pretty text-center text-xs font-semibold text-primary">{scenario.goal}</p>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {scenario.choices.map((choice, i) => {
                const isSelected = selectedIndex === i
                const isBest = stage === 'feedback' && choice.score === Math.max(...scenario.choices.map((c) => c.score))
                return (
                  <button
                    key={choice.text}
                    type="button"
                    disabled={stage === 'feedback'}
                    onClick={() => handleChoose(i)}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-left text-sm font-bold toy-border transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : isBest
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {choice.text}
                  </button>
                )
              })}
            </div>

            {stage === 'feedback' && (
              <p className="animate-pop-in text-pretty text-center text-sm font-semibold text-foreground">
                {chosenFeedback}
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
