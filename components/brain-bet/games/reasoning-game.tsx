'use client'

import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ReasoningSymbolView } from '@/components/brain-bet/games/reasoning-symbol'
import { GameRuleReminder } from '@/components/brain-bet/games/shared/game-rule-reminder'
import { STATS } from '@/lib/brain-bet'
import {
  getReasoningTimeLimitForDifficulty,
  REASONING_FEEDBACK_MS,
  REASONING_REAL_QUESTIONS,
  REASONING_TUTORIAL_TRANSITION_MS,
} from '@/lib/config/reasoning.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { detectDevice } from '@/lib/game/device'
import {
  buildTutorialQuestion1,
  buildTutorialQuestion2,
  generateReasoningSession,
  type GeneratedReasoningQuestion,
} from '@/lib/game/reasoning-problems'
import type { ReasoningRawSummary, ReasoningTrial } from '@/lib/game/types'
import { calculateReasoningScore, summarizeReasoningTrials } from '@/lib/scoring/reasoning'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'playing' | 'feedback'
type Round = 'tutorial-1' | 'real'
type QuestionOutcome = { kind: 'option'; optionIndex: number } | { kind: 'timeout' }

interface ReasoningGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    trials: ReasoningTrial[]
    rawSummary: ReasoningRawSummary
    gameScore: number
  }) => void
}

interface LastOutcome {
  selectedOptionIndex: number | null
  isCorrect: boolean
  timedOut: boolean
}

/**
 * Real, interactive Reasoning ("Pattern Reasoning") game — GAME_SPEC §74-84.
 * A horizontal Sequence Strip shows 3-4 known cells followed by a "?" slot;
 * the player must discover, purely by observing how the sequence evolves,
 * which of 4 candidates continues it correctly — the rule itself is NEVER
 * shown (no Rule Banner, unlike Judgment, where the active rule is always
 * displayed and the task is fast correct application of an already-known
 * rule). Distractors are deliberately plausible reasoning slips (repeating
 * the last value, applying the change backwards, or getting only one of two
 * simultaneously-changing attributes right), not random unrelated symbols.
 * Each question has its own time limit that INCREASES with difficulty
 * (Level 3-4 need more time to analyze, not less — the opposite of
 * Spatial's schedule, since the skill here is rule discovery, not speed).
 * Tutorial (1, discarded, shape alternation only — the "rules can also be
 * about count/position/direction" point is explained via the transition
 * message instead of a second practice question) then REASONING_REAL_QUESTIONS
 * fixed-difficulty questions.
 *
 * Option click / Timeout both resolve through the single `resolveQuestion`
 * below, reading the question's context from refs (not React state
 * closures) with a `hasResolvedRef` guard — the same pattern already
 * stabilized in Focus and Spatial, applied here from the start.
 */
