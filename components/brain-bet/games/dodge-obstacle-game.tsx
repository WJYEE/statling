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
  DODGE_OBSTACLE_DURATION_MS,
  DODGE_OBSTACLE_INTRO_COUNTDOWN_SECONDS,
  DODGE_OBSTACLE_LANE_COUNT,
  getDodgeObstacleSpawnIntervalForDifficulty,
  getDodgeObstacleSpeedForDifficulty,
} from '@/lib/config/dodge-obstacle.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import type { DodgeObstacleEvent, DodgeObstacleRawSummary } from '@/lib/game/types'
import { calculateDodgeObstacleScore, summarizeDodgeObstacleEvents } from '@/lib/scoring/dodge-obstacle'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing' | 'ended'
type Lane = 0 | 1 | 2

interface Obstacle {
  id: number
  lane: Lane
  spawnedAt: number
  resolved: boolean
}

const PLAY_HEIGHT_PX = 380
const HIT_LINE_PX = PLAY_HEIGHT_PX - 64

const TUTORIAL: TutorialContent = {
  goal: '좌우로 이동하며 위에서 떨어지는 장애물을 피해요.',
  steps: ['화면 왼쪽/오른쪽을 탭하면 그쪽 레인으로 이동해요.', '키보드 좌우 화살표로도 이동할 수 있어요.', '장애물과 부딪히지 않도록 미리 레인을 옮기세요.'],
  scoring: '회피한 개수, 충돌 횟수, 생존 시간을 함께 반영해요.',
}

let obstacleIdCounter = 0

/** "장애물 피하기" — new Reaction-stat game (spec §6). 3-lane dodge-run, ramping speed/spawn-rate, always leaving at least one open lane. */
export function DodgeObstacleGame({
  index,
  mode,
  difficulty,
  onComplete,
}: {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { events: DodgeObstacleEvent[]; rawSummary: DodgeObstacleRawSummary; gameScore: number }) => void
}) {
  const stat = STATS.reaction
  const { play } = useSound()
  const speed = useMemo(() => getDodgeObstacleSpeedForDifficulty(difficulty), [difficulty])
  const spawnInterval = useMemo(() => getDodgeObstacleSpawnIntervalForDifficulty(difficulty), [difficulty])
  const [stage, setStage] = useState<Stage>('intro')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [playerLane, setPlayerLane] = useState<Lane>(1)
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [remainingMs, setRemainingMs] = useState(DODGE_OBSTACLE_DURATION_MS)
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

  useEffect(() => {
    playerLaneRef.current = playerLane
  }, [playerLane])

  const finish = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setStage('ended')
    const survivedMs = DODGE_OBSTACLE_DURATION_MS
    const rawSummary = summarizeDodgeObstacleEvents(eventsRef.current, survivedMs, moveReactionTimesRef.current)
    const gameScore = calculateDodgeObstacleScore(rawSummary, survivedMs)
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
    const canDouble = elapsedMs >= DODGE_OBSTACLE_DOUBLE_SPAWN_UNLOCK_MS && Math.random() < 0.3
    const allLanes: Lane[] = [0, 1, 2]
    let lanesToSpawn: Lane[]

    if (canDouble) {
      const shuffled = [...allLanes].sort(() => Math.random() - 0.5)
      lanesToSpawn = shuffled.slice(0, 2) // always leaves exactly one lane open
    } else {
      const candidates = allLanes.filter((l) => l !== lastSpawnLaneRef.current)
      const pool = candidates.length > 0 ? candidates : allLanes
      lanesToSpawn = [pool[Math.floor(Math.random() * pool.length)]]
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

  const speedAt = (elapsedMs: number) => {
    const ratio = Math.min(1, elapsedMs / DODGE_OBSTACLE_DURATION_MS)
    return speed.start + ratio * (speed.end - speed.start)
  }

  const spawnIntervalAt = (elapsedMs: number) => {
    const ratio = Math.min(1, elapsedMs / DODGE_OBSTACLE_DURATION_MS)
    return spawnInterval.start + ratio * (spawnInterval.end - spawnInterval.start)
  }

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
      const remaining = Math.max(0, DODGE_OBSTACLE_DURATION_MS - elapsed)
      setRemainingMs(remaining)

      if (now >= nextSpawnAtRef.current) {
        spawnObstacle(elapsed)
        nextSpawnAtRef.current = now + spawnIntervalAt(elapsed)
      }

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
            play(collided ? 'wrong' : 'answer-correct')
            if (collided && now - lastCollisionAtRef.current > DODGE_OBSTACLE_COLLISION_COOLDOWN_MS) {
              lastCollisionAtRef.current = now
              setFlash('hit')
              window.setTimeout(() => setFlash(null), 200)
            } else if (!collided) {
              setFlash((f) => f ?? 'dodge')
              window.setTimeout(() => setFlash((f) => (f === 'dodge' ? null : f)), 150)
            }
            return { ...o, resolved: true }
          }
          return o
        })
        // Drop long-resolved obstacles so the array doesn't grow unbounded over a 35s session.
        const trimmed = next.filter((o) => now - o.spawnedAt < 4000)
        return changed || trimmed.length !== prev.length ? trimmed : prev
      })

      if (remaining <= 0) {
        finish()
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally a single long-lived rAF loop for the 'playing' stage; tutorialOpen is read fresh each frame via closure
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
    setObstacles([])
    setPlayerLane(1)
    startedAtRef.current = performance.now()
    nextSpawnAtRef.current = performance.now() + 400
    setRemainingMs(DODGE_OBSTACLE_DURATION_MS)
    setStage('playing')
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="장애물 피하기"
        mode={mode}
        index={index}
        objective="좌우로 이동해 장애물을 피하세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border" aria-label={`남은 시간 ${secondsLeft}초`}>
              {secondsLeft}s
            </span>
          ) : undefined
        }
        onHelp={() => setTutorialOpen(true)}
      />
      <p className="-mt-2 text-xs font-semibold text-muted-foreground">{GAME_DIFFICULTIES[difficulty].hint}</p>

      <div className="mt-5 flex flex-1 flex-col">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl bg-card px-6 py-12 text-center toy-border toy-shadow-lg">
            <p className="font-display text-lg font-bold leading-snug text-foreground">
              좌우로 이동하며 떨어지는 장애물을 피해보세요.
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
