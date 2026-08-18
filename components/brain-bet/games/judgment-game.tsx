'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { JudgmentSymbolView } from '@/components/brain-bet/games/judgment-symbol'
import { GameRuleReminder } from '@/components/brain-bet/games/shared/game-rule-reminder'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import { SkipTutorialButton } from '@/components/brain-bet/games/shared/skip-tutorial-button'
import { STATS } from '@/lib/brain-bet'
import {
  JUDGMENT_BLOCK_EXIT_MS,
  JUDGMENT_COMBO_BONUS_FEEDBACK_MS,
  JUDGMENT_COMBO_BONUS_INTERVAL,
  JUDGMENT_COMBO_BONUS_TIME_MS,
  JUDGMENT_MAX_COMBO_TIME_BONUSES,
  JUDGMENT_QUEUE_PREVIEW_COUNT,
  JUDGMENT_RULE_SWITCH_OVERLAY_MS,
  JUDGMENT_THIRD_OPTION_INTRO_MS,
  JUDGMENT_TUTORIAL_COUNT_STIMULI,
  JUDGMENT_TUTORIAL_SHAPE_STIMULI,
  getJudgmentGameDurationForDifficulty,
  getSegmentConfig,
} from '@/lib/config/judgment.config'
import { GAME_DIFFICULTY_DISPLAY_LABEL } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import {
  JUDGMENT_STIMULI_2WAY,
  JUDGMENT_STIMULI_3WAY,
  computeJudgmentAnswerForMapping,
  generateBlockStimuli,
  generateRuleMapping,
  isConflictStimulus,
  pickSegmentConflictCount,
} from '@/lib/game/judgment-stimulus'
import type {
  JudgmentAnswer,
  JudgmentMappingValue,
  JudgmentRawSummary,
  JudgmentRuleId,
  JudgmentRuleMapping,
  JudgmentStimulus,
  JudgmentTrial,
} from '@/lib/game/types'
import { calculateJudgmentScore, summarizeJudgmentTrials } from '@/lib/scoring/judgment'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type AppStage = 'intro' | 'tutorial' | 'playing' | 'finished'

interface QueueBlock {
  key: number
  stimulus: JudgmentStimulus
  ruleId: JudgmentRuleId
  choiceCount: 2 | 3
  /** The Left/Mid/Right assignment active for this Block's whole segment — shuffled once per segment, never per Block. */
  ruleMapping: JudgmentRuleMapping
  /** Which rule segment (Tutorial phase or real Time Attack segment) this Block belongs to. */
  segmentIndex: number
  /** Position within its segment — 0 marks a potential switch/heads-up boundary. */
  indexInSegment: number
  /**
   * Whether this Block's segment mapping disagrees with the immediately
   * preceding segment's mapping for this exact stimulus. Computed once at
   * generation time (using that segment's true previous mapping) and stored
   * here rather than recomputed at resolution time — by the time a Block is
   * actually answered, the queue's lookahead may have already generated
   * several segments further ahead, so re-deriving "the previous mapping"
   * from a shared ref at that later point would silently drift.
   */
  isConflictTrial: boolean
  /** False for Tutorial Blocks — never recorded into `trials`, never scored. */
  recorded: boolean
}

interface ExitingBlock {
  key: number
  stimulus: JudgmentStimulus
  ruleId: JudgmentRuleId
  choiceCount: 2 | 3
  outcome: 'correct' | 'wrong'
}

interface ComboBonusFeedback {
  key: number
  milestone: number
}

interface JudgmentGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: {
    trials: JudgmentTrial[]
    rawSummary: JudgmentRawSummary
    gameScore: number
  }) => void
  onBack: () => void
}

/** Per-rule "last mapping used" memory — lets a rule's re-shuffle avoid repeating its own previous permutation even though the other rule always plays in between. */
type LastMappingByRule = Record<JudgmentRuleId, JudgmentRuleMapping | null>

const RULE_LABEL: Record<JudgmentRuleId, string> = { shape: '모양 규칙', count: '개수 규칙' }
const RULE_FOCUS_LABEL: Record<JudgmentRuleId, string> = { shape: '모양', count: '개수' }
// 2026-08 QA 최종 보정: 'mid'는 '●'였는데, ←/→와 달리 점 하나만으로는
// "가운데를 고르라"는 뜻이 즉시 전달되지 않는다는 지적 — 화살표 두 개
// 사이에 놓인 방향성 없는 기호라 첫 사용자 입장에서 뜻을 유추해야 했다.
// 버튼 자체/리마인더/규칙 배너 세 곳 모두 이 상수 하나를 공유하므로,
// 단어로 바꾸는 것만으로 세 곳 전부 명확해진다.
const ANSWER_ICON: Record<JudgmentAnswer, string> = { left: '←', right: '→', mid: '가운데' }
const SHAPE_LABEL: Record<JudgmentStimulus['shape'], string> = { circle: '동그라미', square: '네모', diamond: '마름모' }
const COUNT_LABEL: Record<JudgmentStimulus['dotCount'], string> = { 1: '점 1개', 2: '점 2개', 3: '점 3개' }

