'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { FocusSymbolView } from '@/components/brain-bet/games/focus-symbol'
import { GameRuleReminder } from '@/components/brain-bet/games/shared/game-rule-reminder'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import { STATS } from '@/lib/brain-bet'
import {
  FOCUS_NO_TARGET_ROUND_COUNT,
  FOCUS_REAL_GRID_SIZE,
  FOCUS_REAL_ROUNDS,
  FOCUS_ROUND_FEEDBACK_MS,
  FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY,
  FOCUS_TUTORIAL_DIFFICULTY,
  FOCUS_TUTORIAL_GRID_SIZE,
  FOCUS_TUTORIAL_ROUNDS,
  FOCUS_TUTORIAL_TRANSITION_MS,
  getFocusDifficultySequenceForDifficulty,
  getFocusRoundTimeLimitForDifficulty,
} from '@/lib/config/focus.config'
import { buildFocusRound, type FocusRoundView } from '@/lib/game/focus-grid'
import { GAME_DIFFICULTIES, type GameDifficulty } from '@/lib/game/difficulty'
import { selectNoTargetRoundIndices } from '@/lib/game/focus-rounds'
import { buildFocusTargetSymbol, type FocusShape } from '@/lib/game/focus-symbol'
import type { FocusRawSummary, FocusRoundTrial } from '@/lib/game/types'
import { calculateFocusScore, summarizeFocusRounds } from '@/lib/scoring/focus'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'playing' | 'feedback'
type Round = 'tutorial-target' | 'real'
type RoundOutcome = { kind: 'cell'; cellId: string } | { kind: 'none' } | { kind: 'timeout' }

interface FocusGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    rounds: FocusRoundTrial[]
    rawSummary: FocusRawSummary
    gameScore: number
  }) => void
  onBack: () => void
}

interface LastOutcome {
  selectedCellId: string | null
  selectedCorrectly: boolean
  timedOut: boolean
}

const EMPTY_ROUND_VIEW: FocusRoundView = {
  gridSize: FOCUS_TUTORIAL_GRID_SIZE,
  targetPresent: true,
  occupiedCells: [],
  targetCellId: null,
  symbols: {},
}

/**
 * Feedback copy branches strictly on targetPresent first, so a no-target
 * round never implies (or reveals) a target that was never there.
 */
export function computeFocusFeedbackMessage(
  targetPresent: boolean,
  selectedCorrectly: boolean,
  timedOut: boolean,
): string {
  if (targetPresent) {
    if (selectedCorrectly) return '찾았어요!'
    if (timedOut) return '시간 초과! 여기 있었어요.'
    return '아쉬워요, 여기 있었어요!'
  }
  if (selectedCorrectly) return '맞아요, 이번엔 없었어요!'
  if (timedOut) return '시간 초과! 이번엔 Target이 없었어요.'
  return '이번엔 Target이 없었어요.'
}

/**
 * Real, interactive Focus ("Target Hunt") game — GAME_SPEC §45-54. A single
 * fixed target symbol is defined once for the whole session (no Rule
 * Switching — that's Judgment's job); each round shows a static grid with
 * distractors (and, most rounds, the target) and the user makes exactly one
 * decisive action: click the target cell, or press "없음". Tutorial uses a
 * small, easy grid (FOCUS_TUTORIAL_GRID_SIZE); Real rounds use a much larger
 * one (FOCUS_REAL_GRID_SIZE) so the target isn't visible at a glance. A soft
 * time limit on real rounds keeps searching from being unboundedly easy.
 * Tutorial (1, discarded, target-present only — the "없음" case is explained
 * via the transition message instead of a second practice round) then
 * FOCUS_REAL_ROUNDS fixed-difficulty rounds.
 *
 * Click / "없음" / Timeout all resolve through the single `resolveRound`
 * below, which reads the round's context from refs (not from React state
 * closures) — refs are always current the instant a new round begins,
 * whereas a value captured by a `setTimeout` callback's closure can
 * otherwise reflect the round that was active when that timeout was
 * scheduled rather than whichever round the timer actually belongs to by
 * the time it fires. `hasResolvedRef` additionally guarantees a round is
 * resolved exactly once even if a timeout and a click land back-to-back.
 */
