'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  COLOR_TARGET_CHANGE_HIGHLIGHT_MS,
  COLOR_TARGET_GAME_DURATION_MS,
  COLOR_TARGET_INTRO_COUNTDOWN_SECONDS,
  COLOR_TARGET_OBJECT_COUNT_MAX,
  COLOR_TARGET_OBJECT_COUNT_MIN,
  COLOR_TARGET_PALETTE,
  getColorTargetChangeIntervalStagesForDifficulty,
  getColorTargetReshuffleIntervalForDifficulty,
} from '@/lib/config/color-target.config'
import { GAME_DIFFICULTIES, type GameDifficulty } from '@/lib/game/difficulty'
import type { ColorTargetClickEvent, ColorTargetRawSummary } from '@/lib/game/types'
import { calculateColorTargetScore, summarizeColorTargetEvents } from '@/lib/scoring/color-target'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing'

interface ColorTargetGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { events: ColorTargetClickEvent[]; rawSummary: ColorTargetRawSummary; gameScore: number }) => void
  onBack: () => void
}

/** 16 fixed non-overlapping slot positions (percent coordinates, 4x4 layout) — avoids real collision math while still keeping objects visually scattered (spec §5 "겹치지 않도록 배치"). */
const SLOTS = [
  { left: 12, top: 14 }, { left: 38, top: 14 }, { left: 62, top: 14 }, { left: 88, top: 14 },
  { left: 12, top: 38 }, { left: 38, top: 38 }, { left: 62, top: 38 }, { left: 88, top: 38 },
  { left: 12, top: 62 }, { left: 38, top: 62 }, { left: 62, top: 62 }, { left: 88, top: 62 },
  { left: 12, top: 86 }, { left: 38, top: 86 }, { left: 62, top: 86 }, { left: 88, top: 86 },
]

/** How long the correct/wrong click flash plays before the clicked object is swapped out. */
const CLICK_FLASH_MS = 200

interface ActiveObject {
  key: string
  colorId: string
  slotIndex: number
  scale: number
}

const TUTORIAL: TutorialContent = {
  goal: '화면 위에 뜨는 여러 색 오브젝트 중, 지금 목표 색과 같은 것만 클릭해요.',
  steps: ['상단에 표시된 목표 색을 확인하세요.', '목표 색과 같은 오브젝트만 클릭하세요.', '목표 색은 시간이 지나면 자동으로 바뀌어요.'],
  scoring: '정확도와 반응 속도를 함께 반영해요. 다른 색을 클릭하면 감점돼요.',
}

function randomObjects(targetColorId: string): ActiveObject[] {
  const count = Math.floor(
    COLOR_TARGET_OBJECT_COUNT_MIN + Math.random() * (COLOR_TARGET_OBJECT_COUNT_MAX - COLOR_TARGET_OBJECT_COUNT_MIN),
  )
  const slotOrder = [...SLOTS.keys()].sort(() => Math.random() - 0.5).slice(0, count)
  const others = COLOR_TARGET_PALETTE.filter((c) => c.id !== targetColorId)

  return slotOrder.map((slotIndex, i) => {
    // Exactly one object is ever the target color — deterministic, not a
    // per-object chance, so "목표 색이 판에 없음" can never happen and the
    // decoy density stays consistent instead of sometimes handing out 2-4
    // matches by luck.
    const colorId = i === 0 ? targetColorId : others[Math.floor(Math.random() * others.length)].id
    return { key: `${slotIndex}-${Date.now()}-${i}`, colorId, slotIndex, scale: 0.85 + Math.random() * 0.3 }
  })
}