/** A mapping value is a dot count or a shape name — `typeof` separates the two unambiguously. */
function mappingValueLabel(value: JudgmentMappingValue): string {
  return typeof value === 'number' ? COUNT_LABEL[value] : SHAPE_LABEL[value]
}

/** What a given answer button maps to under the CURRENT (randomized, per-segment) mapping — shown directly on the button so nothing needs to be memorized by position. */
function labelForAnswer(mapping: JudgmentRuleMapping, answer: JudgmentAnswer): string {
  const value = answer === 'left' ? mapping.left : answer === 'right' ? mapping.right : mapping.mid
  return value === null ? '' : mappingValueLabel(value)
}

/**
 * 2026-08 QA 3차 보정: the persistent GameRuleReminder line used to show a
 * generic, rule-agnostic sentence ("Block을 빠르게 처리하세요") that never
 * actually told the player what Left/Mid/Right currently mean — that
 * mapping is randomized per segment specifically so it can't be memorized,
 * so it has to be read from somewhere every single Block. The Rule Banner
 * above already shows it, but QA found it too easy to miss; this repeats it
 * in the one slot every other mini-game already treats as "the always-on
 * rule line" — e.g. "모양 규칙 · 동그라미 ← / 네모 →" — one line, no
 * memorization required, updates live with the mapping.
 */
function ruleReminderText(mapping: JudgmentRuleMapping | null): string {
  if (!mapping) return '규칙에 맞게 Block을 빠르게 처리하세요.'
  const parts = [
    `${labelForAnswer(mapping, 'left')} ${ANSWER_ICON.left}`,
    ...(mapping.choiceCount === 3 ? [`${labelForAnswer(mapping, 'mid')} ${ANSWER_ICON.mid}`] : []),
    `${labelForAnswer(mapping, 'right')} ${ANSWER_ICON.right}`,
  ]
  return `${RULE_LABEL[mapping.ruleId]} · ${parts.join(' / ')}`
}

/**
 * `forcedRuleId` is non-null only for an Intro (First Play) Real session,
 * fixed once in beginTutorial and held for the whole session — overrides
 * whatever ruleId getSegmentConfig would naturally pick for this segment,
 * while leaving its choiceCount/length/Conflict ramp untouched. `null` (Free
 * Play) leaves getSegmentConfig's own ruleId — and therefore the original
 * one-time Rule Switch at segment 0 → 1 — completely alone.
 */
function buildSegmentBlocks(
  segmentIndex: number,
  difficulty: GameDifficulty,
  forcedRuleId: JudgmentRuleId | null,
  startKey: number,
  previousMapping: JudgmentRuleMapping | null,
  lastMappingForRule: JudgmentRuleMapping | null,
): { blocks: QueueBlock[]; nextKey: number; mapping: JudgmentRuleMapping } {
  const segmentConfig = getSegmentConfig(segmentIndex, difficulty)
  const ruleId = forcedRuleId ?? segmentConfig.ruleId
  const { choiceCount, length, conflictRatioMin, conflictRatioMax } = segmentConfig
  const mapping = generateRuleMapping(ruleId, choiceCount, lastMappingForRule)
  const pool = choiceCount === 3 ? JUDGMENT_STIMULI_3WAY : JUDGMENT_STIMULI_2WAY
  const classify = (s: JudgmentStimulus) => isConflictStimulus(s, mapping, previousMapping)
  const conflictCount = pickSegmentConflictCount(length, conflictRatioMin, conflictRatioMax)
  const stimuli = generateBlockStimuli(pool, length, conflictCount, classify)
  let key = startKey
  const blocks: QueueBlock[] = stimuli.map((stimulus, indexInSegment) => ({
    key: key++,
    stimulus,
    ruleId,
    choiceCount,
    ruleMapping: mapping,
    segmentIndex,
    indexInSegment,
    isConflictTrial: classify(stimulus),
    recorded: true,
  }))
  return { blocks, nextKey: key, mapping }
}

/** Assessment-only chunk size for buildFixedRuleBlocks — arbitrary, just needs to comfortably refill JUDGMENT_QUEUE_PREVIEW_COUNT each call. */
const JUDGMENT_ASSESSMENT_CHUNK_LENGTH = 8

/**
 * Initial Assessment's real-session generator — used instead of
 * buildSegmentBlocks whenever both a forced rule AND a forced mapping are
 * set (mode 'first' only). No segment ramp, no per-chunk mapping reshuffle,
 * no Conflict trials (Conflict is "does this value disagree with the
 * PREVIOUS mapping" — meaningless when the mapping never changes at all).
 * Every Block always reports segmentIndex 0, so resolveCurrent's
 * "segmentIndex changed → show the Rule Change overlay" check can never
 * fire for Assessment either.
 */