export function ReasoningGame({ index, mode, difficulty, onComplete }: ReasoningGameProps) {
  const stat = STATS.reasoning
  const { play } = useSound()

  const [stage, setStage] = useState<Stage>('intro')
  const [round, setRound] = useState<Round>('tutorial-1')
  const [realQuestionIndex, setRealQuestionIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<GeneratedReasoningQuestion | null>(null)
  const [message, setMessage] = useState('')
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [questionStartedAt, setQuestionStartedAt] = useState(0)
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null)

  // Source of truth for anything resolveQuestion needs — always current,
  // updated synchronously in beginQuestion, never subject to closure staleness.
  const roundRef = useRef<Round>('tutorial-1')
  const realQuestionIndexRef = useRef(0)
  const currentQuestionRef = useRef<GeneratedReasoningQuestion | null>(null)
  const realQuestionsRef = useRef<GeneratedReasoningQuestion[]>([])
  const timeLimitMsRef = useRef<number | null>(null)
  const questionStartedAtRef = useRef(0)
  const trialsRef = useRef<ReasoningTrial[]>([])
  const hasResolvedRef = useRef(true) // true until a question is actually begun

  const timeoutsRef = useRef<number[]>([])
  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timeoutsRef.current.push(id)
    return id
  }
  const clearScheduled = () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id))
    timeoutsRef.current = []
  }
  useEffect(() => clearScheduled, [])

  // Countdown gauge tick — real questions only; Tutorial has no time limit.
  useEffect(() => {
    if (stage !== 'playing' || timeLimitMs == null) return
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, timeLimitMs - (performance.now() - questionStartedAt)))
    }, 100)
    return () => window.clearInterval(interval)
  }, [stage, timeLimitMs, questionStartedAt])

  const beginQuestion = (nextRound: Round, nextRealIndex: number) => {
    clearScheduled()
    hasResolvedRef.current = false

    const question =
      nextRound === 'tutorial-1' ? buildTutorialQuestion1() : realQuestionsRef.current[nextRealIndex]

    const limit = nextRound === 'real' ? getReasoningTimeLimitForDifficulty(question.difficultyLevel, difficulty) : null
    const startedAt = performance.now()

    roundRef.current = nextRound
    realQuestionIndexRef.current = nextRealIndex
    currentQuestionRef.current = question
    timeLimitMsRef.current = limit
    questionStartedAtRef.current = startedAt

    setRound(nextRound)
    setRealQuestionIndex(nextRealIndex)
    setCurrentQuestion(question)
    setLastOutcome(null)
    setMessage('다음에 올 것을 찾아보세요.')
    setStage('playing')
    setTimeLimitMs(limit)
    setRemainingMs(limit ?? 0)
    setQuestionStartedAt(startedAt)

    if (limit != null) {
      schedule(() => resolveQuestion({ kind: 'timeout' }), limit)
    }
  }

  const resolveQuestion = (outcome: QuestionOutcome) => {
    // Guards against a Timer callback and a user click landing at the same
    // moment — whichever gets here first wins, the other is a no-op.
    if (hasResolvedRef.current) return
    hasResolvedRef.current = true
    clearScheduled()

    const question = currentQuestionRef.current
    if (!question) return
    const timedOut = outcome.kind === 'timeout'
    const selectedOptionIndex = outcome.kind === 'option' ? outcome.optionIndex : null
    const responseTimeMs = timedOut
      ? (timeLimitMsRef.current ?? 0)
      : Math.round(performance.now() - questionStartedAtRef.current)
    const isCorrect = !timedOut && selectedOptionIndex === question.correctOptionIndex
    play(isCorrect ? 'answer-correct' : 'wrong')

    setStage('feedback')
    setLastOutcome({ selectedOptionIndex, isCorrect, timedOut })
    setMessage(timedOut ? '시간이 다 됐어요!' : isCorrect ? '맞았어요!' : '아쉬워요!')

    const currentRound = roundRef.current

    if (currentRound === 'tutorial-1') {
      schedule(() => {
        setMessage('규칙은 모양뿐 아니라 개수·위치·방향에도 있을 수 있어요. 이제 실전을 시작할게요.')
        schedule(() => beginQuestion('real', 0), REASONING_TUTORIAL_TRANSITION_MS)
      }, REASONING_FEEDBACK_MS)
      return
    }

    const realIndexNow = realQuestionIndexRef.current
    const trial: ReasoningTrial = {
      trialIndex: trialsRef.current.length,
      questionId: question.questionId,
      templateId: question.templateId,
      reasoningType: question.reasoningType,
      difficultyLevel: question.difficultyLevel,
      optionCount: question.options.length,
      options: question.options.map((o) => ({ isCorrect: o.isCorrect, distractorType: o.distractorType })),
      correctOptionIndex: question.correctOptionIndex,
      selectedOptionIndex,
      isCorrect,
      responseTimeMs,
      timedOut,
      createdAt: new Date().toISOString(),
    }
    const updated = [...trialsRef.current, trial]
    trialsRef.current = updated

    if (updated.length >= REASONING_REAL_QUESTIONS) {
      const rawSummary = summarizeReasoningTrials(updated)
      const gameScore = calculateReasoningScore(rawSummary, detectDevice().inputType)
      schedule(() => onComplete({ trials: updated, rawSummary, gameScore }), REASONING_FEEDBACK_MS)
      return
    }

    schedule(() => {
      beginQuestion('real', realIndexNow + 1)
    }, REASONING_FEEDBACK_MS)
  }

  const startGame = () => {
    play('game-start')
    clearScheduled()
    realQuestionsRef.current = generateReasoningSession()
    trialsRef.current = []
    beginQuestion('tutorial-1', 0)
  }

  const handleOptionClick = (optionIndex: number) => {
    if (stage !== 'playing') return
    resolveQuestion({ kind: 'option', optionIndex })
  }

  const optionVisual = (optionIndex: number): 'idle' | 'correct' | 'wrong' | 'reveal' => {
    if (stage === 'feedback' && lastOutcome && currentQuestion) {
      if (lastOutcome.selectedOptionIndex === optionIndex && lastOutcome.isCorrect) return 'correct'
      if (lastOutcome.selectedOptionIndex === optionIndex && !lastOutcome.isCorrect) return 'wrong'
      if (!lastOutcome.isCorrect && optionIndex === currentQuestion.correctOptionIndex) return 'reveal'
    }
    return 'idle'
  }

  const gaugePercent = timeLimitMs == null ? 100 : Math.max(0, Math.min(100, (remainingMs / timeLimitMs) * 100))
  const gaugeCritical = timeLimitMs != null && gaugePercent < 25
  const tutorialHint = round === 'tutorial-1' ? '반복되는 규칙을 찾아 다음에 올 것을 골라보세요.' : ''

  // A longer strip (4 known cells + "?") gets slightly smaller cards so it
  // never overflows a narrow mobile viewport — never just force-shrinking
  // everything, only stepping down once the strip actually needs it.
  const totalCells = (currentQuestion?.sequence.length ?? 0) + 1
  const isLongStrip = totalCells >= 5
  const cellSizeClass = isLongStrip ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-14 w-14 sm:h-16 sm:w-16'
  const cellSymbolSize = isLongStrip ? 36 : 44

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <header className="flex flex-col gap-2">
        {mode === 'first' && (
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-secondary-foreground toy-border">
              <Save size={11} strokeWidth={2.6} />
              자동 저장 중
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <Logo size="sm" />
          {mode === 'first' ? (
            <ProgressTrack current={index} />
          ) : (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              FREE PLAY
            </span>
          )}
        </div>
      </header>

      {/* Fixed-height row regardless of Tutorial vs Real. */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatBadge stat={stat} size="md" />
          <h1 className="font-display text-2xl font-extrabold leading-none text-foreground">{stat.name}</h1>
        </div>
        {round !== 'real' ? (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            튜토리얼 <span className="text-primary">1</span> / 1
          </span>
        ) : (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            Lv.{currentQuestion?.difficultyLevel ?? 1} · <span className="text-primary">{realQuestionIndex + 1}</span> /{' '}
            {REASONING_REAL_QUESTIONS}
          </span>
        )}
      </div>

      {stage === 'intro' ? (
        <button
          type="button"
          data-sfx-skip
          onClick={startGame}
          className="mt-5 flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg transition-colors duration-150"
        >
          <span
            className="grid h-24 w-24 place-items-center rounded-3xl toy-border toy-shadow"
            style={{ backgroundColor: `var(${stat.colorVar})` }}
          >
            <ReasoningSymbolView symbol={{ shape: 'circle', count: 1, rotationDeg: 0, position: null }} color="var(--card)" size={44} />
          </span>
          <div className="max-w-sm">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              앞의 패턴에서 숨은 규칙을 찾아 다음에 올 것을 골라보세요.
            </p>
            <p className="text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
              탭해서 시작하기
            </p>
          </div>
        </button>
      ) : (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-card px-6 py-6 toy-border toy-shadow-lg">
          {/* Sequence Strip — known cells + a visually distinct "?" slot. No rule hint is ever shown here. */}
          <div className="flex w-full items-center justify-center gap-2 overflow-x-auto py-1">
            {currentQuestion?.sequence.map((symbol, i) => (
              <div
                key={i}
                className={cn('grid shrink-0 place-items-center rounded-2xl bg-background toy-border', cellSizeClass)}
              >
                <ReasoningSymbolView symbol={symbol} color={`var(${stat.colorVar})`} size={cellSymbolSize} />
              </div>
            ))}
            <div
              className={cn(
                'grid shrink-0 place-items-center rounded-2xl border-2 border-dashed border-muted-foreground/40 bg-secondary/40 font-display text-lg font-extrabold text-muted-foreground',
                cellSizeClass,
              )}
            >
              ?
            </div>
          </div>

          {/* Fixed-height message + Tutorial caption slot. */}
          <div className="flex min-h-16 flex-col items-center justify-center gap-1 text-center">
            <p
              className={cn(
                'text-pretty font-display text-base font-bold leading-snug',
                stage === 'feedback' ? 'text-primary' : 'text-foreground',
              )}
            >
              {message}
            </p>
            {stage === 'feedback' && tutorialHint ? (
              <p className="text-[11px] font-semibold text-secondary-foreground">{tutorialHint}</p>
            ) : stage === 'feedback' && round === 'real' && currentQuestion ? (
              <p className="text-pretty text-[11px] font-semibold text-secondary-foreground">
                {currentQuestion.ruleExplanation}
              </p>
            ) : (
              <p className={cn('text-[11px] font-semibold text-muted-foreground', round === 'real' && 'invisible')}>
                이 기록은 결과에 포함되지 않아요.
              </p>
            )}
          </div>

          <GameRuleReminder text="앞의 패턴에서 숨은 규칙을 찾아 다음에 올 것을 골라보세요." />

          {/* Fixed-height time gauge slot — static full bar during Tutorial. */}
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-[width] duration-100', gaugeCritical ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${gaugePercent}%` }}
            />
          </div>

          {/* Option Grid — always 2x2, always 4 candidates. */}
          <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-3">
            {currentQuestion?.options.map((option, optionIndex) => {
              const visual = optionVisual(optionIndex)
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() => handleOptionClick(optionIndex)}
                  disabled={stage !== 'playing'}
                  aria-label={`후보 ${optionIndex + 1}`}
                  className={cn(
                    'grid aspect-square place-items-center rounded-2xl toy-border transition-transform duration-150',
                    stage === 'playing' && 'bg-background hover:-translate-y-0.5',
                    stage !== 'playing' && visual === 'idle' && 'bg-background opacity-60',
                    visual === 'correct' && 'bg-[var(--chart-4)]',
                    visual === 'wrong' && 'bg-destructive/70',
                    visual === 'reveal' && 'animate-pop-in bg-accent toy-shadow-sm ring-2 ring-accent',
                  )}
                >
                  <ReasoningSymbolView symbol={option.symbol} color={`var(${stat.colorVar})`} size={64} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