export function FocusGame({ index, mode, difficulty, onComplete, onBack }: FocusGameProps) {
  const stat = STATS.focus
  const { play } = useSound()

  const roundTimeLimitMs = useMemo(() => getFocusRoundTimeLimitForDifficulty(difficulty), [difficulty])
  const focusSequence = useMemo(() => getFocusDifficultySequenceForDifficulty(difficulty), [difficulty])
  // Picked once per session (never per-round) — Focus measures sustained attention to ONE constant target, so the shape itself must not change mid-session even though which shape it is now depends on the tier.
  const [sessionTargetShape] = useState<FocusShape>(() => {
    const pool = FOCUS_TARGET_SHAPE_POOL_BY_DIFFICULTY[difficulty]
    return pool[Math.floor(Math.random() * pool.length)]
  })
  const sessionTargetSymbol = useMemo(() => buildFocusTargetSymbol(sessionTargetShape), [sessionTargetShape])

  const [stage, setStage] = useState<Stage>('intro')
  const [round, setRound] = useState<Round>('tutorial-target')
  const [realRoundIndex, setRealRoundIndex] = useState(0)
  const [roundView, setRoundView] = useState<FocusRoundView>(EMPTY_ROUND_VIEW)
  const [message, setMessage] = useState('')
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [roundStartedAt, setRoundStartedAt] = useState(0)
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null)

  // Source of truth for anything resolveRound needs — always current,
  // updated synchronously in beginRound, never subject to closure staleness.
  const roundRef = useRef<Round>('tutorial-target')
  const realRoundIndexRef = useRef(0)
  const roundViewRef = useRef<FocusRoundView>(EMPTY_ROUND_VIEW)
  const timeLimitMsRef = useRef<number | null>(null)
  const roundStartedAtRef = useRef(0)
  const noTargetRoundIndicesRef = useRef<Set<number>>(new Set())
  const roundsRef = useRef<FocusRoundTrial[]>([])
  const hasResolvedRef = useRef(true) // true until a round is actually begun

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

  // Countdown gauge tick — real rounds only; Tutorial has no time limit.
  useEffect(() => {
    if (stage !== 'playing' || timeLimitMs == null) return
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, timeLimitMs - (performance.now() - roundStartedAt)))
    }, 100)
    return () => window.clearInterval(interval)
  }, [stage, timeLimitMs, roundStartedAt])

  const beginRound = (nextRound: Round, nextRealIndex: number) => {
    clearScheduled()
    hasResolvedRef.current = false

    const isReal = nextRound === 'real'
    const difficultyNow = isReal ? focusSequence[nextRealIndex] : FOCUS_TUTORIAL_DIFFICULTY
    const gridSizeNow = isReal ? FOCUS_REAL_GRID_SIZE : FOCUS_TUTORIAL_GRID_SIZE
    const targetPresentNow =
      nextRound === 'tutorial-target' ? true : !noTargetRoundIndicesRef.current.has(nextRealIndex)
    const distractorCountNow = difficultyNow.totalPlacementCount - (targetPresentNow ? 1 : 0)

    // Layout + symbols are built and validated together as one atomic value —
    // they can never end up describing two different rounds.
    const viewNow = buildFocusRound(gridSizeNow, distractorCountNow, targetPresentNow, difficultyNow.similarityLevel, sessionTargetSymbol)

    const limit = isReal ? roundTimeLimitMs[nextRealIndex] : null
    const startedAt = performance.now()

    roundRef.current = nextRound
    realRoundIndexRef.current = nextRealIndex
    roundViewRef.current = viewNow
    timeLimitMsRef.current = limit
    roundStartedAtRef.current = startedAt

    setRound(nextRound)
    setRealRoundIndex(nextRealIndex)
    setRoundView(viewNow)
    setLastOutcome(null)
    setMessage('찾는 모양을 클릭하거나, 안 보이면 "없음"을 눌러주세요.')
    setStage('playing')
    setTimeLimitMs(limit)
    setRemainingMs(limit ?? 0)
    setRoundStartedAt(startedAt)

    if (limit != null) {
      schedule(() => resolveRound({ kind: 'timeout' }), limit)
    }
  }

  const resolveRound = (outcome: RoundOutcome) => {
    // Guards against a Timer callback and a user click landing at the same
    // moment — whichever gets here first wins, the other is a no-op.
    if (hasResolvedRef.current) return
    hasResolvedRef.current = true
    clearScheduled()

    const view = roundViewRef.current
    const targetPresent = view.targetPresent
    const timedOut = outcome.kind === 'timeout'
    const selectedCellId = outcome.kind === 'cell' ? outcome.cellId : null
    const selectedNone = outcome.kind === 'none'
    const responseTimeMs = timedOut
      ? (timeLimitMsRef.current ?? 0)
      : Math.round(performance.now() - roundStartedAtRef.current)

    let selectedCorrectly = false
    let falseClick = false
    let missedTarget = false

    if (targetPresent) {
      if (!timedOut && selectedCellId === view.targetCellId) {
        selectedCorrectly = true
      } else if (!timedOut && selectedCellId != null) {
        falseClick = true
      } else {
        missedTarget = true // said "없음", or timed out with no action
      }
    } else if (!timedOut && selectedNone) {
      selectedCorrectly = true
    } else if (!timedOut && selectedCellId != null) {
      falseClick = true
    }
    // else: timed out with no target present — selectedCorrectly stays false,
    // but this is neither a falseClick nor a missedTarget (there was nothing
    // to click and nothing to miss — it's its own "no action taken" case).

    setStage('feedback')
    setLastOutcome({ selectedCellId, selectedCorrectly, timedOut })
    setMessage(computeFocusFeedbackMessage(targetPresent, selectedCorrectly, timedOut))

    const currentRound = roundRef.current

    if (currentRound === 'tutorial-target') {
      schedule(() => {
        setMessage('찾는 모양이 안 보이면 "없음"을 눌러주세요. 이제 실전을 시작할게요.')
        schedule(() => beginRound('real', 0), FOCUS_TUTORIAL_TRANSITION_MS)
      }, FOCUS_ROUND_FEEDBACK_MS)
      return
    }

    const realRoundIndexNow = realRoundIndexRef.current
    const difficultyNow = focusSequence[realRoundIndexNow]
    const trial: FocusRoundTrial = {
      roundIndex: realRoundIndexNow,
      difficultyLevel: difficultyNow.level,
      distractorCount: difficultyNow.totalPlacementCount - (targetPresent ? 1 : 0),
      similarityLevel: difficultyNow.similarityLevel,
      targetPresent,
      targetCellId: view.targetCellId,
      selectedCellId,
      selectedNone,
      selectedCorrectly,
      falseClick,
      missedTarget,
      timedOut,
      responseTimeMs,
      createdAt: new Date().toISOString(),
    }
    const updated = [...roundsRef.current, trial]
    roundsRef.current = updated

    if (updated.length >= FOCUS_REAL_ROUNDS) {
      const rawSummary = summarizeFocusRounds(updated)
      const gameScore = calculateFocusScore(rawSummary)
      schedule(() => {
        onComplete({ rounds: updated, rawSummary, gameScore })
      }, FOCUS_ROUND_FEEDBACK_MS)
      return
    }

    schedule(() => {
      beginRound('real', realRoundIndexNow + 1)
    }, FOCUS_ROUND_FEEDBACK_MS)
  }

  const startGame = () => {
    play('game-start')
    const picked = selectNoTargetRoundIndices(FOCUS_REAL_ROUNDS, FOCUS_NO_TARGET_ROUND_COUNT)
    noTargetRoundIndicesRef.current = picked
    roundsRef.current = []
    beginRound('tutorial-target', 0)
  }

  const handleCellClick = (cellId: string) => {
    if (stage !== 'playing' || !roundView.occupiedCells.includes(cellId)) return
    resolveRound({ kind: 'cell', cellId })
  }

  const handleNoneClick = () => {
    if (stage !== 'playing') return
    resolveRound({ kind: 'none' })
  }

  const cellVisual = (cellId: string): 'idle' | 'occupied' | 'correct' | 'wrong' | 'reveal' => {
    const isOccupied = roundView.occupiedCells.includes(cellId)
    if (stage === 'feedback' && lastOutcome) {
      if (lastOutcome.selectedCellId === cellId && lastOutcome.selectedCorrectly) return 'correct'
      if (lastOutcome.selectedCellId === cellId && !lastOutcome.selectedCorrectly) return 'wrong'
      // Reveal the real target only when one actually existed and the user
      // didn't find it — never fabricate a target position for a no-target round.
      if (roundView.targetPresent && !lastOutcome.selectedCorrectly && cellId === roundView.targetCellId) return 'reveal'
    }
    return isOccupied ? 'occupied' : 'idle'
  }

  const gaugePercent = timeLimitMs == null ? 100 : Math.max(0, Math.min(100, (remainingMs / timeLimitMs) * 100))
  const gaugeCritical = timeLimitMs != null && gaugePercent < 25
  // Slightly smaller footprint on Real rounds than before (was 360px) —
  // compacts the cell/icon ratio without shrinking the search area's
  // difficulty. Icon size inside each cell is intentionally left unchanged.
  // Mobile caps are smaller than the sm: (desktop) values so the grid +
  // "없음" button always fit inside a short mobile viewport without
  // scrolling — see the mobile-viewport audit that motivated this file.
  const gridMaxWidthClass = round === 'real' ? 'max-w-45 sm:max-w-[320px]' : 'max-w-45 sm:max-w-[240px]'

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
            튜토리얼 <span className="text-primary">1</span> / {FOCUS_TUTORIAL_ROUNDS}
          </span>
        ) : (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            실전 <span className="text-primary">{realRoundIndex + 1}</span> / {FOCUS_REAL_ROUNDS}
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
            style={{ backgroundColor: `var(${stat.colorVar})` } as CSSProperties}
          >
            <FocusSymbolView {...sessionTargetSymbol} color="var(--card)" size={44} />
          </span>
          <div className="max-w-sm">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              정해진 모양만 찾아 눌러보세요. 다른 모양은 누르면 안 돼요.
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
              탭해서 시작하기
            </p>
          </div>
        </button>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-card px-6 py-2 toy-border toy-shadow-lg sm:mt-5 sm:gap-3 sm:py-6">
          {/* Target Preview — always visible, never changes round to round. */}
          <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 toy-border">
            <span className="text-xs font-bold text-secondary-foreground">이 모양을 찾아주세요</span>
            <FocusSymbolView {...sessionTargetSymbol} color={`var(${stat.colorVar})`} size={24} />
          </div>

          {/* Fixed-height message + Tutorial caption slot. */}
          <div className="flex min-h-8 flex-col items-center justify-center gap-1 text-center sm:min-h-14">
            <p
              className={cn(
                'text-pretty font-display text-base font-bold leading-snug',
                stage === 'feedback' ? 'text-primary' : 'text-foreground',
              )}
            >
              {message}
            </p>
            <p
              className={cn(
                'text-[11px] font-semibold text-muted-foreground',
                round === 'real' && 'invisible',
              )}
            >
              이 기록은 결과에 포함되지 않아요.
            </p>
          </div>

          <GameRuleReminder text={'정해진 모양만 찾아 눌러보세요 · 안 보이면 "없음"을 눌러주세요.'} />

          {/* Fixed-height time gauge slot — static full bar during Tutorial. */}
          <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', gridMaxWidthClass)}>
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-100',
                gaugeCritical ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${gaugePercent}%` }}
            />
          </div>

          {/* Grid footprint (max-width) and gap scale with round type; the
              grid's own position/size never changes round-to-round within
              Tutorial or within Real — only Tutorial→Real changes it once. */}
          <div
            className={cn('mx-auto grid aspect-square w-full gap-1.5', gridMaxWidthClass)}
            style={{ gridTemplateColumns: `repeat(${roundView.gridSize}, minmax(0,1fr))` }}
          >
            {Array.from({ length: roundView.gridSize * roundView.gridSize }, (_, i) => String(i)).map((cellId) => {
              const visual = cellVisual(cellId)
              const symbol = roundView.symbols[cellId]
              return (
                <button
                  key={cellId}
                  type="button"
                  onClick={() => handleCellClick(cellId)}
                  disabled={stage !== 'playing' || visual === 'idle'}
                  aria-label={`칸 ${cellId}`}
                  className={cn(
                    'grid aspect-square place-items-center rounded-lg toy-border transition-colors duration-100',
                    visual === 'idle' && 'bg-background opacity-40',
                    visual === 'occupied' && 'bg-card',
                    visual === 'correct' && 'bg-[var(--chart-4)]',
                    visual === 'wrong' && 'bg-destructive/70',
                    visual === 'reveal' && 'animate-pop-in bg-accent toy-shadow-sm ring-2 ring-accent',
                  )}
                >
                  {symbol && (
                    <FocusSymbolView
                      {...symbol}
                      color={`var(${stat.colorVar})`}
                      size={round === 'real' ? 16 : 24}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleNoneClick}
            disabled={stage !== 'playing'}
            className={cn(
              'w-full rounded-2xl px-4 py-3 font-display text-sm font-extrabold toy-border transition-transform duration-150',
              gridMaxWidthClass,
              stage === 'playing'
                ? 'bg-secondary text-secondary-foreground hover:-translate-y-0.5'
                : 'cursor-not-allowed bg-muted text-muted-foreground opacity-60',
            )}
          >
            없음 (안 보여요)
          </button>
        </div>
      )}
    </div>
  )
}