function buildFixedRuleBlocks(
  ruleId: JudgmentRuleId,
  mapping: JudgmentRuleMapping,
  startKey: number,
): { blocks: QueueBlock[]; nextKey: number } {
  const stimuli = generateBlockStimuli(JUDGMENT_STIMULI_2WAY, JUDGMENT_ASSESSMENT_CHUNK_LENGTH, 0, () => false)
  let key = startKey
  const blocks: QueueBlock[] = stimuli.map((stimulus, indexInSegment) => ({
    key: key++,
    stimulus,
    ruleId,
    choiceCount: 2,
    ruleMapping: mapping,
    segmentIndex: 0,
    indexInSegment,
    isConflictTrial: false,
    recorded: true,
  }))
  return { blocks, nextKey: key }
}

/** Keeps the queue topped up to JUDGMENT_QUEUE_PREVIEW_COUNT by generating whole segments ahead of time — the real queue is functionally endless until the Time Attack timer runs out. `forcedRuleId`/`forcedMapping` are threaded straight through — see buildSegmentBlocks/buildFixedRuleBlocks doc comments. */
function fillQueue(
  current: QueueBlock[],
  difficulty: GameDifficulty,
  forcedRuleId: JudgmentRuleId | null,
  forcedMapping: JudgmentRuleMapping | null,
  nextKeyRef: { current: number },
  nextSegmentRef: { current: number },
  previousMappingRef: { current: JudgmentRuleMapping | null },
  lastMappingByRuleRef: { current: LastMappingByRule },
): QueueBlock[] {
  let q = current
  while (q.length < JUDGMENT_QUEUE_PREVIEW_COUNT) {
    if (forcedRuleId && forcedMapping) {
      const { blocks, nextKey } = buildFixedRuleBlocks(forcedRuleId, forcedMapping, nextKeyRef.current)
      nextKeyRef.current = nextKey
      q = [...q, ...blocks]
      continue
    }
    const segmentIndex = nextSegmentRef.current
    const ruleId = forcedRuleId ?? getSegmentConfig(segmentIndex, difficulty).ruleId
    const { blocks, nextKey, mapping } = buildSegmentBlocks(
      segmentIndex,
      difficulty,
      forcedRuleId,
      nextKeyRef.current,
      previousMappingRef.current,
      lastMappingByRuleRef.current[ruleId],
    )
    nextKeyRef.current = nextKey
    nextSegmentRef.current += 1
    previousMappingRef.current = mapping
    lastMappingByRuleRef.current = { ...lastMappingByRuleRef.current, [ruleId]: mapping }
    q = [...q, ...blocks]
  }
  return q
}

/**
 * `forcedRuleId` set (Intro/First Play): a single-rule practice set — just
 * the 3 curated stimuli for that one rule, all under segmentIndex 0 — so the
 * Tutorial never demos (or implies) a Rule Switch, matching Real play right
 * after it. Also reuses `forcedMapping` (the exact same mapping Real play
 * will use, generated once in beginTutorial) rather than rolling its own, so
 * the mapping shown here doesn't reshuffle the instant Real play begins.
 * `forcedRuleId` null (Free Play): the original two-segment demo, 3 shape
 * Blocks then 3 count Blocks, unchanged.
 */
function buildTutorialBlocks(forcedRuleId: JudgmentRuleId | null, forcedMapping: JudgmentRuleMapping | null): QueueBlock[] {
  if (forcedRuleId) {
    const stimuli = forcedRuleId === 'shape' ? JUDGMENT_TUTORIAL_SHAPE_STIMULI : JUDGMENT_TUTORIAL_COUNT_STIMULI
    const mapping = forcedMapping ?? generateRuleMapping(forcedRuleId, 2, null)
    return stimuli.map((stimulus, indexInSegment) => ({
      key: indexInSegment,
      stimulus,
      ruleId: forcedRuleId,
      choiceCount: 2,
      ruleMapping: mapping,
      segmentIndex: 0,
      indexInSegment,
      isConflictTrial: false,
      recorded: false,
    }))
  }

  const shapeMapping = generateRuleMapping('shape', 2, null)
  const countMapping = generateRuleMapping('count', 2, null)
  let key = 0
  const shapeBlocks: QueueBlock[] = JUDGMENT_TUTORIAL_SHAPE_STIMULI.map((stimulus, indexInSegment) => ({
    key: key++,
    stimulus,
    ruleId: 'shape',
    choiceCount: 2,
    ruleMapping: shapeMapping,
    segmentIndex: 0,
    indexInSegment,
    isConflictTrial: false,
    recorded: false,
  }))
  const countBlocks: QueueBlock[] = JUDGMENT_TUTORIAL_COUNT_STIMULI.map((stimulus, indexInSegment) => ({
    key: key++,
    stimulus,
    ruleId: 'count',
    choiceCount: 2,
    ruleMapping: countMapping,
    segmentIndex: 1,
    indexInSegment,
    isConflictTrial: false,
    recorded: false,
  }))
  return [...shapeBlocks, ...countBlocks]
}

