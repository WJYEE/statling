'use client'

import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { SpatialShapeView } from '@/components/brain-bet/games/spatial-shape'
import { GameRuleReminder } from '@/components/brain-bet/games/shared/game-rule-reminder'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import { STATS } from '@/lib/brain-bet'
import {
  SPATIAL_FEEDBACK_MS,
  SPATIAL_REAL_QUESTIONS,
  SPATIAL_TUTORIAL_TRANSITION_MS,
  getSpatialTimeLimitForDifficulty,
} from '@/lib/config/spatial.config'
import { detectDevice } from '@/lib/game/device'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import {
  buildTutorialQuestion1,
  buildTutorialQuestion2,
  generateSpatialSession,
  type GeneratedSpatialQuestion,
} from '@/lib/game/spatial-problems'
import type { SpatialRawSummary, SpatialTrial } from '@/lib/game/types'
import { calculateSpatialScore, summarizeSpatialTrials } from '@/lib/scoring/spatial'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'playing' | 'feedback'
type Round = 'tutorial-1' | 'real'

interface SpatialGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    trials: SpatialTrial[]
    rawSummary: SpatialRawSummary
    gameScore: number
  }) => void
  onBack: () => void
}

interface LastOutcome {
  selectedOptionIndex: number | null
  isCorrect: boolean
  timedOut: boolean
}

type QuestionOutcome = { kind: 'option'; optionIndex: number } | { kind: 'timeout' }

/**
 * Real, interactive Spatial ("Rotate It" / 2D Mental Rotation) game —
 * GAME_SPEC §64-73. A reference Shape is shown once per question; the
 * player must find which of 4 candidates (2x2 Grid) is the SAME shape,
 * just rotated — never one shown at 0° (that would let simple visual
 * comparison substitute for actual Mental Rotation). Distractors escalate
 * one element at a time across 4 fixed Levels (unrelated shape → similar
 * shape → + Mirror → + a very similar structural distractor). Each question
 * has its own time limit (shorter at higher Levels) rather than one global
 * timer — the skill being measured is accurate rotation, not throughput.
 * Tutorial (1, discarded, plain rotation only — the Mirror trap is explained
 * via the transition message instead of a second practice question) then
 * SPATIAL_REAL_QUESTIONS fixed-difficulty questions.
 *
 * Option click / Timeout both resolve through the single `resolveQuestion`
 * below, which reads the question's context from refs (not from React state
 * closures) — refs are always current the instant a new question begins,
 * whereas a value captured by a `setTimeout` callback's closure can
 * otherwise reflect the question that was active when that timeout was
 * scheduled rather than whichever question the timer actually belongs to by
 * the time it fires. `hasResolvedRef` additionally guarantees a question is
 * resolved exactly once even if a timeout and a click land back-to-back.
 */
