'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { GameRuleReminder } from '@/components/brain-bet/games/shared/game-rule-reminder'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import { SkipTutorialButton } from '@/components/brain-bet/games/shared/skip-tutorial-button'
import { STATS } from '@/lib/brain-bet'
import {
  MEMORY_CLICK_FEEDBACK_MS,
  MEMORY_PENALTY_FLASH_MS,
  MEMORY_PRACTICE_ROUNDS,
  MEMORY_PRE_FLASH_DELAY_MS,
  MEMORY_REAL_ROUNDS,
  MEMORY_ROUND_FEEDBACK_MS,
  MEMORY_TUTORIAL_DIFFICULTY,
  MEMORY_TUTORIAL_TRANSITION_MS,
  getMemoryDifficultySequenceForDifficulty,
  type MemoryDifficultyLevel,
} from '@/lib/config/memory.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { detectDevice } from '@/lib/game/device'
import { pickRandomTargetCells } from '@/lib/game/memory-grid'
import type { MemoryRawSummary, MemoryRoundTrial } from '@/lib/game/types'
import { calculateMemoryScore, summarizeMemoryRounds } from '@/lib/scoring/memory'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'showing' | 'selecting' | 'feedback'
type Round = 'practice' | 'real'
type CellState = 'idle' | 'flash' | 'click-correct' | 'click-wrong' | 'selected' | 'correct' | 'wrong' | 'missed'

interface MemoryGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    rounds: MemoryRoundTrial[]
    rawSummary: MemoryRawSummary
    gameScore: number
  }) => void
  onBack: () => void
}

const INSTRUCTION_TEXT = '분홍색으로 깜빡이는 타일의 위치를 기억해보세요.'

/**
 * Real, interactive Memory ("Memory Tiles") game — GAME_SPEC §34-44.
 * Targets flash briefly and disappear (no lingering afterimage); each click
 * is judged immediately (correct/wrong count up live) and stays marked as
 * "selected" until the round ends; the round ends the instant the user has
 * clicked exactly `targetCount` tiles — no confirm step. Tutorial (1,
 * discarded) then MEMORY_REAL_ROUNDS fixed-difficulty rounds; wrong/incomplete
 * rounds never end the session early (no Life system).
 */
