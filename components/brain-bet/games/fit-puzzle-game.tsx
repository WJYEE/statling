'use client'

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { GameCountdown } from '@/components/brain-bet/games/shared/game-countdown'
import { GameHud } from '@/components/brain-bet/games/shared/game-hud'
import { GameTutorialModal, type TutorialContent } from '@/components/brain-bet/games/shared/game-tutorial-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { STATS } from '@/lib/brain-bet'
import {
  FIT_PUZZLE_CELL_SIZE_PX,
  FIT_PUZZLE_INTRO_COUNTDOWN_SECONDS,
  getFitPuzzleSnapToleranceForDifficulty,
} from '@/lib/config/fit-puzzle.config'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import type { GameDifficulty } from '@/lib/game/difficulty'
import { pickFitPuzzleSession, finalFootprint, type PuzzlePieceSpec } from '@/lib/game/puzzle-levels'
import type { FitPuzzleRoundResult, FitPuzzleRawSummary } from '@/lib/game/types'
import { calculateFitPuzzleScore, summarizeFitPuzzleRounds } from '@/lib/scoring/fit-puzzle'
import { cn } from '@/lib/utils'
import { useSound } from '@/hooks/use-sound'

type Stage = 'intro' | 'countdown' | 'playing'

interface PieceState {
  spec: PuzzlePieceSpec
  rotation: 0 | 90 | 180 | 270
  x: number
  y: number
  placed: boolean
}

interface FitPuzzleGameProps {
  index: number
  mode: 'first' | 'free'
  difficulty: GameDifficulty
  onComplete: (payload: { rounds: FitPuzzleRoundResult[]; rawSummary: FitPuzzleRawSummary; gameScore: number }) => void
  onBack: () => void
}

const TUTORIAL: TutorialContent = {
  goal: '퍼즐 조각을 드래그해서 빈 공간(점선 테두리)에 알맞게 끼워요.',
  steps: ['조각을 손가락으로 끌어 빈 공간 위로 옮기세요.', '조각을 탭하면 회전 버튼이 나타나요. 눌러서 90도씩 돌리세요. (PC에서는 조각을 우클릭해도 돌릴 수 있어요)', '방향과 위치가 맞으면 자동으로 딸깍 끼워져요.'],
  scoring: '정확한 배치 수, 완성 시간, 불필요한 조작 횟수를 함께 반영해요.',
}

function footprintPx(widthCells: number, heightCells: number) {
  return { w: widthCells * FIT_PUZZLE_CELL_SIZE_PX, h: heightCells * FIT_PUZZLE_CELL_SIZE_PX }
}

/** The piece's on-screen footprint at its current (live, user-controlled) rotation — width/height simply swap at 90°/270°, no CSS transform needed. */
function renderedFootprint(piece: PieceState) {
  const swapped = piece.rotation === 90 || piece.rotation === 270
  const width = swapped ? piece.spec.heightCells : piece.spec.widthCells
  const height = swapped ? piece.spec.widthCells : piece.spec.heightCells
  return footprintPx(width, height)
}

