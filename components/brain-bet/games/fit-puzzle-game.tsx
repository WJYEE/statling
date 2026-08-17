'use client'

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
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
import {
  finalCells,
  finalFootprint,
  pickFitPuzzleSession,
  rotationMatchesTarget,
  type PuzzleLevel,
  type PuzzlePieceSpec,
} from '@/lib/game/puzzle-levels'
import { rotateCells, type CellCoord } from '@/lib/game/spatial-shapes'
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
  /** Its scattered tray position — where a wrong drop bounces back to (see handlePointerUp), fixed once per level in layoutPieces. */
  homeX: number
  homeY: number
  placed: boolean
  /** Stacking order — bumped to the current top on pick-up so the piece being dragged/tapped is never hidden under others in the pile (2026-08 QA: "겹칠 수 있으나 클릭한 조각이 맨 위로"). */
  zIndex: number
}

/** The piece's cells at its current (live, user-controlled) rotation — this is what per-cell rendering draws, so a piece always reads as its real polyomino silhouette instead of a solid bounding-box block. */
function currentCells(piece: PieceState): CellCoord[] {
  return rotateCells(piece.spec.cells, piece.rotation)
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
  scoring: '완성 시간을 가장 중요하게 보고, 회전을 얼마나 효율적으로 썼는지도 함께 반영해요.',
}

function footprintPx(widthCells: number, heightCells: number, cellPx: number) {
  return { w: widthCells * cellPx, h: heightCells * cellPx }
}

/** The piece's on-screen footprint at its current (live, user-controlled) rotation — width/height simply swap at 90°/270°, no CSS transform needed. */
function renderedFootprint(piece: PieceState, cellPx: number) {
  const swapped = piece.rotation === 90 || piece.rotation === 270
  const width = swapped ? piece.spec.heightCells : piece.spec.widthCells
  const height = swapped ? piece.spec.widthCells : piece.spec.heightCells
  return footprintPx(width, height, cellPx)
}

/**
 * 2026-08 QA 3차 보정: the previous fix (shrink cellPx against a flat
 * MAX_ARENA_HEIGHT_PX=460 guess) capped every level at the same height
 * regardless of the player's ACTUAL viewport — on a tall monitor this left
 * a large dead zone below the card while somehow still not fully solving
 * short-viewport scrolling. Replaced with a real measurement: the caller
 * passes the actual available width/height (viewport minus the measured
 * header block and known fixed chrome — see useAvailableArenaSize below),
 * and this solves for the largest cellPx that fits BOTH budgets at once, so
 * a roomy screen gets full-size (or larger-than-before) pieces with zero
 * wasted space, and only a genuinely short/narrow viewport shrinks.
 *
 * The tray also changed shape: instead of one long horizontal row (which is
 * what forced horizontal scrolling once a level had several/wide pieces —
 * see 퍼즐 조각 산재 배치 below), pieces now scatter into a grid of
 * `trayCols` × `trayRows` slots sized to the level's own largest piece
 * (`TRAY_SLOT_PADDING_RATIO` gives each slot ~30% headroom over the piece
 * itself for jitter, still without permitting full occlusion). `trayCols`
 * is derived purely from cell-COUNT ratios (board cols ÷ slot cells), so it
 * doesn't depend on the cellPx this function is solving for.
 */
const MIN_CELL_SCALE = 0.55
const TRAY_SLOT_PADDING_RATIO = 1.3
/** Board→tray gap, in cell units (so it scales with cellPx like everything else). */
const BOARD_TRAY_GAP_CELLS = 0.5

interface ArenaMetrics {
  cellPx: number
  boardWidthPx: number
  boardHeightPx: number
  trayTopPx: number
  trayCols: number
  trayRows: number
  traySlotPx: number
  arenaWidthPx: number
  arenaHeightPx: number
}

