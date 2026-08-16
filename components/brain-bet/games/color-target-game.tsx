'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  STROOP_COLOR_PALETTE,
  STROOP_INTRO_COUNTDOWN_SECONDS,
  STROOP_RULE_SWITCH_COUNTDOWN_SECONDS,
  getStroopTierConfig,
  type StroopRule,
} from '@/lib/config/color-target.config'
import { GAME_DIFFICULTIES, type GameDifficulty } from '@/lib/game/difficulty'
import { generateStroopSession, type StroopTrialSpec } from '@/lib/game/stroop-session'
import type { ColorTargetClickEvent, ColorTargetRawSummary } from '@/lib/game/types'
import { calculateColorTargetScore, summarizeColorTargetEvents } from '@/lib/scoring/color-target'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'rule-announce' | 'trial' | 'feedback'

interface ColorTargetGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { events: ColorTargetClickEvent[]; rawSummary: ColorTargetRawSummary; gameScore: number }) => void
  onBack: () => void
}

const RULE_LABEL: Record<StroopRule, string> = {
  ink: '글자색을 클릭!',
  meaning: '텍스트가 가리키는 색을 클릭!',
}

const TUTORIAL: TutorialContent = {
  goal: '화면에 뜨는 색깔 단어를 보고, 지금 규칙에 맞는 색 버튼을 눌러요.',
  steps: ['"글자색을 클릭!" 규칙이면 실제로 보이는 글자 색을 고르세요.', '"텍스트가 가리키는 색을 클릭!" 규칙이면 단어가 뜻하는 색을 고르세요.', '규칙이 바뀔 때마다 화면에 크게 안내되니 놓치지 마세요.'],
  scoring: '정확도와 반응 속도를 함께 반영해요. 글자 색과 단어 뜻이 다를 때 더 헷갈릴 수 있어요.',
  example: '"파랑"이라는 글자가 빨간색으로 보인다면 -> "글자색을 클릭!" 규칙에서는 빨강이 정답.',
}

