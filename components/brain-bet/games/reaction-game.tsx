'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Hand, Save, Zap } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import { STATS } from '@/lib/brain-bet'
import {
  REACTION_DECOY_FLASH_MS,
  REACTION_DECOY_WINDOW,
  REACTION_DELAY_MS_MAX,
  REACTION_DELAY_MS_MIN,
  REACTION_FALSE_START_PENALTY_MS,
  REACTION_PRACTICE_TRIALS,
  REACTION_TRIAL_FEEDBACK_MS,
  getReactionDecoyChanceForDifficulty,
  getReactionRealTrials,
} from '@/lib/config/reaction.config'
import { calculateReactionScore, summarizeReactionTrials } from '@/lib/scoring/reaction'
import { detectDevice } from '@/lib/game/device'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { ReactionRawSummary, ReactionTrial } from '@/lib/game/types'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'waiting' | 'decoy' | 'target' | 'feedback'
type Round = 'practice' | 'real'

interface ReactionGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    trials: ReactionTrial[]
    rawSummary: ReactionRawSummary
    gameScore: number
  }) => void
  onBack: () => void
}

function randomDelay() {
  return Math.round(
    REACTION_DELAY_MS_MIN + Math.random() * (REACTION_DELAY_MS_MAX - REACTION_DELAY_MS_MIN),
  )
}

type RecordFeedbackKind = 'first' | 'new-best' | 'behind' | 'tie'

/**
 * Per-Trial "did I just beat my own session record" feedback — deliberately
 * separate from the Median-based, all-time Personal Best (StatStatus.current).
 * `sessionFastestReactionMs` here means "fastest single valid Real Trial
 * reaction seen so far THIS session", never persisted, never compared
 * against history — purely a same-session micro-feedback signal.
 */
export interface RecordFeedback {
  kind: RecordFeedbackKind
  reactionMs: number
  /** ms improved (new-best) or ms behind (behind) — 0 and unused for first/tie. */
  deltaMs: number
}

export function buildRecordFeedback(reactionMs: number, sessionFastestReactionMs: number | null): RecordFeedback {
  if (sessionFastestReactionMs === null) return { kind: 'first', reactionMs, deltaMs: 0 }
  if (reactionMs < sessionFastestReactionMs) {
    return { kind: 'new-best', reactionMs, deltaMs: sessionFastestReactionMs - reactionMs }
  }
  if (reactionMs > sessionFastestReactionMs) {
    return { kind: 'behind', reactionMs, deltaMs: reactionMs - sessionFastestReactionMs }
  }
  return { kind: 'tie', reactionMs, deltaMs: 0 }
}

export function recordFeedbackHeadline(feedback: RecordFeedback): string {
  switch (feedback.kind) {
    case 'first':
      return '첫 기록!'
    case 'new-best':
      return '✨최고 기록!✨'
    case 'behind':
      return `최고 기록까지 ${feedback.deltaMs}ms!`
    case 'tie':
      return '최고 기록과 같아요!'
  }
}

export function recordFeedbackSubline(feedback: RecordFeedback): string {
  if (feedback.kind === 'new-best') return `${feedback.deltaMs}ms 더 빨라졌어요`
  return `${feedback.reactionMs}ms`
}

/**
 * Real, interactive Reaction ("Catch the Signal") game — GAME_SPEC §23-33.
 * Tutorial (1, discarded) then REACTION_REAL_TRIALS valid Real Trials; False
 * Starts are excluded from that count and retried, but every attempt
 * (including false starts) is kept for the trial log.
 */