/**
 * Tray column count is searched, not derived from a single fixed ratio —
 * 2026-08 QA 4차: the previous `Math.floor(lvl.boardCols / slotCells)`
 * formula depended only on the level's own piece geometry and never once
 * looked at the real viewport, so a tall/narrow pool of pieces always
 * collapsed toward a single tray column regardless of how much width was
 * actually available, forcing a very tall arena (many tray rows) and,
 * once MIN_CELL_SCALE's floor was hit, real vertical overflow/scroll.
 *
 * Every candidate column count is solved through the exact same width+height
 * budget math computeArenaMetrics already used (see scaleFromWidth/
 * scaleFromHeight below) — trayCols never changes what "fits," only how the
 * pieces are grouped before that fit is solved. `>=` on the comparison (not
 * `>`) means a LATER, higher trayCols candidate wins any tie: on a roomy
 * desktop where 2 and 3 columns already both reach scale 1 (no shrinking
 * needed either way), this naturally prefers the wider/shorter 3-column
 * layout; on a narrow mobile viewport, 3 columns typically needs more
 * shrinking than 2 does to fit the same width, so 2 wins on its own strictly
 * higher scale — "모바일 기본 2열 / 데스크톱 2~3열" falls out of the real
 * geometry instead of a hardcoded breakpoint.
 *
 * 2026-08 QA 5차: that last sentence stopped being true once a level's
 * pieces got large enough that BOTH the 2-col and 3-col candidates need
 * more shrinking than MIN_CELL_SCALE allows — comparing the post-floor
 * `scale` (clamped to MIN_CELL_SCALE) made them read as tied even though
 * their real, pre-floor space requirements still differed a lot, and the
 * `>=` tie-break then picked the WIDER 3-col candidate on a narrow phone,
 * producing real horizontal overflow. `comparisonScale` below applies only
 * the ceiling clamp (so the genuine "both already fit, prefer wider" desktop
 * tie above is untouched) and leaves the floor out of the comparison
 * entirely, so a still-narrower 2-col candidate keeps winning on its own
 * merits even after both would floor-clamp to the same final `scale`.
 */
const MIN_TRAY_COLS = 2
const MAX_TRAY_COLS = 3

interface TrayColumnCandidate {
  trayCols: number
  trayRows: number
  scale: number
}

function bestTrayColumns(lvl: PuzzleLevel, slotCells: number, availableWidthPx: number, availableHeightPx: number): TrayColumnCandidate {
  const minCols = Math.min(lvl.pieces.length, MIN_TRAY_COLS) || 1
  const maxCols = Math.max(minCols, Math.min(lvl.pieces.length, MAX_TRAY_COLS))

  let best: (TrayColumnCandidate & { comparisonScale: number }) | null = null
  for (let trayCols = minCols; trayCols <= maxCols; trayCols += 1) {
    const trayRows = Math.ceil(lvl.pieces.length / trayCols)
    const widthUnitCells = Math.max(lvl.boardCols, trayCols * slotCells)
    const heightUnitCells = lvl.boardRows + BOARD_TRAY_GAP_CELLS + trayRows * slotCells
    const scaleFromWidth = availableWidthPx / (FIT_PUZZLE_CELL_SIZE_PX * widthUnitCells)
    const scaleFromHeight = availableHeightPx / (FIT_PUZZLE_CELL_SIZE_PX * heightUnitCells)
    const comparisonScale = Math.min(1, scaleFromWidth, scaleFromHeight)
    const scale = Math.max(MIN_CELL_SCALE, comparisonScale)
    if (!best || comparisonScale >= best.comparisonScale) best = { trayCols, trayRows, scale, comparisonScale }
  }
  // minCols<=maxCols always holds above, so the loop runs at least once.
  return best as TrayColumnCandidate
}