export function MemoryGame({ index, mode, difficulty: gameDifficulty, onComplete, onBack }: MemoryGameProps) {
  const stat = STATS.memory
  const { play } = useSound()

  const difficultySequence = useMemo(
    () => getMemoryDifficultySequenceForDifficulty(gameDifficulty),
    [gameDifficulty],
  )

  const [stage, setStage] = useState<Stage>('intro')
  const [round, setRound] = useState<Round>('practice')
  const [realRoundIndex, setRealRoundIndex] = useState(0)
  const [difficulty, setDifficulty] = useState<MemoryDifficultyLevel>(MEMORY_TUTORIAL_DIFFICULTY)
  const [flashActive, setFlashActive] = useState(false)
  const [targetCells, setTargetCells] = useState<string[]>([])
  const [selectedCells, setSelectedCells] = useState<string[]>([])
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [clickFeedback, setClickFeedback] = useState<{ cellId: string; isCorrect: boolean } | null>(null)
  const [penaltyFlashKey, setPenaltyFlashKey] = useState<number | null>(null)
  const [rounds, setRounds] = useState<MemoryRoundTrial[]>([])
  const [message, setMessage] = useState(INSTRUCTION_TEXT)
  const [selectStartedAt, setSelectStartedAt] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

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

  // Live selection timer — counts up, never a countdown/limit.
  useEffect(() => {
    if (stage !== 'selecting') return
    const interval = window.setInterval(() => {
      setElapsedMs(performance.now() - selectStartedAt)
    }, 100)
    return () => window.clearInterval(interval)
  }, [stage, selectStartedAt])

  const beginRound = (nextRound: Round, nextRealRoundIndex: number) => {
    clearScheduled()
    const d =
      nextRound === 'practice' ? MEMORY_TUTORIAL_DIFFICULTY : difficultySequence[nextRealRoundIndex]
    setDifficulty(d)
    setTargetCells(pickRandomTargetCells(d.gridSize, d.targetCount))
    setSelectedCells([])
    setCorrectCount(0)
    setWrongCount(0)
    setClickFeedback(null)
    setPenaltyFlashKey(null)
    setElapsedMs(0)
    setFlashActive(false)
    setStage('showing')
    setMessage(INSTRUCTION_TEXT)

    // Grid shown first, brief pause, then a short strong flash that disappears immediately.
    schedule(() => {
      setFlashActive(true)
      schedule(() => {
        setFlashActive(false)
        setSelectStartedAt(performance.now())
        setStage('selecting')
        setMessage('기억나는 타일을 선택하세요.')
      }, d.exposureMs)
    }, MEMORY_PRE_FLASH_DELAY_MS)
  }

  const startGame = () => {
    play('game-start')
    setRound('practice')
    setRounds([])
    setRealRoundIndex(0)
    beginRound('practice', 0)
  }

  /** Normal/Hard/Extreme only (see SkipTutorialButton) — abandons the in-progress practice round and starts real round 0 directly. */
  const skipTutorial = () => {
    clearScheduled()
    setRound('real')
    beginRound('real', 0)
  }

  const finishRound = (
    finalSelected: string[],
    finalCorrect: number,
    finalWrong: number,
    responseTimeMs: number,
  ) => {
    const missedTargets = difficulty.targetCount - finalCorrect

    setStage('feedback')

    if (round === 'practice') {
      // Tutorial result is discarded entirely — never scored (GAME_SPEC §19).
      setMessage('튜토리얼 완료! 이제 실전을 시작할게요.')
      schedule(() => {
        setRound('real')
        beginRound('real', 0)
      }, MEMORY_TUTORIAL_TRANSITION_MS)
      return
    }

    setMessage(
      finalCorrect === difficulty.targetCount
        ? 'PERFECT!'
        : `${finalCorrect} / ${difficulty.targetCount} 기억했어요`,
    )

    const trial: MemoryRoundTrial = {
      roundIndex: realRoundIndex,
      difficultyLevel: difficulty.level,
      gridSize: difficulty.gridSize,
      targetCount: difficulty.targetCount,
      exposureMs: difficulty.exposureMs,
      targetCells,
      selectedCells: finalSelected,
      correctSelections: finalCorrect,
      wrongSelections: finalWrong,
      missedTargets,
      responseTimeMs,
      createdAt: new Date().toISOString(),
    }
    const updatedRounds = [...rounds, trial]
    setRounds(updatedRounds)

    if (updatedRounds.length >= MEMORY_REAL_ROUNDS) {
      const rawSummary = summarizeMemoryRounds(updatedRounds)
      const gameScore = calculateMemoryScore(rawSummary, detectDevice().inputType)
      schedule(() => {
        onComplete({ rounds: updatedRounds, rawSummary, gameScore })
      }, MEMORY_ROUND_FEEDBACK_MS)
      return
    }

    schedule(() => {
      const nextIndex = realRoundIndex + 1
      setRealRoundIndex(nextIndex)
      beginRound('real', nextIndex)
    }, MEMORY_ROUND_FEEDBACK_MS)
  }

  const handleCellClick = (cellId: string) => {
    if (stage !== 'selecting' || selectedCells.includes(cellId)) return

    const isCorrect = targetCells.includes(cellId)
    play(isCorrect ? 'answer-correct' : 'wrong')
    const newSelected = [...selectedCells, cellId]
    const newCorrect = correctCount + (isCorrect ? 1 : 0)
    const newWrong = wrongCount + (isCorrect ? 0 : 1)
    const responseTimeMsNow = Math.round(performance.now() - selectStartedAt)

    setSelectedCells(newSelected)
    setCorrectCount(newCorrect)
    setWrongCount(newWrong)

    // Brief correct/wrong flash on the clicked tile only, then it settles
    // into the same neutral "selected" look regardless of correctness — so
    // later clicks get no hint of target positions from earlier ones.
    setClickFeedback({ cellId, isCorrect })
    schedule(() => {
      setClickFeedback((cur) => (cur?.cellId === cellId ? null : cur))
    }, MEMORY_CLICK_FEEDBACK_MS)

    if (!isCorrect) {
      setPenaltyFlashKey(Date.now())
      schedule(() => setPenaltyFlashKey(null), MEMORY_PENALTY_FLASH_MS)
    }

    if (newSelected.length >= difficulty.targetCount) {
      finishRound(newSelected, newCorrect, newWrong, responseTimeMsNow)
    }
  }

  const cellState = (cellId: string): CellState => {
    if (stage === 'showing') {
      return flashActive && targetCells.includes(cellId) ? 'flash' : 'idle'
    }
    if (stage === 'selecting') {
      if (clickFeedback?.cellId === cellId) return clickFeedback.isCorrect ? 'click-correct' : 'click-wrong'
      return selectedCells.includes(cellId) ? 'selected' : 'idle'
    }
    if (stage === 'feedback' && round === 'real') {
      const isTarget = targetCells.includes(cellId)
      const isSelected = selectedCells.includes(cellId)
      if (isTarget && isSelected) return 'correct'
      if (isSelected && !isTarget) return 'wrong'
      if (isTarget && !isSelected) return 'missed'
    }
    return 'idle'
  }

  const cellCount = difficulty.gridSize * difficulty.gridSize

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-4 sm:py-6">
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

      {/* Fixed-height row regardless of Tutorial vs Real — no conditional lines here. */}
      <div className="mt-4 flex items-center justify-between gap-4 sm:mt-6">
        <div className="flex items-center gap-3">
          <StatBadge stat={stat} size="md" />
          <h1 className="font-display text-2xl font-extrabold leading-none text-foreground">{stat.name}</h1>
        </div>
        {round === 'practice' ? (
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
              튜토리얼 <span className="text-primary">1</span> / {MEMORY_PRACTICE_ROUNDS}
            </span>
            {gameDifficulty !== 'easy' && stage !== 'intro' && <SkipTutorialButton onSkip={skipTutorial} />}
          </div>
        ) : (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            실전 <span className="text-primary">{realRoundIndex + 1}</span> / {MEMORY_REAL_ROUNDS}
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
            className="grid h-24 w-24 place-items-center rounded-3xl toy-border toy-shadow text-[color:var(--ink)]"
            style={{ backgroundColor: `var(${stat.colorVar})` } as CSSProperties}
          >
            <stat.icon size={48} strokeWidth={2.2} />
          </span>
          <div className="max-w-sm">
            <p className="font-display text-lg font-bold leading-snug text-foreground">{INSTRUCTION_TEXT}</p>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[gameDifficulty].hint}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
              탭해서 시작하기
            </p>
          </div>
        </button>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-card px-6 py-4 toy-border toy-shadow-lg sm:mt-5 sm:gap-4 sm:py-8">
          {/* Fixed-height message slot — reserves space for the caption even
              when hidden, so Tutorial/Real never differ in height. */}
          <div className="flex min-h-10 flex-col items-center justify-center gap-1 text-center sm:min-h-20">
            <p
              className={cn(
                'text-pretty font-display text-lg font-bold leading-snug',
                stage === 'feedback' ? 'text-primary' : 'text-foreground',
              )}
            >
              {message}
            </p>
            <p
              className={cn(
                'text-[11px] font-semibold text-muted-foreground',
                round !== 'practice' && 'invisible',
              )}
            >
              이 기록은 결과에 포함되지 않아요.
            </p>
          </div>

          <GameRuleReminder text={INSTRUCTION_TEXT} />

          {/* Fixed footprint (max-width + aspect-square) regardless of gridSize,
              so the grid's center never shifts between 3x3 and 6x6 rounds. */}
          <div
            className={cn(
              'mx-auto grid aspect-square w-full max-w-[320px] gap-1.5',
              // Every tile is `disabled` for this brief pre-flash window (see
              // handleCellClick's stage guard below) — without some motion
              // here, a completely static, unresponsive grid reads as "stuck
              // loading" rather than "about to flash". Purely cosmetic, so it's
              // safe to skip under prefers-reduced-motion.
              stage === 'showing' && !flashActive && 'motion-safe:animate-pulse',
            )}
            style={{ gridTemplateColumns: `repeat(${difficulty.gridSize}, minmax(0,1fr))` }}
          >
            {Array.from({ length: cellCount }, (_, i) => String(i)).map((cellId) => {
              const state = cellState(cellId)
              return (
                <button
                  key={cellId}
                  type="button"
                  onClick={() => handleCellClick(cellId)}
                  disabled={stage !== 'selecting' || selectedCells.includes(cellId)}
                  aria-label={`타일 ${cellId}`}
                  className={cn(
                    'aspect-square rounded-lg toy-border text-[color:var(--ink)] transition-all duration-100',
                    state === 'idle' && 'bg-background',
                    state === 'selected' && 'translate-y-0.5 bg-secondary shadow-inner',
                    state === 'click-wrong' && 'bg-destructive',
                    state === 'wrong' && 'bg-destructive/70',
                    state === 'missed' && 'border-dashed bg-background opacity-70',
                  )}
                  style={
                    state === 'flash' || state === 'correct'
                      ? ({ backgroundColor: `var(${stat.colorVar})` } as CSSProperties)
                      : state === 'click-correct'
                        ? ({ backgroundColor: 'var(--chart-4)' } as CSSProperties)
                        : undefined
                  }
                />
              )
            })}
          </div>

          {/* Fixed-height footer slot — always reserved so its presence/absence never shifts the grid above. */}
          <div className="relative flex h-6 items-center justify-center gap-3 text-xs font-semibold text-muted-foreground">
            {stage === 'selecting' && (
              <>
                <span>⏱ {(elapsedMs / 1000).toFixed(1)}s</span>
                <span>
                  정답 {correctCount} · 오답 {wrongCount}
                </span>
              </>
            )}
            {penaltyFlashKey != null && (
              <span
                key={penaltyFlashKey}
                className="animate-pop-in absolute -top-7 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-primary-foreground"
              >
                MISS +0.5s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