/**
 * Real, interactive Judgment ("Rule Switch") game — GAME_SPEC §55-63, Time
 * Attack rework. A continuous horizontal queue of Blocks is always visible;
 * the player clears the current (leftmost, highlighted) Block by choosing
 * Left/Right (or, at Hard/Extreme, Left/Mid/Right), the queue shifts
 * immediately (no blocking per-trial feedback screen). Every segment
 * boundary reshuffles a fresh mapping (held fixed for that whole segment) so
 * the position can't be memorized by button — only actually read off the
 * Rule Banner.
 *
 * Rule Switch behavior now differs by `mode`: Free Play keeps the original
 * design — Tutorial demos shape then count back to back, Real play switches
 * from shape to count exactly once, partway through the session (see
 * getSegmentConfig). Intro (First Play) instead fixes ONE rule, picked at
 * random in beginTutorial, for BOTH its Tutorial and Real play — never
 * demoing or switching to the other rule at all (see the `forcedRuleId`
 * threaded through buildTutorialBlocks/buildSegmentBlocks/fillQueue). Segment
 * length is shorter for the early eased segments, then the tier's own
 * segmentLength once full difficulty is reached (see
 * JUDGMENT_TIER_RULE_CONFIG). At Hard/Extreme, the 2-way→3-way step (segment
 * index 1→2) introduces the third button partway through Real play with a
 * one-time heads-up overlay; Easy/Normal never take this step and stay 2-way
 * (Left/Right) all session. The whole session runs against one global
 * JUDGMENT_GAME_DURATION_MS timer, unaffected by tier.
 */
