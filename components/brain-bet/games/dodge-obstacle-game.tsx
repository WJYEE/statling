'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  DODGE_OBSTACLE_COLLISION_COOLDOWN_MS,
  DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS,
  DODGE_OBSTACLE_LANE_COUNT,
  dodgeObstacleSpawnIntervalAt,
  dodgeObstacleSpeedAt,
  getDodgeObstacleTierConfig,
} from '@/lib/config/dodge-obstacle.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickDefaultSpawn, pickGreenGapPattern, pickScriptedPattern, type DodgeLane } from '@/lib/game/dodge-obstacle-patterns'
import type { DodgeObstacleEvent, DodgeObstacleRawSummary } from '@/lib/game/types'
import { calculateDodgeObstacleScore, summarizeDodgeObstacleEvents } from '@/lib/scoring/dodge-obstacle'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing' | 'ended'
type Lane = DodgeLane

interface Obstacle {
  id: number
  lane: Lane
  spawnedAt: number
  resolved: boolean
  /** 'safe' obstacles (green-gap pattern, Extreme only) are never a collision, in any lane — they only ever mark "stand here" — see the collision check in the rAF loop below. */
  kind: 'hazard' | 'safe'
}

const PLAY_HEIGHT_PX = 380
const HIT_LINE_PX = PLAY_HEIGHT_PX - 64

const FIXED_TIME_TUTORIAL: TutorialContent = {
  goal: '좌우로 이동하며 위에서 떨어지는 장애물을 제한 시간 동안 최대한 많이 피해요.',
  steps: ['화면 왼쪽/오른쪽을 탭하면 그쪽 레인으로 이동해요.', '키보드 좌우 화살표로도 이동할 수 있어요.', '부딪혀도 게임은 끝나지 않고 계속돼요. 다만 충돌은 점수에 불리하게 반영돼요. 시간이 지날수록 점점 빨라져요.'],
  scoring: '회피율과 반응 속도를 반영해요. 충돌할수록 점수가 낮아져요.',
}

const ENDLESS_TUTORIAL: TutorialContent = {
  goal: '좌우로 이동하며 위에서 떨어지는 장애물을 계속 피해요. 끝없이 이어지는 생존 모드예요.',
  steps: [
    '화면 왼쪽/오른쪽을 탭하면 그쪽 레인으로 이동해요.',
    '키보드 좌우 화살표로도 이동할 수 있어요.',
    '장애물에 한 번이라도 부딪히면 그 즉시 끝나요. 시간이 지날수록 점점 빨라져요.',
    '가끔 초록색 안전 레인이 나타나요. 초록색 길을 따라 피하세요!',
  ],
  scoring: '회피율, 반응 속도, 생존 시간을 함께 반영해요.',
}

let obstacleIdCounter = 0

/**
 * "장애물 피하기" (v3, 2026-08 후속 보정). Easy/Normal/Hard run a FIXED-TIME
 * session (35s/35s/40s) where a collision no longer ends the run — it's
 * just recorded and hurts the score. Extreme is the app's one true
 * endless/survival tier: no clock, ramps forever, and ends the instant the
 * player collides. See lib/config/dodge-obstacle.config.ts for the
 * per-tier mode/duration/ramp table.
 */