/** All of one level's arena geometry, derived from that level + the real available space alone — computed fresh from whichever level is actually being laid out (never read from a possibly-stale previous level's render-scoped variables; layoutPieces needs the TARGET level's metrics, not the outgoing one). */
function computeArenaMetrics(lvl: PuzzleLevel, availableWidthPx: number, availableHeightPx: number): ArenaMetrics {
  const maxSpanCells = Math.max(1, ...lvl.pieces.map((p) => Math.max(p.widthCells, p.heightCells)))
  const slotCells = maxSpanCells * TRAY_SLOT_PADDING_RATIO
  const { trayCols, trayRows, scale } = bestTrayColumns(lvl, slotCells, availableWidthPx, availableHeightPx)
  // Math.floor (not round) — rounding UP even by a fraction of a pixel per
  // cell can accumulate across several tray rows into a real overflow of a
  // few px, which is exactly what re-introduces the scroll this rework
  // exists to remove. Flooring guarantees cellPx * unitCells never exceeds
  // the solved budget.
  const cellPx = Math.floor(FIT_PUZZLE_CELL_SIZE_PX * scale)

  const boardWidthPx = lvl.boardCols * cellPx
  const boardHeightPx = lvl.boardRows * cellPx
  const traySlotPx = slotCells * cellPx
  const trayTopPx = boardHeightPx + BOARD_TRAY_GAP_CELLS * cellPx
  const arenaWidthPx = Math.max(boardWidthPx, trayCols * traySlotPx)
  const arenaHeightPx = trayTopPx + trayRows * traySlotPx

  return { cellPx, boardWidthPx, boardHeightPx, trayTopPx, trayCols, trayRows, traySlotPx, arenaWidthPx, arenaHeightPx }
}