export function JudgmentGame({ index, mode, difficulty, onComplete, onBack }: JudgmentGameProps) {
  const stat = STATS.judgment
  const { play } = useSound()

  /** Total session length for the active difficulty — computed once (not re-derived per tick); at 'normal' this equals JUDGMENT_GAME_DURATION_MS exactly. */
  const gameDurationMs = useMemo(() => getJudgmentGameDurationForDifficulty(difficulty), [difficulty])

  const [appStage, setAppStage] = useState<AppStage>('intro')
  const [queue, setQueue] = useState<QueueBlock[]>([])
  const [exitingBlock, setExitingBlock] = useState<ExitingBlock | null>(null)
  const [isRuleChanging, setIsRuleChanging] = useState(false)
  const [ruleChangeMessage, setRuleChangeMessage] = useState('')
  const [upcomingMapping, setUpcomingMapping] = useState<JudgmentRuleMapping | null>(null)
  const [trials, setTrials] = useState<JudgmentTrial[]>([])
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [timeLeftMs, setTimeLeftMs] = useState(gameDurationMs)
  const [comboBonusFeedback, setComboBonusFeedback] = useState<ComboBonusFeedback | null>(null)

  const nextKeyRef = useRef(0)
  const nextSegmentToGenerateRef = useRef(0)
  /**
   * Non-null only for mode 'first' — the one rule BOTH Tutorial and Real
   * play use for the whole session, picked once in beginTutorial and never
   * changed afterward. Stays null for mode 'free', which leaves
   * getSegmentConfig's own ruleId (and its one-time Rule Switch) alone.
   */
  const sessionRuleIdRef = useRef<JudgmentRuleId | null>(null)
  /**
   * 2026-08 Assessment 회귀 수정: non-null only for mode 'first', alongside
   * sessionRuleIdRef — picked once in beginTutorial and reused for every
   * Block all session (Tutorial AND Real), never regenerated. Before this,
   * only the RULE was held fixed for Assessment; the Left/Right mapping
   * still reshuffled at every segment boundary regardless (this was actually
   * pre-existing, documented behavior from before the difficulty rework too
   * — see judgment.config.ts's getSegmentConfig history), which read as "the
   * rule silently changed" to a first-time player even though the ruleId
   * itself never did. Initial Assessment's policy is now: nothing about
   * "which button means what" changes for the whole session. Free Play
   * (`null`) is completely unaffected — its mapping still reshuffles every
   * segment as before.
   */
  const sessionMappingRef = useRef<JudgmentRuleMapping | null>(null)
  const previousMappingRef = useRef<JudgmentRuleMapping | null>(null)
  const lastMappingByRuleRef = useRef<LastMappingByRule>({ shape: null, count: null })
  const trialsRef = useRef<JudgmentTrial[]>([])
  const blockShownAtRef = useRef(0)
  const endAtRef = useRef(0)
  /** Combo values (10, 20, ...) that have already granted a Bonus this session — a Set (not a counter) so resetting Combo back to a milestone already reached never re-grants it. */
  const grantedComboMilestonesRef = useRef<Set<number>>(new Set())
  const comboBonusKeyRef = useRef(0)
  const timerIntervalRef = useRef<number | null>(null)
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
  const stopTimer = () => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }
  useEffect(
    () => () => {
      clearScheduled()
      stopTimer()
    },
    [],
  )

  const finishGame = () => {
    stopTimer()
    setAppStage('finished')
    const finalTrials = trialsRef.current
    const rawSummary = summarizeJudgmentTrials(finalTrials, gameDurationMs)
    const gameScore = calculateJudgmentScore(rawSummary)
    schedule(() => onComplete({ trials: finalTrials, rawSummary, gameScore }), 300)
  }

  const startTimer = () => {
    stopTimer()
    timerIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, endAtRef.current - performance.now())
      setTimeLeftMs(remaining)
      if (remaining <= 0) finishGame()
    }, 100)
  }

  const beginTutorial = () => {
    play('game-start')
    clearScheduled()
    // mode 'first' fixes one rule AND one mapping for the whole session
    // (Tutorial + Real) — see sessionMappingRef's doc comment; mode 'free'
    // stays null for both, leaving getSegmentConfig's own Rule Switch and
    // per-segment mapping reshuffle alone.
    sessionRuleIdRef.current = mode === 'first' ? (Math.random() < 0.5 ? 'shape' : 'count') : null
    sessionMappingRef.current = sessionRuleIdRef.current ? generateRuleMapping(sessionRuleIdRef.current, 2, null) : null
    setAppStage('tutorial')
    setQueue(buildTutorialBlocks(sessionRuleIdRef.current, sessionMappingRef.current))
    setExitingBlock(null)
    setIsRuleChanging(false)
    blockShownAtRef.current = performance.now()
  }

  /** Normal/Hard/Extreme only (see SkipTutorialButton) — jumps straight to the same beginRealGame() the Tutorial's own natural completion calls, just earlier. */
  const skipTutorial = () => {
    clearScheduled()
    beginRealGame()
  }

  const beginRealGame = () => {
    clearScheduled()
    nextKeyRef.current = 0
    nextSegmentToGenerateRef.current = 0
    previousMappingRef.current = null
    lastMappingByRuleRef.current = { shape: null, count: null }
    trialsRef.current = []
    setTrials([])
    setCombo(0)
    setMaxCombo(0)
    grantedComboMilestonesRef.current = new Set()
    setComboBonusFeedback(null)
    setExitingBlock(null)
    setIsRuleChanging(false)
    setQueue(
      fillQueue(
        [],
        difficulty,
        sessionRuleIdRef.current,
        sessionMappingRef.current,
        nextKeyRef,
        nextSegmentToGenerateRef,
        previousMappingRef,
        lastMappingByRuleRef,
      ),
    )
    setAppStage('playing')
    endAtRef.current = performance.now() + gameDurationMs
    setTimeLeftMs(gameDurationMs)
    blockShownAtRef.current = performance.now()
    startTimer()
  }

  const resolveCurrent = (answer: JudgmentAnswer) => {
    if (appStage !== 'tutorial' && appStage !== 'playing') return
    if (isRuleChanging) return
    if (queue.length === 0) return
    const current = queue[0]
    if (answer === 'mid' && current.choiceCount !== 3) return

    const correctAnswer = computeJudgmentAnswerForMapping(current.ruleMapping, current.stimulus)
    const isCorrect = correctAnswer !== null && answer === correctAnswer
    play(isCorrect ? 'answer-correct' : 'wrong')
    const responseTimeMs = Math.round(performance.now() - blockShownAtRef.current)

    setExitingBlock({
      key: current.key,
      stimulus: current.stimulus,
      ruleId: current.ruleId,
      choiceCount: current.choiceCount,
      outcome: isCorrect ? 'correct' : 'wrong',
    })
    schedule(() => setExitingBlock((e) => (e && e.key === current.key ? null : e)), JUDGMENT_BLOCK_EXIT_MS)

    if (current.recorded && correctAnswer !== null) {
      const isSwitchTrial = current.indexInSegment === 0 && current.segmentIndex > 0
      // mode 'first' holds one ruleId all session (see beginTutorial), so the
      // "previous segment's rule" is always this same rule; mode 'free' looks
      // it up from the original per-segment derivation (the one Rule Switch).
      const previousRuleId =
        current.segmentIndex > 0 ? (sessionRuleIdRef.current ?? getSegmentConfig(current.segmentIndex - 1, difficulty).ruleId) : null
      const trial: JudgmentTrial = {
        trialIndex: trialsRef.current.length,
        segmentIndex: current.segmentIndex,
        ruleId: current.ruleId,
        previousRuleId,
        stimulus: current.stimulus,
        ruleMapping: current.ruleMapping,
        correctAnswer,
        selectedAnswer: answer,
        isCorrect,
        responseTimeMs,
        isSwitchTrial,
        trialsSinceSwitch: current.indexInSegment,
        isConflictTrial: current.isConflictTrial,
        choiceCount: current.choiceCount,
        createdAt: new Date().toISOString(),
      }
      trialsRef.current = [...trialsRef.current, trial]
      setTrials(trialsRef.current)
      const nextCombo = isCorrect ? combo + 1 : 0
      setCombo(nextCombo)
      setMaxCombo((m) => Math.max(m, nextCombo))

      // Combo Bonus Time — a gameplay reward only (never a Score input, see
      // judgment.config.ts). Each milestone (10, 20, ...) can grant at most
      // once per session, tracked by value rather than by count, so resetting
      // Combo and climbing back to a milestone already reached never
      // re-grants it. endAtRef stays the single source of truth for the
      // Timer — extending it here is all that's needed for the existing
      // interval tick to pick up the new remaining time correctly next tick;
      // setTimeLeftMs is also nudged immediately so the Gauge doesn't wait
      // up to 100ms to visibly reflect the bonus.
      if (
        isCorrect &&
        nextCombo > 0 &&
        nextCombo % JUDGMENT_COMBO_BONUS_INTERVAL === 0 &&
        !grantedComboMilestonesRef.current.has(nextCombo) &&
        grantedComboMilestonesRef.current.size < JUDGMENT_MAX_COMBO_TIME_BONUSES
      ) {
        grantedComboMilestonesRef.current.add(nextCombo)
        endAtRef.current += JUDGMENT_COMBO_BONUS_TIME_MS
        setTimeLeftMs((t) => t + JUDGMENT_COMBO_BONUS_TIME_MS)
        const feedbackKey = comboBonusKeyRef.current++
        setComboBonusFeedback({ key: feedbackKey, milestone: nextCombo })
        schedule(
          () => setComboBonusFeedback((f) => (f && f.key === feedbackKey ? null : f)),
          JUDGMENT_COMBO_BONUS_FEEDBACK_MS,
        )
      }
    }

    const rest = queue.slice(1)

    if (!current.recorded && rest.length === 0) {
      // Tutorial exhausted — short completion beat, then the real Time Attack begins.
      setQueue([])
      setIsRuleChanging(true)
      setUpcomingMapping(null)
      setRuleChangeMessage('튜토리얼 완료! 이제 실전을 시작할게요.')
      schedule(() => beginRealGame(), JUDGMENT_RULE_SWITCH_OVERLAY_MS + 500)
      blockShownAtRef.current = performance.now()
      return
    }

    const filled = current.recorded
      ? fillQueue(
          rest,
          difficulty,
          sessionRuleIdRef.current,
          sessionMappingRef.current,
          nextKeyRef,
          nextSegmentToGenerateRef,
          previousMappingRef,
          lastMappingByRuleRef,
        )
      : rest
    setQueue(filled)
    blockShownAtRef.current = performance.now()

    const upcoming = filled[0]
    if (upcoming && upcoming.segmentIndex !== current.segmentIndex) {
      // `ruleChanged` fires at a genuine ruleId change in each block — mode
      // 'first' fixes one ruleId for both Tutorial and Real (see
      // beginTutorial), so this is always false there; mode 'free' still
      // switches once, either in its Tutorial demo (segment 0 → 1) or its
      // Real session (see getSegmentConfig). Later segment boundaries
      // (2 → 3, 3 → 4, ...) reshuffle the mapping but keep the same rule and
      // choiceCount, so no overlay interrupts play for those; the live Rule
      // Banner already shows the fresh mapping.
      const ruleChanged = upcoming.ruleId !== current.ruleId
      const choiceCountChanged = upcoming.choiceCount !== current.choiceCount
      if (ruleChanged || choiceCountChanged) {
        setIsRuleChanging(true)
        setUpcomingMapping(upcoming.ruleMapping)
        setRuleChangeMessage(
          ruleChanged
            ? '규칙이 바뀌었어요!'
            : '이제 선택지가 3개예요!',
        )
        const overlayMs = choiceCountChanged ? JUDGMENT_THIRD_OPTION_INTRO_MS : JUDGMENT_RULE_SWITCH_OVERLAY_MS
        schedule(() => setIsRuleChanging(false), overlayMs)
      }
    }
  }

  const current = queue[0] ?? null
  const upcomingPreview = queue.slice(1, JUDGMENT_QUEUE_PREVIEW_COUNT)
  const choiceCount = current?.choiceCount ?? 2

  // resolveCurrent already guards on appStage/isRuleChanging/queue internally,
  // so the keydown listener only needs a ref to the latest closure (updated
  // every render) rather than being torn down and re-added itself whenever
  // those values change — previously this effect had no dependency array, so
  // it re-subscribed on every render, including every 100ms Timer tick.
  const resolveCurrentRef = useRef(resolveCurrent)
  resolveCurrentRef.current = resolveCurrent
  const choiceCountRef = useRef(choiceCount)
  choiceCountRef.current = choiceCount

  // Arrow keys mirror the on-screen buttons. event.repeat is blocked so holding
  // a key down never auto-fires more than the one Block it was pressed for.
  // Mounted once (empty deps) — see resolveCurrentRef above for why this is safe.
  // ArrowUp mirrors 'mid' only when it's actually in play (choiceCount 3) —
  // there's no on-screen Up button anymore, but the key still maps to the
  // same visual middle slot the row lays out below.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        resolveCurrentRef.current('left')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        resolveCurrentRef.current('right')
      } else if (e.key === 'ArrowUp' && choiceCountRef.current === 3) {
        e.preventDefault()
        resolveCurrentRef.current('mid')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const visibleAnswers: JudgmentAnswer[] = choiceCount === 3 ? ['left', 'mid', 'right'] : ['left', 'right']
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  const timePercent = Math.max(0, Math.min(100, (timeLeftMs / gameDurationMs) * 100))
  const bannerMapping = isRuleChanging ? upcomingMapping : (current?.ruleMapping ?? null)

  function renderStimulus(stimulus: JudgmentStimulus, color: string, size: number, className?: string) {
    return <JudgmentSymbolView stimulus={stimulus} color={color} size={size} className={className} />
  }

  function renderAnswerButton(answer: JudgmentAnswer) {
    return (
      <button
        key={answer}
        type="button"
        onClick={() => resolveCurrent(answer)}
        disabled={appStage === 'finished' || isRuleChanging || !current}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-5 font-display toy-border transition-transform duration-150',
          appStage !== 'finished' &&
            !isRuleChanging &&
            current &&
            'bg-card text-foreground hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none',
          (appStage === 'finished' || isRuleChanging || !current) && 'cursor-not-allowed bg-muted text-muted-foreground opacity-60',
        )}
      >
        <span className="text-2xl font-extrabold leading-none">{ANSWER_ICON[answer]}</span>
        <span className="text-xs font-bold">{current ? labelForAnswer(current.ruleMapping, answer) : ''}</span>
      </button>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-5">
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

      {/* Fixed-height status row: Tutorial badge OR Time Gauge + Combo, never both, always same height. */}
      <div className="mt-6 flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatBadge stat={stat} size="md" />
          <h1 className="font-display text-2xl font-extrabold leading-none text-foreground">
            {stat.name} <span className="text-base font-bold text-muted-foreground">({GAME_DIFFICULTY_DISPLAY_LABEL[difficulty]})</span>
          </h1>
        </div>

        {appStage === 'tutorial' ? (
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-sm font-extrabold text-secondary-foreground toy-border">
              튜토리얼
            </span>
            {mode === 'free' && difficulty !== 'easy' && <SkipTutorialButton onSkip={skipTutorial} />}
          </div>
        ) : appStage === 'playing' || appStage === 'finished' ? (
          <div className="relative flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {maxCombo > 0 && combo >= 2 && (
                <span className="font-display text-xs font-extrabold text-primary">COMBO ×{combo}</span>
              )}
              <span className="font-display text-lg font-extrabold tabular-nums text-foreground">{secondsLeft}초</span>
            </div>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', timePercent <= 20 ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${timePercent}%` }}
              />
            </div>

            {/* Combo Bonus Time pop-up — absolutely positioned so it never
                shifts the Timer/Gauge above it, never blocks Queue input. */}
            {comboBonusFeedback && (
              <div
                key={comboBonusFeedback.key}
                className="animate-pop-in pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-xl bg-primary px-3 py-1.5 text-center font-display text-xs font-extrabold text-primary-foreground toy-border"
              >
                {comboBonusFeedback.milestone} COMBO! +{JUDGMENT_COMBO_BONUS_TIME_MS / 1000}초
              </div>
            )}
          </div>
        ) : null}
      </div>

      {appStage === 'intro' ? (
        <button
          type="button"
          data-sfx-skip
          onClick={beginTutorial}
          className="mt-5 flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg transition-colors duration-150"
        >
          <span
            className="grid h-24 w-24 place-items-center rounded-3xl toy-border toy-shadow"
            style={{ backgroundColor: `var(${stat.colorVar})` } as CSSProperties}
          >
            {renderStimulus({ shape: 'circle', dotCount: 1 }, 'var(--card)', 44)}
          </span>
          <div className="max-w-sm">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              규칙에 맞게 Block을 빠르게 처리하세요. 제한시간 안에 최대한 많이, 정확하게!
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground toy-border">
              탭해서 시작하기
            </p>
          </div>
        </button>
      ) : (
        <div className="relative mt-5 flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-card px-4 py-5 toy-border toy-shadow-lg sm:px-6 sm:py-6">
          {/* Rule Banner — fixed height so the Rule Change overlay never shifts the layout. Mapping is randomized per segment, so it's shown here (and on the buttons below) rather than ever assumed memorized. */}
          <div className="flex min-h-16 w-full max-w-sm flex-col items-center justify-center gap-1.5 rounded-2xl bg-secondary px-4 py-3 text-center toy-border">
            {isRuleChanging ? (
              <>
                <p className="font-display text-sm font-extrabold text-primary">{ruleChangeMessage}</p>
                {bannerMapping && (
                  <p className="text-xs font-bold text-secondary-foreground">
                    이번에는 {RULE_FOCUS_LABEL[bannerMapping.ruleId]}을 보세요.
                  </p>
                )}
              </>
            ) : current ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-secondary-foreground">현재 규칙</p>
                <p className="font-display text-base font-extrabold text-secondary-foreground">
                  {RULE_LABEL[current.ruleId]}
                </p>
              </>
            ) : (
              <p className="font-display text-base font-extrabold text-primary">시간 종료!</p>
            )}
            {bannerMapping && (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-secondary-foreground">
                <span>{ANSWER_ICON.left} {labelForAnswer(bannerMapping, 'left')}</span>
                {bannerMapping.choiceCount === 3 && (
                  <span>{ANSWER_ICON.mid} {labelForAnswer(bannerMapping, 'mid')}</span>
                )}
                <span>{ANSWER_ICON.right} {labelForAnswer(bannerMapping, 'right')}</span>
              </div>
            )}
          </div>

          <GameRuleReminder text={ruleReminderText(bannerMapping)} />

          {/* Block Queue: current (enlarged, glowing) + upcoming preview, fading out.
              Sizes are mobile-first (smaller) with `sm:` restoring the original desktop
              sizes exactly — the full 5-block preview plus a 96px current block otherwise
              overflows a 375px-wide screen, so mobile also shows fewer preview blocks. */}
          <div className="flex h-16 w-full max-w-lg items-center justify-center gap-1.5 sm:h-24 sm:gap-2">
            <div className="relative">
              {current && (
                <div
                  className="grid h-16 w-16 place-items-center rounded-2xl bg-background toy-border toy-shadow-lg sm:h-24 sm:w-24 sm:rounded-3xl"
                  style={{ boxShadow: `0 0 0 3px var(${stat.colorVar})` } as CSSProperties}
                >
                  {renderStimulus(current.stimulus, `var(${stat.colorVar})`, 40, 'sm:h-[60px] sm:w-[60px]')}
                </div>
              )}
              {exitingBlock && (
                <div
                  className={cn(
                    'absolute inset-0 grid place-items-center rounded-2xl bg-background toy-border sm:rounded-3xl',
                    exitingBlock.outcome === 'correct' ? 'animate-block-clear' : 'animate-block-shake-once',
                  )}
                  aria-hidden="true"
                >
                  {renderStimulus(exitingBlock.stimulus, `var(${stat.colorVar})`, 40, 'sm:h-[60px] sm:w-[60px]')}
                  <span
                    className={cn(
                      'animate-badge-float absolute -top-2 right-0 rounded-full px-2 py-0.5 text-xs font-extrabold',
                      exitingBlock.outcome === 'correct'
                        ? 'bg-[var(--chart-4)] text-foreground'
                        : 'bg-destructive text-destructive-foreground',
                    )}
                  >
                    {exitingBlock.outcome === 'correct' ? '+1' : 'MISS'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {upcomingPreview.map((block, i) => (
                <div
                  key={block.key}
                  className={cn(
                    'grid place-items-center rounded-xl bg-background toy-border sm:rounded-2xl',
                    i === 0 ? 'h-12 w-12 opacity-80 sm:h-16 sm:w-16' : 'h-9 w-9 opacity-45 sm:h-12 sm:w-12',
                    i >= 3 && 'hidden sm:grid',
                  )}
                >
                  {renderStimulus(
                    block.stimulus,
                    `var(${stat.colorVar})`,
                    i === 0 ? 26 : 18,
                    i === 0 ? 'sm:h-[34px] sm:w-[34px]' : 'sm:h-6 sm:w-6',
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Simple left-to-right row for both 2-way and 3-way — no cross/directional
              layout, so the buttons read as plain answer slots rather than an
              input scheme of their own. */}
          <div className={cn('mx-auto grid w-full gap-3', choiceCount === 3 ? 'max-w-md grid-cols-3' : 'max-w-sm grid-cols-2')}>
            {visibleAnswers.map((answer) => renderAnswerButton(answer))}
          </div>

          <p className="hidden text-[10px] font-semibold text-muted-foreground sm:block">
            {choiceCount === 3 ? '← ↑ → 방향키 사용 가능' : '← → 방향키 사용 가능'}
          </p>
        </div>
      )}
    </div>
  )
}