export function DodgeObstacleGame({
  index,
  mode,
  difficulty,
  onComplete,
  onBack,
}: {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { events: DodgeObstacleEvent[]; rawSummary: DodgeObstacleRawSummary; gameScore: number }) => void
  onBack: () => void
}) {
  const stat = STATS.reaction
  const { play } = useSound()
  const tierConfig = useMemo(() => getDodgeObstacleTierConfig(difficulty), [difficulty])
  const [stage, setStage] = useState<Stage>('intro')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [playerLane, setPlayerLane] = useState<Lane>(1)
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  /** Count-up display — this game has no clock to count down from anymore. */
  const [survivedDisplayMs, setSurvivedDisplayMs] = useState(0)
  const [flash, setFlash] = useState<'dodge' | 'hit' | null>(null)

  /**
   * Synchronous mirror of `obstacles`, always up to date the instant an
   * obstacle is added or resolved — unlike a `setObstacles(prev => ...)`
   * functional updater, which React does not guarantee runs synchronously
   * at call time (it can be deferred to the render phase, e.g. whenever
   * this fiber already has another update pending — which it always does
   * here, since `setSurvivedDisplayMs` runs earlier in the very same
   * frame). The rAF loop below reads this ref to decide "did a hazard
   * collision just happen" so that decision — and the resulting
   * `finish()` call for Extreme's 1-hit-ends rule — never depends on
   * React's state-update scheduling.
   */
  const obstaclesRef = useRef<Obstacle[]>([])

  const playerLaneRef = useRef<Lane>(1)
  const eventsRef = useRef<DodgeObstacleEvent[]>([])
  const moveReactionTimesRef = useRef<number[]>([])
  const pendingThreatRef = useRef<{ lane: Lane; spawnedAt: number } | null>(null)
  const lastCollisionAtRef = useRef(0)
  const lastSpawnLaneRef = useRef<Lane | null>(null)
  const startedAtRef = useRef(0)
  const nextSpawnAtRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const pausedAccumRef = useRef(0)
  const pausedAtRef = useRef<number | null>(null)
  /** Pending multi-tick scripted pattern (sweep/gap-shift) — one entry consumed per spawn tick when non-empty, see spawnObstacle. */
  const scriptedQueueRef = useRef<Lane[][]>([])
  /** True right after a default-spawn tick double-spawned — blocks the very next tick's double roll, see pickDefaultSpawn's lastWasDouble. */
  const lastSpawnWasDoubleRef = useRef(false)
  const finishedRef = useRef(false)
  /**
   * Mirrors `tutorialOpen` for the rAF loop below. The loop effect only
   * depends on `[stage]` (recreating it on every tutorialOpen toggle would
   * tear down and restart the whole animation loop), so its `loop` closure
   * would otherwise capture whatever `tutorialOpen` was at the moment the
   * effect was created and never see it change — a stale-closure bug that
   * meant opening the tutorial mid-run never actually paused obstacle
   * movement/collisions, since the loop kept using the closed-over `false`
   * forever. Reading a ref instead always sees the live value.
   */
  const tutorialOpenRef = useRef(false)

  useEffect(() => {
    playerLaneRef.current = playerLane
  }, [playerLane])

  useEffect(() => {
    tutorialOpenRef.current = tutorialOpen
  }, [tutorialOpen])

  const finish = (survivedMs: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setStage('ended')
    const rawSummary = summarizeDodgeObstacleEvents(eventsRef.current, survivedMs, moveReactionTimesRef.current)
    const gameScore = calculateDodgeObstacleScore(rawSummary, tierConfig.mode)
    onComplete({ events: eventsRef.current, rawSummary, gameScore })
  }

  /** Appends newly spawned obstacles to the synchronous ref first, then mirrors it into React state for rendering — keeps the two never out of sync. */
  const appendObstacles = (items: Obstacle[]) => {
    obstaclesRef.current = [...obstaclesRef.current, ...items]
    setObstacles(obstaclesRef.current)
  }

  const moveTo = (lane: Lane) => {
    if (stage !== 'playing' || tutorialOpen) return
    if (lane === playerLaneRef.current) return
    setPlayerLane(lane)
    if (pendingThreatRef.current) {
      moveReactionTimesRef.current.push(performance.now() - pendingThreatRef.current.spawnedAt)
      pendingThreatRef.current = null
    }
  }

  // Window-level (not element-focus-dependent) so the arrow keys work as soon as the game is on screen, without requiring an extra click to focus a container first.
  useEffect(() => {
    if (stage !== 'playing') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') moveTo(Math.max(0, playerLaneRef.current - 1) as Lane)
      if (e.key === 'ArrowRight') moveTo(Math.min(DODGE_OBSTACLE_LANE_COUNT - 1, playerLaneRef.current + 1) as Lane)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moveTo reads latest state via refs; only `stage` should re-attach this listener
  }, [stage])

  const spawnObstacle = (elapsedMs: number) => {
    const now = performance.now()

    // Extreme-only green-gap special pattern (v4 QA) — checked first, and
    // mutually exclusive with the scripted-queue/default roll below for
    // this tick. Every other tier's greenGapChance is 0, so this branch
    // never fires for them.
    const greenGapEligible = elapsedMs >= tierConfig.greenGapUnlockMs
    if (greenGapEligible && Math.random() < tierConfig.greenGapChance) {
      const { hazardLanes, safeLane } = pickGreenGapPattern()
      const newObstacles: Obstacle[] = [
        ...hazardLanes.map((lane) => ({ id: obstacleIdCounter++, lane, spawnedAt: now, resolved: false, kind: 'hazard' as const })),
        { id: obstacleIdCounter++, lane: safeLane, spawnedAt: now, resolved: false, kind: 'safe' as const },
      ]
      appendObstacles(newObstacles)
      lastSpawnLaneRef.current = hazardLanes[0]
      lastSpawnWasDoubleRef.current = false
      if (!pendingThreatRef.current) {
        const threatensPlayer = hazardLanes.includes(playerLaneRef.current)
        if (threatensPlayer) pendingThreatRef.current = { lane: playerLaneRef.current, spawnedAt: now }
      }
      return
    }

    let lanesToSpawn: Lane[]

    if (scriptedQueueRef.current.length > 0) {
      lanesToSpawn = scriptedQueueRef.current.shift() as Lane[]
    } else {
      const canDouble = elapsedMs >= tierConfig.doubleSpawnUnlockMs
      const scriptedEligible = elapsedMs >= tierConfig.scriptedPatternUnlockMs
      if (scriptedEligible && Math.random() < tierConfig.scriptedPatternChance) {
        const pattern = pickScriptedPattern()
        // Spawn this tick's first step now, queue the rest for the following ticks.
        lanesToSpawn = pattern[0]
        scriptedQueueRef.current = pattern.slice(1)
      } else {
        lanesToSpawn = pickDefaultSpawn({
          canDouble,
          lastLane: lastSpawnLaneRef.current,
          lastWasDouble: lastSpawnWasDoubleRef.current,
          doubleChance: tierConfig.doubleSpawnChance,
        })
      }
    }
    lastSpawnLaneRef.current = lanesToSpawn[0]
    lastSpawnWasDoubleRef.current = lanesToSpawn.length === 2

    const newObstacles: Obstacle[] = lanesToSpawn.map((lane) => ({ id: obstacleIdCounter++, lane, spawnedAt: now, resolved: false, kind: 'hazard' }))
    appendObstacles(newObstacles)

    if (!pendingThreatRef.current) {
      const threatensPlayer = lanesToSpawn.includes(playerLaneRef.current)
      if (threatensPlayer) pendingThreatRef.current = { lane: playerLaneRef.current, spawnedAt: now }
    }
  }

  const speedAt = (elapsedMs: number) => dodgeObstacleSpeedAt(tierConfig, elapsedMs)
  const spawnIntervalAt = (elapsedMs: number) => dodgeObstacleSpawnIntervalAt(tierConfig, elapsedMs)

  // Pause/resume bookkeeping: while the tutorial is open, freeze the elapsed-time clock the rAF loop reads from.
  useEffect(() => {
    if (stage !== 'playing') return
    if (tutorialOpen) {
      pausedAtRef.current = performance.now()
    } else if (pausedAtRef.current != null) {
      pausedAccumRef.current += performance.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
  }, [tutorialOpen, stage])

  useEffect(() => {
    if (stage !== 'playing') return

    const loop = () => {
      // Defensive: a rAF callback already in flight when finish() cancels
      // the *next* frame can't un-run itself — this guard just makes sure
      // such a stale tick can never spawn/mutate obstacles after the game
      // has already ended.
      if (finishedRef.current) return
      if (tutorialOpenRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      const now = performance.now()
      const elapsed = now - startedAtRef.current - pausedAccumRef.current

      // Fixed-time tiers (Easy/Normal/Hard): the clock is the only end condition — a collision never stops the run early.
      if (tierConfig.mode === 'fixed-time' && tierConfig.durationMs != null && elapsed >= tierConfig.durationMs) {
        setSurvivedDisplayMs(tierConfig.durationMs)
        finish(tierConfig.durationMs)
        return
      }
      setSurvivedDisplayMs(elapsed)

      if (now >= nextSpawnAtRef.current) {
        spawnObstacle(elapsed)
        nextSpawnAtRef.current = now + spawnIntervalAt(elapsed)
      }

      // Collision detection is a plain synchronous pass over `obstaclesRef`
      // (not a `setObstacles(prev => ...)` functional updater) — the
      // updater form doesn't guarantee it runs synchronously at call time
      // (React can defer it to the render phase, which already happens on
      // every tick here since `setSurvivedDisplayMs` above always dirties
      // this fiber first), so `finish()` for Extreme's 1-hit-ends rule must
      // never depend on it. `setObstacles` below is purely to push the
      // already-decided result into rendering.
      const speed = speedAt(elapsed)
      let changed = false
      let collisionSurvivedMs: number | null = null
      const next = obstaclesRef.current.map((o) => {
        if (o.resolved) return o
        const y = ((now - o.spawnedAt) / 1000) * speed
        if (y < HIT_LINE_PX) return o
        changed = true
        // Green-gap's safe marker is never a collision, in any lane — it
        // only ever means "stand here," so it always resolves as a
        // harmless dodge regardless of where the player is standing.
        if (o.kind === 'safe') {
          eventsRef.current.push({ kind: 'dodged', lane: o.lane, atMs: elapsed })
          return { ...o, resolved: true }
        }
        const collided = o.lane === playerLaneRef.current
        eventsRef.current.push({ kind: collided ? 'collided' : 'dodged', lane: o.lane, atMs: elapsed })
        if (collided) {
          play('wrong')
          if (now - lastCollisionAtRef.current > DODGE_OBSTACLE_COLLISION_COOLDOWN_MS) {
            lastCollisionAtRef.current = now
            setFlash('hit')
          }
          // Endless mode (Extreme): the first hazard collision ends the run — capture elapsed now, finish() is called immediately below, still within this same synchronous tick. Fixed-time tiers just keep going.
          if (tierConfig.mode === 'endless' && collisionSurvivedMs === null) collisionSurvivedMs = elapsed
        } else {
          play('answer-correct')
          setFlash((f) => f ?? 'dodge')
          window.setTimeout(() => setFlash((f) => (f === 'dodge' ? null : f)), 150)
        }
        return { ...o, resolved: true }
      })
      // Drop long-resolved obstacles so the array doesn't grow unbounded over a long run.
      const trimmed = next.filter((o) => now - o.spawnedAt < 4000)
      if (changed || trimmed.length !== obstaclesRef.current.length) {
        obstaclesRef.current = trimmed
        setObstacles(trimmed)
      }

      if (collisionSurvivedMs !== null) {
        finish(collisionSurvivedMs)
        return
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally a single long-lived rAF loop for the 'playing' stage; tutorialOpen/tierConfig are read fresh each frame via closure
  }, [stage])

  const startGame = () => setStage('countdown')
  const startPlaying = () => {
    obstacleIdCounter = 0
    eventsRef.current = []
    moveReactionTimesRef.current = []
    pendingThreatRef.current = null
    pausedAccumRef.current = 0
    pausedAtRef.current = null
    lastSpawnLaneRef.current = null
    lastSpawnWasDoubleRef.current = false
    scriptedQueueRef.current = []
    finishedRef.current = false
    obstaclesRef.current = []
    setObstacles([])
    setPlayerLane(1)
    startedAtRef.current = performance.now()
    nextSpawnAtRef.current = performance.now() + 400
    setSurvivedDisplayMs(0)
    setStage('playing')
  }

  const isEndless = tierConfig.mode === 'endless'
  const survivedSeconds = (survivedDisplayMs / 1000).toFixed(1)
  const remainingSeconds = Math.max(0, ((tierConfig.durationMs ?? 0) - survivedDisplayMs) / 1000).toFixed(1)
  const tutorial = isEndless ? ENDLESS_TUTORIAL : FIXED_TIME_TUTORIAL
  // Short, single-clause — matches every other mini-game's GameHud objective
  // convention (see e.g. color-target-game.tsx's "지금 규칙에 맞는 색을
  // 클릭하세요."). The fuller collision-behavior explanation lives in the
  // Tutorial modal only (FIXED_TIME_TUTORIAL/ENDLESS_TUTORIAL above), not
  // duplicated here.
  const objective = isEndless
    ? '좌우로 이동해 장애물을 계속 피하세요.'
    : '좌우로 이동해 장애물을 최대한 많이 피하세요.'
  const introText = isEndless
    ? '좌우로 이동하며 떨어지는 장애물을 계속 피해보세요. 한 번이라도 부딪히면 바로 끝나요.'
    : '좌우로 이동하며 떨어지는 장애물을 제한 시간 동안 최대한 많이 피해보세요. 부딪혀도 게임은 계속돼요.'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="장애물 피하기"
        mode={mode}
        index={index}
        objective={objective}
        statusSlot={
          stage === 'playing' ? (
            isEndless ? (
              <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border" aria-label={`생존 시간 ${survivedSeconds}초`}>
                생존 {survivedSeconds}s
              </span>
            ) : (
              <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border" aria-label={`남은 시간 ${remainingSeconds}초`}>
                {remainingSeconds}s 남음
              </span>
            )
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
        onBack={onBack}
      />
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">{introText}</p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS} onDone={startPlaying} label="곧 시작해요" />
        )}

        {stage === 'playing' && (
          <div
            className={cn(
              'relative flex-1 overflow-hidden rounded-3xl toy-border toy-shadow-lg transition-colors',
              flash === 'hit' ? 'bg-destructive/25' : 'bg-card',
            )}
            style={{ height: PLAY_HEIGHT_PX }}
          >
            {/* left/right touch zones */}
            <button
              type="button"
              aria-label="왼쪽 레인으로 이동"
              className="absolute inset-y-0 left-0 z-10 w-1/2"
              onClick={() => moveTo(Math.max(0, playerLaneRef.current - 1) as Lane)}
            />
            <button
              type="button"
              aria-label="오른쪽 레인으로 이동"
              className="absolute inset-y-0 right-0 z-10 w-1/2"
              onClick={() => moveTo(Math.min(DODGE_OBSTACLE_LANE_COUNT - 1, playerLaneRef.current + 1) as Lane)}
            />

            {/* lane dividers */}
            <div className="pointer-events-none absolute inset-0 flex">
              {[0, 1].map((i) => (
                <div key={i} className="flex-1 border-r border-dashed border-foreground/15" />
              ))}
              <div className="flex-1" />
            </div>

            {obstacles.map((o) => (
              <div
                key={o.id}
                className={cn(
                  'pointer-events-none absolute grid h-10 w-10 -translate-x-1/2 place-items-center rounded-xl text-lg toy-border',
                  o.kind === 'safe' ? 'bg-chart-4' : 'bg-destructive',
                )}
                style={{
                  left: `${(o.lane + 0.5) * (100 / DODGE_OBSTACLE_LANE_COUNT)}%`,
                  top: Math.min(HIT_LINE_PX, ((performance.now() - o.spawnedAt) / 1000) * speedAt(performance.now() - startedAtRef.current - pausedAccumRef.current)),
                }}
                aria-hidden="true"
              >
                {o.kind === 'safe' ? '✓' : '⚠'}
              </div>
            ))}

            <div
              className={cn(
                'pointer-events-none absolute grid h-12 w-12 -translate-x-1/2 place-items-center rounded-2xl bg-primary text-primary-foreground toy-border transition-all duration-100',
                flash === 'dodge' && 'ring-2 ring-accent',
              )}
              style={{ left: `${(playerLane + 0.5) * (100 / DODGE_OBSTACLE_LANE_COUNT)}%`, top: HIT_LINE_PX }}
              aria-hidden="true"
            >
              🐾
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-6 text-muted-foreground">
              <ChevronLeft size={18} aria-hidden="true" />
              <ChevronRight size={18} aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="장애물 피하기"
        tutorial={tutorial}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