/** "특정 색만 클릭" — new Focus-stat game (spec §5). */
export function ColorTargetGame({ index, mode, difficulty, onComplete, onBack }: ColorTargetGameProps) {
  const stat = STATS.focus
  const { play } = useSound()
  const changeIntervalStagesMs = useMemo(
    () => getColorTargetChangeIntervalStagesForDifficulty(difficulty),
    [difficulty],
  )
  const reshuffleIntervalMs = useMemo(
    () => getColorTargetReshuffleIntervalForDifficulty(difficulty),
    [difficulty],
  )
  const [stage, setStage] = useState<Stage>('intro')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [remainingMs, setRemainingMs] = useState(COLOR_TARGET_GAME_DURATION_MS)
  const [targetColorId, setTargetColorId] = useState(COLOR_TARGET_PALETTE[0].id)
  const [objects, setObjects] = useState<ActiveObject[]>([])
  const [justChanged, setJustChanged] = useState(false)
  const [lastClick, setLastClick] = useState<{ key: string; correct: boolean } | null>(null)

  const eventsRef = useRef<ColorTargetClickEvent[]>([])
  const targetChangesRef = useRef(0)
  const targetSetAtRef = useRef(0)
  const hasHitSinceChangeRef = useRef(false)
  const elapsedMsRef = useRef(0)

  const changeIntervalMs = () => {
    const stageIndex = Math.min(
      changeIntervalStagesMs.length - 1,
      Math.floor((elapsedMsRef.current / COLOR_TARGET_GAME_DURATION_MS) * changeIntervalStagesMs.length),
    )
    return changeIntervalStagesMs[stageIndex]
  }

  const pickNewTarget = (isFirst: boolean) => {
    if (!isFirst && !hasHitSinceChangeRef.current) {
      eventsRef.current.push({
        kind: 'missed',
        colorId: targetColorId,
        targetColorId,
        reactionTimeMs: null,
        createdAt: new Date().toISOString(),
      })
    }
    // Never repeat the immediately-previous target color (spec §5: "직전 색과 연속되지 않도록").
    const candidates = isFirst ? COLOR_TARGET_PALETTE : COLOR_TARGET_PALETTE.filter((c) => c.id !== targetColorId)
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    setTargetColorId(next.id)
    setObjects(randomObjects(next.id))
    targetSetAtRef.current = performance.now()
    hasHitSinceChangeRef.current = false
    targetChangesRef.current += 1
    setJustChanged(true)
    window.setTimeout(() => setJustChanged(false), COLOR_TARGET_CHANGE_HIGHLIGHT_MS)
  }

  const finish = () => {
    const rawSummary = summarizeColorTargetEvents(eventsRef.current, targetChangesRef.current)
    const gameScore = calculateColorTargetScore(rawSummary)
    onComplete({ events: eventsRef.current, rawSummary, gameScore })
  }

  // Main game clock: ticks down remainingMs. Paused entirely while the tutorial is open. Completion itself is handled by the single dedicated effect below (keyed on remainingMs reaching 0) so onComplete can never fire twice.
  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen || remainingMs <= 0) return
    const t = window.setInterval(() => {
      elapsedMsRef.current += 100
      setRemainingMs((ms) => Math.max(0, ms - 100))
    }, 100)
    return () => window.clearInterval(t)
  }, [stage, tutorialOpen, remainingMs])

  useEffect(() => {
    if (stage !== 'playing' || remainingMs <= 0) return
    if (tutorialOpen) return
    const t = window.setTimeout(() => pickNewTarget(false), changeIntervalMs())
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reschedules purely off targetColorId changing (a full "target change" tick)
  }, [targetColorId, stage, tutorialOpen])

  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen) return
    const t = window.setInterval(() => setObjects(randomObjects(targetColorId)), reshuffleIntervalMs)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetColorId read fresh via closure is fine; only stage/tutorialOpen should restart this interval
  }, [stage, tutorialOpen, reshuffleIntervalMs])

  useEffect(() => {
    if (remainingMs <= 0 && stage === 'playing') finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs])

  const startGame = () => setStage('countdown')
  const startPlaying = () => {
    elapsedMsRef.current = 0
    targetChangesRef.current = 0
    eventsRef.current = []
    setRemainingMs(COLOR_TARGET_GAME_DURATION_MS)
    setStage('playing')
    pickNewTarget(true)
  }

  const handleClick = (obj: ActiveObject) => {
    if (stage !== 'playing') return
    const correct = obj.colorId === targetColorId
    const reactionTimeMs = correct ? Math.round(performance.now() - targetSetAtRef.current) : null
    play(correct ? 'answer-correct' : 'wrong')
    eventsRef.current.push({
      kind: correct ? 'correct' : 'wrong',
      colorId: obj.colorId,
      targetColorId,
      reactionTimeMs,
      createdAt: new Date().toISOString(),
    })
    if (correct) hasHitSinceChangeRef.current = true
    setLastClick({ key: obj.key, correct })
    window.setTimeout(() => {
      setLastClick((c) => (c?.key === obj.key ? null : c))
      // Spawn a fresh target-color object right after the flash instead of
      // waiting up to COLOR_TARGET_RESHUFFLE_INTERVAL_MS for the next
      // periodic reshuffle — otherwise the board could sit with zero
      // matching objects for up to 1.4s right after the only one is found.
      if (correct) setObjects(randomObjects(targetColorId))
    }, CLICK_FLASH_MS)
  }

  const targetMeta = COLOR_TARGET_PALETTE.find((c) => c.id === targetColorId) ?? COLOR_TARGET_PALETTE[0]
  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="특정 색만 클릭"
        mode={mode}
        index={index}
        objective="목표 색과 같은 오브젝트만 클릭하세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border" aria-label={`남은 시간 ${secondsLeft}초`}>
              {secondsLeft}s
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
              목표 색과 같은 오브젝트만 빠르게 클릭하세요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={COLOR_TARGET_INTRO_COUNTDOWN_SECONDS} onDone={startPlaying} label="곧 시작해요" />
        )}

        {stage === 'playing' && (
          <div className="flex flex-1 flex-col rounded-3xl bg-card px-4 py-4 toy-border toy-shadow-lg">
            <div
              className={cn(
                'mx-auto flex items-center gap-2 rounded-2xl px-4 py-2 transition-transform',
                justChanged && 'scale-110',
              )}
              style={{ backgroundColor: `var(${targetMeta.colorVar})` }}
            >
              <span className="text-lg" aria-hidden="true">{targetMeta.symbol}</span>
              <span className="font-display text-sm font-extrabold text-[color:var(--ink)]">목표 색</span>
            </div>

            <div className="relative mt-3 flex-1 overflow-hidden rounded-2xl bg-secondary/40" style={{ minHeight: 300 }}>
              {objects.map((obj) => {
                const meta = COLOR_TARGET_PALETTE.find((c) => c.id === obj.colorId)!
                const slot = SLOTS[obj.slotIndex]
                const flash = lastClick?.key === obj.key
                return (
                  <button
                    key={obj.key}
                    type="button"
                    onClick={() => handleClick(obj)}
                    aria-label={`${meta.symbol} 오브젝트`}
                    className={cn(
                      'absolute grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-lg font-bold text-[color:var(--ink)] toy-border transition-transform',
                      flash && (lastClick?.correct ? 'scale-125' : 'scale-90'),
                    )}
                    style={{
                      left: `${slot.left}%`,
                      top: `${slot.top}%`,
                      backgroundColor: `var(${meta.colorVar})`,
                      transform: `translate(-50%, -50%) scale(${obj.scale})`,
                    }}
                  >
                    {meta.symbol}
                  </button>
                )
              })}
            </div>
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