function shuffledIndices(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/**
 * Scatters each piece into a shuffled tray slot (grid position) with a
 * small random jitter — "약간 산재, 약간 겹침, 어떤 조각인지는 항상 식별
 * 가능" per QA: jitter is bounded well under the slot's own padding margin
 * (TRAY_SLOT_PADDING_RATIO already reserves ~30% headroom per slot beyond
 * the piece's own size), so adjacent pieces can nudge into each other's
 * space without either ever being fully covered. Never rotates pieces
 * decoratively — rotation here has real gameplay meaning (it's what the
 * player must match to the target), so faking it would make it impossible
 * to tell whether a piece still needs turning.
 */
function layoutPieces(lvl: PuzzleLevel, metrics: ArenaMetrics): PieceState[] {
  const slotOrder = shuffledIndices(lvl.pieces.length)
  return lvl.pieces.map((spec, i) => {
    const slot = slotOrder[i]
    const slotCol = slot % metrics.trayCols
    const slotRow = Math.floor(slot / metrics.trayCols)
    const { w, h } = footprintPx(spec.widthCells, spec.heightCells, metrics.cellPx)
    const slotCenterX = slotCol * metrics.traySlotPx + metrics.traySlotPx / 2
    const slotCenterY = metrics.trayTopPx + slotRow * metrics.traySlotPx + metrics.traySlotPx / 2
    const jitterRange = metrics.traySlotPx * 0.12
    const jitterX = (Math.random() * 2 - 1) * jitterRange
    const jitterY = (Math.random() * 2 - 1) * jitterRange
    const x = Math.max(4, slotCenterX - w / 2 + jitterX)
    const y = Math.max(4, slotCenterY - h / 2 + jitterY)
    return { spec, rotation: 0, x, y, homeX: x, homeY: y, placed: false, zIndex: i + 1 }
  })
}

/** Sane pre-measurement fallback (roughly what the old flat guess used) — only ever visible for the first paint before the effect below runs, since the arena itself isn't rendered until `stage === 'playing'`, well after mount. */
const FALLBACK_ARENA_SIZE = { width: 696, height: 460 }
/** Vertical space the arena's own card and the page around it always consume, beyond the measured header block: page bottom padding (py-6 → 24px) + the card's own top+bottom padding (py-5 → 40px) + the mt-5 gap above the card (20px) + a small safety margin. */
const NON_ARENA_VERTICAL_BUFFER_PX = 24 + 40 + 20 + 16
/** Horizontal space always lost to the page's own px-5 padding + the card's px-4 padding, both sides. */
const NON_ARENA_HORIZONTAL_BUFFER_PX = 40 + 32
/** Page content is capped at max-w-3xl (768px) — the arena should never try to claim more width than that even on an ultra-wide monitor. */
const PAGE_MAX_WIDTH_PX = 768

/**
 * Measures the REAL space available for the arena — window size minus the
 * actual rendered header block (GameHud + difficulty hint, via
 * ResizeObserver) minus the known fixed chrome around the card. Re-measures
 * on window resize/orientation change and whenever the header's own height
 * changes. See computeArenaMetrics's doc comment for why this replaced the
 * previous flat-460px guess.
 */
function useAvailableArenaSize(headerRef: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(FALLBACK_ARENA_SIZE)
  useEffect(() => {
    function measure() {
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
      const height = Math.max(240, window.innerHeight - headerHeight - NON_ARENA_VERTICAL_BUFFER_PX)
      const width = Math.max(240, Math.min(window.innerWidth, PAGE_MAX_WIDTH_PX) - NON_ARENA_HORIZONTAL_BUFFER_PX)
      setSize({ width, height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const ro = new ResizeObserver(measure)
    if (headerRef.current) ro.observe(headerRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      ro.disconnect()
    }
  }, [headerRef])
  return size
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
  const headerRef = useRef<HTMLDivElement>(null)
  const availableSize = useAvailableArenaSize(headerRef)
  /** Running top-of-stack counter for the pile's z-index — see PieceState.zIndex. */
  const zCounterRef = useRef(0)

  const level = levels[levelIndex]
  const { cellPx, boardWidthPx, boardHeightPx, arenaWidthPx, arenaHeightPx } = computeArenaMetrics(
    level,
    availableSize.width,
    availableSize.height,
  )

  const startGame = () => setStage('countdown')

  const startLevel = (lvlIndex: number) => {
    const lvl = levels[lvlIndex]
    const metrics = computeArenaMetrics(lvl, availableSize.width, availableSize.height)
    setLevelIndex(lvlIndex)
    const initialPieces = layoutPieces(lvl, metrics)
    setPieces(initialPieces)
    zCounterRef.current = initialPieces.length
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

  /** Bumps `id`'s piece to the top of the pile's stacking order — called on pick-up (pointer down) and on the PC right-click rotate shortcut, both of which are "the player just interacted with this piece" moments. */
  const bringToFront = (id: string) => {
    zCounterRef.current += 1
    const nextZ = zCounterRef.current
    setPieces((prev) => prev.map((p) => (p.spec.id === id ? { ...p, zIndex: nextZ } : p)))
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (tutorialOpen) return
    const piece = pieces.find((p) => p.spec.id === id)
    if (!piece || piece.placed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = { id, offsetX: e.clientX - piece.x, offsetY: e.clientY - piece.y }
    setSelectedId(id)
    bringToFront(id)
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
      const footprint = renderedFootprint(piece, cellPx)
      const pieceCenter = { x: piece.x + footprint.w / 2, y: piece.y + footprint.h / 2 }

      let bestTarget: { spec: PuzzlePieceSpec; distance: number } | null = null
      for (const p of prev) {
        const { width, height } = finalFootprint(p.spec)
        const targetCenter = {
          x: p.spec.targetCol * cellPx + (width * cellPx) / 2,
          y: p.spec.targetRow * cellPx + (height * cellPx) / 2,
        }
        const distance = Math.hypot(pieceCenter.x - targetCenter.x, pieceCenter.y - targetCenter.y)
        if (distance <= snapToleranceRef.current && (!bestTarget || distance < bestTarget.distance)) {
          bestTarget = { spec: p.spec, distance }
        }
      }

      if (!bestTarget) return prev // dropped in open space — no penalty, stays where released

      const targetSpec = bestTarget.spec
      const alreadyFilled = prev.some((p) => p.spec.id === targetSpec.id && p.placed)
      // Shape-aware match (not a raw rotation===correctRotation or %180 check)
      // — required once pieces can be genuinely asymmetric (L/T/S/Z): those
      // look different at rotation+180, while symmetric pieces (lines, the
      // 2x2 square) legitimately DO look identical at extra rotation values,
      // so only comparing actual rotated cell sets is correct for both.
      const rotationMatches = rotationMatchesTarget(targetSpec, piece.rotation)
      const isRightTarget = targetSpec.id === piece.spec.id

      if (isRightTarget && rotationMatches && !alreadyFilled) {
        const snappedX = targetSpec.targetCol * cellPx
        const snappedY = targetSpec.targetRow * cellPx
        play('answer-correct')
        return prev.map((p) => (p.spec.id === id ? { ...p, placed: true, x: snappedX, y: snappedY } : p))
      }

      play('wrong')
      setRoundMisplacements((n) => n + 1)
      // Bounce back to its own scattered tray slot (fixed once per level in layoutPieces).
      return prev.map((p) => (p.spec.id === id ? { ...p, x: p.homeX, y: p.homeY } : p))
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
    bringToFront(id)
    rotatePiece(id)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const selectedPiece = pieces.find((p) => p.spec.id === selectedId)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <div ref={headerRef}>
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
      </div>

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
            {/* arenaWidthPx/arenaHeightPx (see computeArenaMetrics) are solved
                against the REAL measured available width/height, so the arena
                fits inside the viewport by construction — this wrapper's
                overflow-x-auto is only a defensive fallback (e.g. a brief
                pre-measurement frame), never the primary fit mechanism. */}
            <div className="w-full overflow-x-auto">
              <div
                ref={arenaRef}
                className="relative mx-auto"
                style={{ width: arenaWidthPx, height: arenaHeightPx }}
              >
                {/* board */}
                <div
                  className="absolute rounded-xl bg-secondary/50"
                  style={{ width: boardWidthPx, height: boardHeightPx, left: 0, top: 0 }}
                >
                  {level.pieces.map((spec) =>
                    finalCells(spec).map(([r, c]) => (
                      <div
                        key={`${spec.id}-${r}-${c}`}
                        className="absolute rounded-lg border-2 border-dashed border-foreground/30"
                        style={{
                          width: cellPx - 4,
                          height: cellPx - 4,
                          left: (spec.targetCol + c) * cellPx + 2,
                          top: (spec.targetRow + r) * cellPx + 2,
                        }}
                      />
                    )),
                  )}
                </div>

                {/* rotate button, anchored just above the selected (undropped) piece */}
                {selectedPiece && !selectedPiece.placed && (
                  <button
                    type="button"
                    onClick={rotateSelected}
                    aria-label="선택한 조각 90도 회전"
                    className="absolute grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground toy-border toy-shadow-sm"
                    style={{
                      left: selectedPiece.x + renderedFootprint(selectedPiece, cellPx).w / 2 - 18,
                      top: selectedPiece.y - 44,
                      // Always above the piece pile regardless of how far
                      // zCounterRef has climbed this round.
                      zIndex: 9999,
                    }}
                  >
                    <RotateCw size={16} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                )}

                {pieces.map((piece) => {
                  const { w, h } = renderedFootprint(piece, cellPx)
                  const isSelected = selectedId === piece.spec.id
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
                      className={cn('absolute touch-none', piece.placed ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
                      style={{
                        width: w,
                        height: h,
                        left: piece.x,
                        top: piece.y,
                        // Placed pieces settle to the back so an in-progress
                        // drag/tap is never covered by an already-finished one.
                        zIndex: piece.placed ? 1 : piece.zIndex,
                      }}
                    >
                      {currentCells(piece).map(([r, c]) => (
                        <div
                          key={`${r}-${c}`}
                          className={cn(
                            'absolute rounded-lg toy-border transition-shadow',
                            piece.placed ? '' : 'toy-shadow',
                            isSelected && !piece.placed && 'ring-2 ring-accent',
                          )}
                          style={{
                            width: cellPx - 4,
                            height: cellPx - 4,
                            left: c * cellPx + 2,
                            top: r * cellPx + 2,
                            backgroundColor: piece.spec.color,
                          }}
                        />
                      ))}
                    </div>
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