/** "퍼즐 끼우기" — new Spatial-stat game (spec §8). Pointer-based drag (works uniformly for mouse + touch via Pointer Events + setPointerCapture), tap-to-select + rotate button, target-zone (not pixel-perfect) snap detection with generous tolerance. */
export function FitPuzzleGame({ index, mode, difficulty, onComplete, onBack }: FitPuzzleGameProps) {
  const stat = STATS.spatial
  const { play } = useSound()
  const snapToleranceRef = useRef(getFitPuzzleSnapToleranceForDifficulty(difficulty))
  const [levels] = useState(() => pickFitPuzzleSession(difficulty))
  const [stage, setStage] = useState<Stage>('intro')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [levelIndex, setLevelIndex] = useState(0)
  const [pieces, setPieces] = useState<PieceState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [roundResults, setRoundResults] = useState<FitPuzzleRoundResult[]>([])
  const [roundRotations, setRoundRotations] = useState(0)
  const [roundMisplacements, setRoundMisplacements] = useState(0)

  const roundStartRef = useRef(0)
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const arenaRef = useRef<HTMLDivElement>(null)

  const level = levels[levelIndex]
  const boardWidthPx = level.boardCols * FIT_PUZZLE_CELL_SIZE_PX
  const boardHeightPx = level.boardRows * FIT_PUZZLE_CELL_SIZE_PX
  const trayTopPx = boardHeightPx + 24
  /**
   * The tallest a tray piece can render — a piece can be rotated while still
   * sitting in the tray (see rotateSelected, not gated to "after placement"),
   * which swaps its width/height, so the row must reserve enough height for
   * whichever of a piece's two dimensions ends up "tall," not just its
   * resting rotation-0 height. Mirrors layoutPieces' own `Math.max(w, h)`
   * horizontal-spacing logic just below, applied to the vertical axis
   * instead — previously this was a flat `90` regardless of piece size,
   * which clipped any piece (or in-tray rotation) taller than ~82px.
   */
  const trayPieceMaxSpanPx = Math.max(
    FIT_PUZZLE_CELL_SIZE_PX,
    ...level.pieces.map((p) => Math.max(p.widthCells, p.heightCells) * FIT_PUZZLE_CELL_SIZE_PX),
  )
  const arenaHeightPx = trayTopPx + 8 + trayPieceMaxSpanPx + 16

  const layoutPieces = (lvl: typeof level): PieceState[] => {
    let trayX = 8
    return lvl.pieces.map((spec) => {
      const { w, h } = footprintPx(spec.widthCells, spec.heightCells)
      const state: PieceState = { spec, rotation: 0, x: trayX, y: trayTopPx + 8, placed: false }
      trayX += Math.max(w, h) + 16
      return state
    })
  }

  const startGame = () => setStage('countdown')

  const startLevel = (lvlIndex: number) => {
    const lvl = levels[lvlIndex]
    setLevelIndex(lvlIndex)
    setPieces(layoutPieces(lvl))
    setSelectedId(null)
    setRoundRotations(0)
    setRoundMisplacements(0)
    setRemainingMs(lvl.timeLimitSeconds * 1000)
    roundStartRef.current = performance.now()
    setStage('playing')
  }

  const finishRound = (completed: boolean) => {
    const correctPlacements = pieces.filter((p) => p.placed).length
    const result: FitPuzzleRoundResult = {
      roundIndex: levelIndex,
      pieceCount: level.pieces.length,
      correctPlacements,
      misplacements: roundMisplacements,
      rotations: roundRotations,
      completed,
      completionMs: Math.round(performance.now() - roundStartRef.current),
    }
    const updated = [...roundResults, result]
    setRoundResults(updated)

    if (levelIndex + 1 < levels.length) {
      startLevel(levelIndex + 1)
    } else {
      const rawSummary = summarizeFitPuzzleRounds(updated)
      const totalTimeLimitMs = levels.reduce((s, l) => s + l.timeLimitSeconds * 1000, 0)
      const gameScore = calculateFitPuzzleScore(rawSummary, totalTimeLimitMs)
      onComplete({ rounds: updated, rawSummary, gameScore })
    }
  }

  // Per-level countdown, paused while the tutorial is open.
  useEffect(() => {
    if (stage !== 'playing' || tutorialOpen) return
    if (remainingMs <= 0) {
      finishRound(false)
      return
    }
    const t = window.setTimeout(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishRound reads latest pieces/round counters via closure recreated each render
  }, [stage, remainingMs, tutorialOpen])

  // Auto-advance the instant every piece in the level is placed.
  useEffect(() => {
    if (stage !== 'playing' || pieces.length === 0) return
    if (pieces.every((p) => p.placed)) finishRound(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-checks when `pieces` changes
  }, [pieces])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (tutorialOpen) return
    const piece = pieces.find((p) => p.spec.id === id)
    if (!piece || piece.placed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = { id, offsetX: e.clientX - piece.x, offsetY: e.clientY - piece.y }
    setSelectedId(id)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current
    if (!drag || drag.id !== (e.currentTarget.dataset.pieceId ?? '')) return
    const x = e.clientX - drag.offsetX
    const y = e.clientY - drag.offsetY
    setPieces((prev) => prev.map((p) => (p.spec.id === drag.id ? { ...p, x, y } : p)))
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const drag = draggingRef.current
    draggingRef.current = null
    if (!drag || drag.id !== id) return

    setPieces((prev) => {
      const piece = prev.find((p) => p.spec.id === id)
      if (!piece) return prev
      const footprint = renderedFootprint(piece)
      const pieceCenter = { x: piece.x + footprint.w / 2, y: piece.y + footprint.h / 2 }

      let bestTarget: { spec: PuzzlePieceSpec; distance: number } | null = null
      for (const p of prev) {
        const { width, height } = finalFootprint(p.spec)
        const targetCenter = {
          x: p.spec.targetCol * FIT_PUZZLE_CELL_SIZE_PX + (width * FIT_PUZZLE_CELL_SIZE_PX) / 2,
          y: p.spec.targetRow * FIT_PUZZLE_CELL_SIZE_PX + (height * FIT_PUZZLE_CELL_SIZE_PX) / 2,
        }
        const distance = Math.hypot(pieceCenter.x - targetCenter.x, pieceCenter.y - targetCenter.y)
        if (distance <= snapToleranceRef.current && (!bestTarget || distance < bestTarget.distance)) {
          bestTarget = { spec: p.spec, distance }
        }
      }

      if (!bestTarget) return prev // dropped in open space — no penalty, stays where released

      const targetSpec = bestTarget.spec
      const alreadyFilled = prev.some((p) => p.spec.id === targetSpec.id && p.placed)
      const rotationMatches = piece.rotation % 180 === targetSpec.correctRotation
      const isRightTarget = targetSpec.id === piece.spec.id

      if (isRightTarget && rotationMatches && !alreadyFilled) {
        const snappedX = targetSpec.targetCol * FIT_PUZZLE_CELL_SIZE_PX
        const snappedY = targetSpec.targetRow * FIT_PUZZLE_CELL_SIZE_PX
        play('answer-correct')
        return prev.map((p) => (p.spec.id === id ? { ...p, placed: true, x: snappedX, y: snappedY } : p))
      }

      play('wrong')
      setRoundMisplacements((n) => n + 1)
      // Bounce back to the tray.
      const trayIndex = level.pieces.findIndex((p) => p.id === id)
      const trayX = 8 + trayIndex * (Math.max(footprint.w, footprint.h) + 16)
      return prev.map((p) => (p.spec.id === id ? { ...p, x: trayX, y: trayTopPx + 8 } : p))
    })
  }

  /** Rotates one specific piece 90° — used by both the tap-to-select rotate button (mobile-first, still the primary control) and PC's right-click shortcut (see the piece's onContextMenu below). Whichever input triggered it, the resulting rotation feeds the exact same placement judgment in handlePointerUp. */
  const rotatePiece = (id: string) => {
    const piece = pieces.find((p) => p.spec.id === id)
    if (!piece || piece.placed) return
    setRoundRotations((n) => n + 1)
    setPieces((prev) =>
      prev.map((p) => (p.spec.id === id ? { ...p, rotation: (((p.rotation + 90) % 360) as 0 | 90 | 180 | 270) } : p)),
    )
  }

  const rotateSelected = () => {
    if (!selectedId) return
    rotatePiece(selectedId)
  }

  /** PC: right-click a piece to rotate it (Hard/Extreme lean on this the most, since more of their pieces start needing rotation — see puzzle-levels.ts's tier pools) — blocks the browser context menu only over a piece, not page-wide. */
  const handlePieceContextMenu = (e: ReactMouseEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    if (tutorialOpen) return
    setSelectedId(id)
    rotatePiece(id)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const selectedPiece = pieces.find((p) => p.spec.id === selectedId)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <GameHud
        stat={stat}
        gameName="퍼즐 끼우기"
        mode={mode}
        index={index}
        objective="조각을 끌어 빈 공간에 맞게 끼우세요."
        statusSlot={
          stage === 'playing' ? (
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground toy-border">
              {levelIndex + 1} / {levels.length} · {secondsLeft}s
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
              조각을 끌어 빈 공간에 맞게 끼워보세요. 일부는 회전이 필요해요.
            </p>
            <ToyButton onClick={startGame}>시작하기</ToyButton>
          </div>
        )}

        {stage === 'countdown' && (
          <GameCountdown seconds={FIT_PUZZLE_INTRO_COUNTDOWN_SECONDS} onDone={() => startLevel(0)} label="곧 시작해요" />
        )}

        {stage === 'playing' && (
          <div className="flex flex-1 flex-col items-center rounded-3xl bg-card px-4 py-5 toy-border toy-shadow-lg">
            {/* Board + tray are laid out with absolute-pixel geometry (see layoutPieces/footprintPx)
                that can exceed a 375px-wide screen once several pieces are queued in the tray —
                wrapping in a horizontally scrollable strip keeps every piece reachable on mobile
                instead of silently rendering off-canvas. Inert on desktop, where content already fits.
                Setting overflow-x here also computes this element's overflow-y to 'auto' per the CSS
                spec (an x/y overflow pair can't mix 'visible' with anything else) — arenaHeightPx
                above is sized to the tallest piece the current level can ever render (any rotation
                included), so that vertical auto-scroll is never actually needed; it exists purely as
                a safety net, not the primary fit mechanism. */}
            <div className="w-full overflow-x-auto">
              <div
                ref={arenaRef}
                className="relative mx-auto"
                style={{ width: Math.max(boardWidthPx, 280), height: arenaHeightPx }}
              >
                {/* board */}
                <div
                  className="absolute rounded-xl bg-secondary/50"
                  style={{ width: boardWidthPx, height: boardHeightPx, left: 0, top: 0 }}
                >
                  {level.pieces.map((spec) => {
                    const { width, height } = finalFootprint(spec)
                    return (
                      <div
                        key={spec.id}
                        className="absolute rounded-lg border-2 border-dashed border-foreground/30"
                        style={{
                          width: width * FIT_PUZZLE_CELL_SIZE_PX - 4,
                          height: height * FIT_PUZZLE_CELL_SIZE_PX - 4,
                          left: spec.targetCol * FIT_PUZZLE_CELL_SIZE_PX + 2,
                          top: spec.targetRow * FIT_PUZZLE_CELL_SIZE_PX + 2,
                        }}
                      />
                    )
                  })}
                </div>

                {/* rotate button, anchored just above the selected (undropped) piece */}
                {selectedPiece && !selectedPiece.placed && (
                  <button
                    type="button"
                    onClick={rotateSelected}
                    aria-label="선택한 조각 90도 회전"
                    className="absolute z-20 grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground toy-border toy-shadow-sm"
                    style={{ left: selectedPiece.x + renderedFootprint(selectedPiece).w / 2 - 18, top: selectedPiece.y - 44 }}
                  >
                    <RotateCw size={16} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                )}

                {pieces.map((piece) => {
                  const { w, h } = renderedFootprint(piece)
                  return (
                    <div
                      key={piece.spec.id}
                      data-piece-id={piece.spec.id}
                      onPointerDown={(e) => handlePointerDown(e, piece.spec.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={(e) => handlePointerUp(e, piece.spec.id)}
                      onContextMenu={(e) => handlePieceContextMenu(e, piece.spec.id)}
                      role="button"
                      tabIndex={piece.placed ? -1 : 0}
                      aria-label={`퍼즐 조각 ${piece.spec.id}${piece.placed ? ' (배치 완료)' : ''}`}
                      className={cn(
                        'absolute touch-none rounded-lg toy-border transition-shadow',
                        piece.placed ? 'cursor-default' : 'toy-shadow cursor-grab active:cursor-grabbing',
                        selectedId === piece.spec.id && !piece.placed && 'ring-2 ring-accent',
                      )}
                      style={{ width: w - 4, height: h - 4, left: piece.x + 2, top: piece.y + 2, backgroundColor: piece.spec.color }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <GameTutorialModal
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        gameName="퍼즐 끼우기"
        tutorial={TUTORIAL}
        continueLabel={stage === 'intro' ? '시작하기' : '계속하기'}
      />
    </div>
  )
}
