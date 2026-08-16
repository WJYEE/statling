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
  DODGE_OBSTACLE_DOUBLE_SPAWN_UNLOCK_MS,
  DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS,
  DODGE_OBSTACLE_LANE_COUNT,
  DODGE_OBSTACLE_SCRIPTED_PATTERN_CHANCE,
  DODGE_OBSTACLE_SCRIPTED_PATTERN_UNLOCK_MS,
  dodgeObstacleSpawnIntervalAt,
  dodgeObstacleSpeedAt,
  getDodgeObstacleTierConfig,
} from '@/lib/config/dodge-obstacle.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickDefaultSpawn, pickScriptedPattern, type DodgeLane } from '@/lib/game/dodge-obstacle-patterns'
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
}

const PLAY_HEIGHT_PX = 380
const HIT_LINE_PX = PLAY_HEIGHT_PX - 64

const TUTORIAL: TutorialContent = {
  goal: '좌우로 이동하며 위에서 떨어지는 장애물을 계속 피해요. 끝없이 이어지는 생존 모드예요.',
  steps: ['화면 왼쪽/오른쪽을 탭하면 그쪽 레인으로 이동해요.', '키보드 좌우 화살표로도 이동할 수 있어요.', '장애물에 한 번이라도 부딪히면 그 즉시 끝나요. 시간이 지날수록 점점 빨라져요.'],
  scoring: '회피율, 반응 속도, 생존 시간을 함께 반영해요.',
}

let obstacleIdCounter = 0

/**
 * "장애물 피하기" — the app's one true endless/survival mini-game (2026-08
 * rework). No fixed session length: a run keeps going, ramping speed/spawn
 * rate every second, until the very first collision ends it. Difficulty
 * only ever changes the starting speed/spawn interval and how fast both
 * ramp — see lib/config/dodge-obstacle.config.ts.
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
  const finishedRef = useRef(false)

  useEffect(() => {
    playerLaneRef.current = playerLane
  }, [playerLane])

  const finish = (survivedMs: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setStage('ended')
    const rawSummary = summarizeDodgeObstacleEvents(eventsRef.current, survivedMs, moveReactionTimesRef.current)
    const gameScore = calculateDodgeObstacleScore(rawSummary)
    onComplete({ events: eventsRef.current, rawSummary, gameScore })
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
    let lanesToSpawn: Lane[]

    if (scriptedQueueRef.current.length > 0) {
      lanesToSpawn = scriptedQueueRef.current.shift() as Lane[]
    } else {
      const canDouble = elapsedMs >= DODGE_OBSTACLE_DOUBLE_SPAWN_UNLOCK_MS
      const scriptedEligible = elapsedMs >= DODGE_OBSTACLE_SCRIPTED_PATTERN_UNLOCK_MS
      if (scriptedEligible && Math.random() < DODGE_OBSTACLE_SCRIPTED_PATTERN_CHANCE) {
        const pattern = pickScriptedPattern()
        // Spawn this tick's first step now, queue the rest for the following ticks.
        lanesToSpawn = pattern[0]
        scriptedQueueRef.current = pattern.slice(1)
      } else {
        lanesToSpawn = pickDefaultSpawn({ canDouble, lastLane: lastSpawnLaneRef.current })
      }
    }
    lastSpawnLaneRef.current = lanesToSpawn[0]

    const now = performance.now()
    const newObstacles = lanesToSpawn.map((lane) => ({ id: obstacleIdCounter++, lane, spawnedAt: now, resolved: false }))
    setObstacles((prev) => [...prev, ...newObstacles])

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
      if (tutorialOpen) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      const now = performance.now()
      const elapsed = now - startedAtRef.current - pausedAccumRef.current
      setSurvivedDisplayMs(elapsed)

      if (now >= nextSpawnAtRef.current) {
        spawnObstacle(elapsed)
        nextSpawnAtRef.current = now + spawnIntervalAt(elapsed)
      }

      let collisionSurvivedMs: number | null = null

      setObstacles((prev) => {
        const speed = speedAt(elapsed)
        let changed = false
        const next = prev.map((o) => {
          if (o.resolved) return o
          const y = ((now - o.spawnedAt) / 1000) * speed
          if (y >= HIT_LINE_PX) {
            changed = true
            const collided = o.lane === playerLaneRef.current
            eventsRef.current.push({ kind: collided ? 'collided' : 'dodged', lane: o.lane, atMs: elapsed })
            if (collided) {
              play('wrong')
              if (now - lastCollisionAtRef.current > DODGE_OBSTACLE_COLLISION_COOLDOWN_MS) {
                lastCollisionAtRef.current = now
                setFlash('hit')
              }
              // First collision ends the run — capture elapsed now, finish() is called once after this state update settles.
              if (collisionSurvivedMs === null) collisionSurvivedMs = elapsed
            } else {
              play('answer-correct')
              setFlash((f) => f ?? 'dodge')
              window.setTimeout(() => setFlash((f) => (f === 'dodge' ? null : f)), 150)
            }
            return { ...o, resolved: true }
          }
          return o
        })
        // Drop long-resolved obstacles so the array doesn't grow unbounded over a long run.
        const trimmed = next.filter((o) => now - o.spawnedAt < 4000)
        return changed || trimmed.length !== prev.length ? trimmed : prev
      })

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
    scriptedQueueRef.current = []
    finishedRef.current = false
    setObstacles([])
    setPlayerLane(1)
    startedAtRef.current = performance.now()
    nextSpawnAtRef.current = performance.now() + 400
    setSurvivedDisplayMs(0)
    setStage('playing')
  }

  const survivedSeconds = (survivedDisplayMs / 1000).toFixed(1)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="장애물 피하기"
        mode={mode}
        index={index}
        objective="좌우로 이동해 장애물을 계속 피하세요. 한 번이라도 부딪히면 끝나요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border" aria-label={`생존 시간 ${survivedSeconds}초`}>
              생존 {survivedSeconds}s
            </span>
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
        onBack={onBack}
      />
      <p className="-mt-2 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              좌우로 이동하며 떨어지는 장애물을 계속 피해보세요. 한 번이라도 부딪히면 바로 끝나요.
            </p>
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
                className="pointer-events-none absolute grid h-10 w-10 -translate-x-1/2 place-items-center rounded-xl bg-destructive text-lg toy-border"
                style={{
                  left: `${(o.lane + 0.5) * (100 / DODGE_OBSTACLE_LANE_COUNT)}%`,
                  top: Math.min(HIT_LINE_PX, ((performance.now() - o.spawnedAt) / 1000) * speedAt(performance.now() - startedAtRef.current - pausedAccumRef.current)),
                }}
                aria-hidden="true"
              >
                ⚠
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
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