export function ReactionGame({ index, mode, difficulty, onComplete, onBack }: ReactionGameProps) {
  const stat = STATS.reaction
  const { play } = useSound()
  const realTrials = useMemo(() => getReactionRealTrials(mode, difficulty), [mode, difficulty])
  /** Decoy flashes only exist at Hard+ (see REACTION_DECOY_CHANCE_BY_DIFFICULTY) — the intro's false-start-penalty notice mentions decoys only when this tier actually has them. */
  const hasDecoy = getReactionDecoyChanceForDifficulty(difficulty) > 0

  const [stage, setStage] = useState<Stage>('intro')
  const [round, setRound] = useState<Round>('practice')
  const [trials, setTrials] = useState<ReactionTrial[]>([])
  const [message, setMessage] = useState('신호가 나타나면 최대한 빠르게 탭하세요.')
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null)
  /** Fastest valid Real Trial reaction seen so far this session — Tutorial never sets this, and it's never persisted or compared against the all-time Median Personal Best. */
  const [sessionFastestReactionMs, setSessionFastestReactionMs] = useState<number | null>(null)
  const [recordFeedback, setRecordFeedback] = useState<RecordFeedback | null>(null)

  const timeoutRef = useRef<number | null>(null)
  const decoyTimeoutRef = useRef<number | null>(null)
  const targetShownAtRef = useRef(0)
  const pendingDelayRef = useRef(0)
  const nextTrialIndexRef = useRef(0)
  /** Reads the latest `round` inside scheduleAttempt, which — like every other timer-driven callback in this component — is only ever (re)created relative to a stable identity, not on every `round` change. */
  const roundRef = useRef<Round>('practice')
  roundRef.current = round
  /** False starts (including decoy taps) since the current trial slot last started waiting — folded into that slot's eventual recorded reactionMs as REACTION_FALSE_START_PENALTY_MS each, then reset. See lib/config/reaction.config.ts's False Start policy doc comment. */
  const falseStartsThisAttemptRef = useRef(0)

  const clearScheduled = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (decoyTimeoutRef.current != null) {
      window.clearTimeout(decoyTimeoutRef.current)
      decoyTimeoutRef.current = null
    }
  }

  useEffect(() => clearScheduled, [])

  const scheduleAttempt = useCallback(() => {
    clearScheduled()
    setStage('waiting')
    setMessage('신호를 기다리세요...')
    const delayMs = randomDelay()
    pendingDelayRef.current = delayMs

    // Decoy: a brief, visually distinct flash the player must NOT tap —
    // Hard+ only, never during Tutorial. Always resolves (and the decoy
    // timeout clears itself) well before the real target can appear, since
    // REACTION_DECOY_WINDOW caps how late into the delay it can fire.
    const decoyChance = roundRef.current === 'real' ? getReactionDecoyChanceForDifficulty(difficulty) : 0
    if (decoyChance > 0 && Math.random() < decoyChance) {
      const ratio = REACTION_DECOY_WINDOW.minRatio + Math.random() * (REACTION_DECOY_WINDOW.maxRatio - REACTION_DECOY_WINDOW.minRatio)
      const decoyAtMs = Math.round(delayMs * ratio)
      decoyTimeoutRef.current = window.setTimeout(() => {
        setStage('decoy')
        setMessage('가짜 신호예요! 누르지 마세요.')
        decoyTimeoutRef.current = window.setTimeout(() => {
          decoyTimeoutRef.current = null
          setStage('waiting')
          setMessage('신호를 기다리세요...')
        }, REACTION_DECOY_FLASH_MS)
      }, decoyAtMs)
    }

    timeoutRef.current = window.setTimeout(() => {
      targetShownAtRef.current = performance.now()
      setStage('target')
      setMessage('지금 탭하세요!')
    }, delayMs)
  }, [difficulty])

  const startGame = () => {
    play('game-start')
    setRound('practice')
    setTrials([])
    setSessionFastestReactionMs(null)
    setRecordFeedback(null)
    nextTrialIndexRef.current = 0
    falseStartsThisAttemptRef.current = 0
    scheduleAttempt()
  }

  const handleTap = () => {
    if (stage === 'intro' || stage === 'feedback') return

    if (stage === 'waiting' || stage === 'decoy') {
      // False start (early tap) or a decoy tap — both are "jumped the gun"
      // and treated identically: the attempt isn't discarded, it just
      // retries the same trial slot, and REACTION_FALSE_START_PENALTY_MS
      // per occurrence gets folded into that slot's eventual recorded
      // reactionMs once it finally succeeds (see the 'target' branch below).
      const wasDecoy = stage === 'decoy'
      clearScheduled()
      const trial: ReactionTrial = {
        trialIndex: nextTrialIndexRef.current,
        delayMs: pendingDelayRef.current,
        reactionMs: null,
        isFalseStart: true,
        createdAt: new Date().toISOString(),
      }
      if (round === 'real') {
        nextTrialIndexRef.current += 1
        falseStartsThisAttemptRef.current += 1
        setTrials((t) => [...t, trial])
      }
      setLastReactionMs(null)
      // False Start is never a valid reaction — it never participates in the Session-Best comparison.
      setRecordFeedback(null)
      setMessage(wasDecoy ? '가짜 신호였어요! 조심하세요.' : '앗, 너무 빨랐어요! 신호가 나타난 뒤 눌러주세요.')
      setStage('feedback')
      window.setTimeout(scheduleAttempt, 900)
      return
    }

    if (stage === 'target') {
      const penaltyMs = falseStartsThisAttemptRef.current * REACTION_FALSE_START_PENALTY_MS
      falseStartsThisAttemptRef.current = 0
      const reactionMs = Math.round(performance.now() - targetShownAtRef.current) + penaltyMs
      setLastReactionMs(reactionMs)

      if (round === 'practice') {
        // Tutorial result is discarded entirely — never scored (GAME_SPEC §19)
        // and never allowed to seed the Real session's Session-Best.
        setRecordFeedback(null)
        setMessage('튜토리얼 완료! 실전 시작!')
        setStage('feedback')
        window.setTimeout(() => {
          setRound('real')
          scheduleAttempt()
        }, 1100)
        return
      }

      // Session-Best micro-feedback: compares against "fastest single valid
      // Real Trial reaction so far this session" only — a separate concept
      // from the Median-based, all-time Personal Best (see StatStatus,
      // untouched by this feature).
      const feedback = buildRecordFeedback(reactionMs, sessionFastestReactionMs)
      setRecordFeedback(feedback)
      if (feedback.kind === 'first' || feedback.kind === 'new-best') {
        setSessionFastestReactionMs(reactionMs)
      }

      const trial: ReactionTrial = {
        trialIndex: nextTrialIndexRef.current,
        delayMs: pendingDelayRef.current,
        reactionMs,
        isFalseStart: false,
        createdAt: new Date().toISOString(),
      }
      nextTrialIndexRef.current += 1
      const updatedTrials = [...trials, trial]
      setTrials(updatedTrials)

      const validCount = updatedTrials.filter((t) => !t.isFalseStart).length
      if (validCount >= realTrials) {
        const rawSummary = summarizeReactionTrials(updatedTrials)
        const gameScore = calculateReactionScore(rawSummary, detectDevice().inputType)
        setStage('feedback')
        setMessage('측정이 끝났어요!')
        // Deferred, not called synchronously inside this tap handler — every
        // other mini-game already defers its own final onComplete this same
        // way (see e.g. scheduleAttempt below). Calling it synchronously here
        // mounted the next screen (CompleteScreen, with its own freshly-`src`'d
        // radar-center egg image) inside the tap event's own call stack, which
        // on mobile Safari/Chrome could leave that first paint unpainted until
        // the next interaction — only ever visible on this very first First
        // Play result screen, since reaction is always game 1.
        window.setTimeout(
          () => onComplete({ trials: updatedTrials, rawSummary, gameScore }),
          REACTION_TRIAL_FEEDBACK_MS,
        )
        return
      }

      // The ms figure is already shown by the Session-Best feedback above the
      // icon — repeating it here would be redundant.
      setMessage('다음 신호를 기다리세요.')
      setStage('feedback')
      window.setTimeout(scheduleAttempt, REACTION_TRIAL_FEEDBACK_MS)
    }
  }

  const validRealCount = trials.filter((t) => !t.isFalseStart).length
  const falseStartCount = trials.filter((t) => t.isFalseStart).length

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
          {mode === 'first' ? <ProgressTrack current={index} /> : <FreePlayBadge onBack={onBack} />}
        </div>
      </header>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatBadge stat={stat} size="md" />
          <div>
            <p className="-translate-y-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {round === 'practice' ? 'TUTORIAL' : '실전 측정 중'}
            </p>
            <h1 className="font-display text-2xl font-extrabold leading-none text-foreground">
              {stat.name}
            </h1>
            {round === 'practice' && (
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                이 기록은 결과에 포함되지 않아요.
              </p>
            )}
            <p className="text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>
          </div>
        </div>
        {round === 'practice' ? (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            튜토리얼{' '}
            <span className="text-primary">1</span> / {REACTION_PRACTICE_TRIALS}
          </span>
        ) : (
          <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
            실전{' '}
            <span className="text-primary">
              {Math.min(validRealCount + 1, realTrials)}
            </span>{' '}
            / {realTrials}
          </span>
        )}
      </div>

      {/* interactive game area */}
      <button
        type="button"
        data-sfx-skip
        onClick={stage === 'intro' ? startGame : handleTap}
        className={cn(
          'mt-5 flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl px-6 py-12 text-center toy-border toy-shadow-lg transition-colors duration-150',
          stage === 'target' ? 'bg-primary' : stage === 'decoy' ? 'bg-destructive/20' : 'bg-card',
        )}
      >
        {/* relative anchor for the floating Session-Best feedback — absolutely
            positioned above the icon, so it never shifts the icon's own
            layout position and never needs reserved flow height. */}
        <div className="relative">
          <span
            className={cn(
              'grid h-24 w-24 place-items-center rounded-3xl toy-border toy-shadow text-[color:var(--ink)]',
              stage === 'target' ? 'bg-accent' : stage === 'decoy' ? 'bg-destructive/40' : 'bg-secondary',
            )}
          >
            {stage === 'target' ? (
              <Zap size={48} strokeWidth={2.2} />
            ) : stage === 'decoy' ? (
              <AlertTriangle size={48} strokeWidth={2.2} />
            ) : (
              <Hand size={48} strokeWidth={2.2} />
            )}
          </span>

          {stage === 'feedback' && recordFeedback && (
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-3 flex justify-center">
              <div className="animate-record-pop flex flex-col items-center gap-0.5 whitespace-nowrap">
                <p
                  className={cn(
                    'font-display text-lg font-extrabold leading-tight',
                    recordFeedback.kind === 'new-best' ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {recordFeedbackHeadline(recordFeedback)}
                </p>
                <p className="font-display text-base font-bold leading-tight text-foreground">
                  {recordFeedbackSubline(recordFeedback)}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="max-w-sm">
          {stage === 'intro' ? (
            <>
              <p className="font-display text-lg font-bold leading-snug text-foreground">
                {stat.howTo}
              </p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {hasDecoy
                  ? `신호 전에 누르거나 가짜 신호를 누르면 반응시간에 +${REACTION_FALSE_START_PENALTY_MS}ms가 추가돼요.`
                  : `신호 전에 누르면 반응시간에 +${REACTION_FALSE_START_PENALTY_MS}ms가 추가돼요.`}
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
                탭해서 시작하기
              </p>
            </>
          ) : (
            <p
              className={cn(
                'text-pretty font-display text-lg font-bold leading-snug',
                stage === 'target' ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {message}
            </p>
          )}
        </div>
      </button>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-2.5 rounded-2xl bg-card px-4 py-3 toy-border">
          <p className="text-xs font-semibold text-muted-foreground">방금 기록</p>
          <p className="font-display text-lg font-extrabold leading-none text-foreground">
            {lastReactionMs != null ? `${lastReactionMs}ms` : '--'}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2.5 rounded-2xl bg-card px-4 py-3 toy-border">
          <p className="text-xs font-semibold text-muted-foreground">False Start</p>
          <p className="font-display text-lg font-extrabold leading-none text-foreground">
            {falseStartCount}
          </p>
        </div>
      </div>
    </div>
  )
}