export function SpatialGame({ index, mode, difficulty, onComplete, onBack }: SpatialGameProps) {
  const stat = STATS.spatial
  const { play } = useSound()

  const [stage, setStage] = useState<Stage>('intro')
  const [round, setRound] = useState<Round>('tutorial-1')
  const [realQuestionIndex, setRealQuestionIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<GeneratedSpatialQuestion | null>(null)
  const [message, setMessage] = useState('')
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [questionStartedAt, setQuestionStartedAt] = useState(0)
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null)

  // Source of truth for anything resolveQuestion needs — always current,
  // updated synchronously in beginQuestion, never subject to closure staleness.
  const roundRef = useRef<Round>('tutorial-1')
  const realQuestionIndexRef = useRef(0)
  const currentQuestionRef = useRef<GeneratedSpatialQuestion | null>(null)
  const realQuestionsRef = useRef<GeneratedSpatialQuestion[]>([])
  const timeLimitMsRef = useRef<number | null>(null)
  const questionStartedAtRef = useRef(0)
  const trialsRef = useRef<SpatialTrial[]>([])
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

    const limit = nextRound === 'real' ? getSpatialTimeLimitForDifficulty(question.difficultyLevel, difficulty) : null
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
    setMessage('회전했을 때 기준과 같은 모양이 되는 조각을 찾아주세요.')
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
    setMessage(timedOut ? '시간 초과! 정답은 이 조각이었어요.' : isCorrect ? '맞았어요!' : '정답은 이 조각이었어요.')

    const currentRound = roundRef.current

    if (currentRound === 'tutorial-1') {
      schedule(() => {
        setMessage('좌우가 뒤집힌 조각은 돌려도 같은 모양이 되지 않아요. 이제 실전을 시작할게요.')
        schedule(() => beginQuestion('real', 0), SPATIAL_TUTORIAL_TRANSITION_MS)
      }, SPATIAL_FEEDBACK_MS)
      return
    }

    const realIndexNow = realQuestionIndexRef.current
    const trial: SpatialTrial = {
      trialIndex: trialsRef.current.length,
      difficultyLevel: question.difficultyLevel,
      shapeId: question.referenceShapeId,
      rotationAngle: question.correctRotationAngle,
      mirrorIncluded: question.mirrorIncluded,
      optionCount: question.options.length,
      options: question.options.map((o) => ({
        shapeId: o.shapeId,
        rotationAngle: o.rotationAngle,
        isMirrored: o.isMirrored,
        isCorrect: o.isCorrect,
        distractorType: o.distractorType,
      })),
      correctOptionIndex: question.correctOptionIndex,
      selectedOptionIndex,
      isCorrect,
      responseTimeMs,
      timedOut,
      createdAt: new Date().toISOString(),
    }
    const updated = [...trialsRef.current, trial]
    trialsRef.current = updated

    if (updated.length >= SPATIAL_REAL_QUESTIONS) {
      const rawSummary = summarizeSpatialTrials(updated)
      const gameScore = calculateSpatialScore(rawSummary, detectDevice().inputType)
      schedule(() => onComplete({ trials: updated, rawSummary, gameScore }), SPATIAL_FEEDBACK_MS)
      return
    }

    schedule(() => {
      beginQuestion('real', realIndexNow + 1)
    }, SPATIAL_FEEDBACK_MS)
  }

  const startGame = () => {
    play('game-start')
    clearScheduled()
    realQuestionsRef.current = generateSpatialSession()
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
  const tutorialHint = round === 'tutorial-1' ? '방향이 달라도 돌려보면 같은 모양일 수 있어요.' : ''

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-3 sm:py-6">
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
            <FreePlayBadge onBack={onBack} />
          )}
        </div>
      </header>

      {/* Fixed-height row regardless of Tutorial vs Real. */}
      <div className="mt-4 flex items-center justify-between gap-4 sm:mt-6">
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
            {SPATIAL_REAL_QUESTIONS}
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
            <SpatialShapeView
              cells={[
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
              ]}
              color="var(--card)"
              size={44}
            />
          </span>
          <div className="max-w-sm">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              기준 조각을 머릿속으로 돌렸을 때 같은 모양이 되는 조각을 찾아주세요.
            </p>
            <p className="text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
              탭해서 시작하기
            </p>
          </div>
        </button>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-3xl bg-card px-6 py-2 toy-border toy-shadow-lg sm:mt-5 sm:gap-3 sm:py-6">
          {/* Reference Shape — always visible, shown at its natural (0°) orientation. */}
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-secondary px-4 py-1.5 toy-border sm:gap-1.5 sm:py-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-secondary-foreground">기준 모양</span>
            {currentQuestion && (
              <SpatialShapeView cells={currentQuestion.referenceCells} color={`var(${stat.colorVar})`} size={72} />
            )}
          </div>

          {/* Fixed-height message + Tutorial caption slot. */}
          <div className="flex min-h-7 flex-col items-center justify-center gap-1 text-center sm:min-h-16">
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
            ) : (
              <p className={cn('text-[11px] font-semibold text-muted-foreground', round === 'real' && 'invisible')}>
                이 기록은 결과에 포함되지 않아요.
              </p>
            )}
          </div>

          <GameRuleReminder text="기준 조각을 머릿속으로 돌렸을 때 같은 모양이 되는 조각을 찾아주세요." />

          {/* Fixed-height time gauge slot — static full bar during Tutorial. */}
          <div className="h-2 w-full max-w-45 overflow-hidden rounded-full bg-muted sm:max-w-xs">
            <div
              className={cn('h-full rounded-full transition-[width] duration-100', gaugeCritical ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${gaugePercent}%` }}
            />
          </div>

          {/* Option Grid — always 2x2, always 4 candidates. Smaller footprint
              on mobile (see the mobile-viewport audit) — the game never
              requires seeing the whole board, only enough to tap the correct
              candidate, so this is the one place mobile intentionally trades
              board size for fitting the whole game on screen. */}
          <div className="mx-auto grid w-full max-w-45 grid-cols-2 gap-1.5 sm:max-w-xs sm:gap-3">
            {currentQuestion?.options.map((option, optionIndex) => {
              const visual = optionVisual(optionIndex)
              return (
                <button
                  key={`${round}-${optionIndex}-${option.shapeId}-${option.rotationAngle}-${option.isMirrored}`}
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
                  <SpatialShapeView cells={option.cells} color={`var(${stat.colorVar})`} size={72} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