/** "특정 색만 클릭" — Focus-stat game, now a Stroop interference task (2026-08 rework). */
export function ColorTargetGame({ index, mode, difficulty, onComplete, onBack }: ColorTargetGameProps) {
  const stat = STATS.focus
  const { play } = useSound()
  const config = useMemo(() => getStroopTierConfig(difficulty), [difficulty])
  const colors = useMemo(() => STROOP_COLOR_PALETTE.slice(0, config.colorCount), [config])
  const [trials] = useState<StroopTrialSpec[]>(() => generateStroopSession(config))

  const [stage, setStage] = useState<Stage>('intro')
  const [trialIndex, setTrialIndex] = useState(0)
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const eventsRef = useRef<ColorTargetClickEvent[]>([])
  const stimulusShownAtRef = useRef(0)
  const hasResolvedRef = useRef(true)
  const timeoutRef = useRef<number | null>(null)
  const tutorialOpenRef = useRef(false)
  tutorialOpenRef.current = tutorialOpen

  const clearScheduled = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }
  useEffect(() => clearScheduled, [])

  const finish = () => {
    const rawSummary = summarizeColorTargetEvents(eventsRef.current)
    const gameScore = calculateColorTargetScore(rawSummary)
    onComplete({ events: eventsRef.current, rawSummary, gameScore })
  }

  const beginTrial = (index: number) => {
    clearScheduled()
    hasResolvedRef.current = false
    stimulusShownAtRef.current = performance.now()
    setTrialIndex(index)
    setSelectedColorId(null)
    setLastCorrect(null)
    setStage('trial')
    const armTimeout = () => {
      timeoutRef.current = window.setTimeout(() => {
        // The help modal pauses the per-trial clock rather than letting it silently time out underneath it — reschedule instead of resolving while it's open.
        if (tutorialOpenRef.current) {
          armTimeout()
          return
        }
        resolveTrial(index, null)
      }, config.perTrialTimeLimitMs)
    }
    armTimeout()
  }

  const advanceAfter = (index: number) => {
    const nextIndex = index + 1
    if (nextIndex >= trials.length) {
      finish()
      return
    }
    if (trials[nextIndex].isSwitchTrial) {
      setTrialIndex(nextIndex)
      setStage('rule-announce')
      return
    }
    window.setTimeout(() => beginTrial(nextIndex), 350)
  }

  const resolveTrial = (index: number, choiceColorId: string | null) => {
    if (hasResolvedRef.current) return
    hasResolvedRef.current = true
    clearScheduled()

    const trial = trials[index]
    const reactionTimeMs = choiceColorId ? Math.round(performance.now() - stimulusShownAtRef.current) : null
    const correct = choiceColorId === trial.correctColorId
    const kind: ColorTargetClickEvent['kind'] = choiceColorId === null ? 'timeout' : correct ? 'correct' : 'wrong'

    eventsRef.current.push({
      kind,
      rule: trial.rule,
      isIncongruent: trial.isIncongruent,
      isSwitchTrial: trial.isSwitchTrial,
      colorId: trial.correctColorId,
      selectedColorId: choiceColorId,
      reactionTimeMs,
      createdAt: new Date().toISOString(),
    })

    play(kind === 'correct' ? 'answer-correct' : 'wrong')
    setSelectedColorId(choiceColorId)
    setLastCorrect(kind === 'correct')
    setStage('feedback')

    window.setTimeout(() => advanceAfter(index), 450)
  }

  const startGame = () => setStage('rule-announce')
  const handleIntroCountdownDone = () => {
    // The very first rule also gets the announce+countdown treatment, same as every later switch — a player should never start not knowing the active rule.
    beginTrial(0)
  }

  const handleChoice = (colorId: string) => {
    if (stage !== 'trial') return
    resolveTrial(trialIndex, colorId)
  }

  const currentTrial = trials[trialIndex]
  const currentColor = colors.find((c) => c.id === currentTrial?.inkColorId)
  const wordColor = colors.find((c) => c.id === currentTrial?.wordColorId)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="특정 색만 클릭"
        mode={mode}
        index={index}
        objective="지금 규칙에 맞는 색을 클릭하세요."
        statusSlot={
          stage === 'trial' || stage === 'feedback' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {trialIndex + 1} / {trials.length}
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
              색깔 단어를 보고, 지금 규칙에 맞는 색을 골라보세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'rule-announce' && trials[trialIndex] && (
          <GameCountdown
            seconds={trialIndex === 0 ? STROOP_INTRO_COUNTDOWN_SECONDS : STROOP_RULE_SWITCH_COUNTDOWN_SECONDS}
            onDone={trialIndex === 0 ? handleIntroCountdownDone : () => beginTrial(trialIndex)}
            label={`이번에는 ${RULE_LABEL[trials[trialIndex].rule]}`}
          />
        )}

        {(stage === 'trial' || stage === 'feedback') && currentTrial && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 rounded-3xl bg-card px-6 py-10 toy-border toy-shadow-lg">
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {RULE_LABEL[currentTrial.rule]}
            </span>

            <p
              className="font-display text-5xl font-extrabold"
              style={{ color: `var(${currentColor?.colorVar})` }}
              aria-label={`${wordColor?.label} 단어가 ${currentColor?.label}으로 표시됨`}
            >
              {wordColor?.label}
            </p>

            {/* flex-wrap + justify-center (not a fixed grid-cols-N) so any color
                count — 3 (Easy practice), 4, or 5 — always centers as a whole,
                including a short last row (e.g. 5 wraps to 2+2+1, the trailing
                1 centered rather than stuck on the left). Button width is
                fixed and wide enough that mobile widths reliably wrap to 2
                per row, while the wider desktop card fits every count on one
                centered row. */}
            <div className="flex w-full flex-wrap justify-center gap-2.5">
              {colors.map((c) => {
                const isSelected = selectedColorId === c.id
                const isCorrectChoice = stage === 'feedback' && c.id === currentTrial.correctColorId
                const isWrongSelected = stage === 'feedback' && isSelected && c.id !== currentTrial.correctColorId
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={stage === 'feedback'}
                    onClick={() => handleChoice(c.id)}
                    aria-label={c.label}
                    className={cn(
                      'flex h-14 w-36 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-[color:var(--ink)] toy-border transition-transform active:translate-y-0.5 sm:w-28',
                      isCorrectChoice && 'ring-4 ring-primary',
                      isWrongSelected && 'ring-4 ring-destructive',
                    )}
                    style={{ backgroundColor: `var(${c.colorVar})` }}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>

            {stage === 'feedback' && (
              <p className={cn('font-display text-sm font-bold', lastCorrect ? 'text-primary' : 'text-destructive')}>
                {lastCorrect ? '정답!' : '아쉬워요!'}
              </p>
            )}
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="특정 색만 클릭"
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
