'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const MYSTERY_EGG_BASE = '/assets/statling/eggs/hatch-sequence'

/**
 * A dedicated 4-frame set for Landing Variant B's hero only — separate from
 * EGG_HATCH_SEQUENCE (lib/egg-assets.ts), which is the real onboarding hatch
 * animation's 7 growth stages. These 4 frames (0-3.png) exist purely to make
 * the egg read as "something's peeking out, curious to meet you" without
 * ever revealing which Statling it is — never wired into egg-assets.ts so
 * the two sequences can't accidentally cross-reference each other.
 */
const MYSTERY_EGG_FRAME_SRC: Record<0 | 1 | 2 | 3, string> = {
  0: `${MYSTERY_EGG_BASE}/0.png`,
  1: `${MYSTERY_EGG_BASE}/1.png`,
  2: `${MYSTERY_EGG_BASE}/2.png`,
  3: `${MYSTERY_EGG_BASE}/3.png`,
}

interface MysteryEggStep {
  frame: 0 | 1 | 2 | 3
  /** Small rotate-only tilt (deg) — kept within the spec's -2~+2 range, never combined with scale/translate so it can never read as bouncy. */
  rotateDeg: number
  duration: number
}

/**
 * 0 (rest) -> brief wobble -> 1 (eyes peek) -> 2 (hands up) -> 3 (eye-smile,
 * held) -> 2 -> 1 -> 0 (rest, longer pause) -> repeat. ~5.85s per cycle —
 * deliberately slow/loop-y (spec: "너무 빠른 GIF처럼 보이면 안 됨"), most of
 * the cycle spent resting or holding a frame rather than mid-transition.
 */
const CYCLE: MysteryEggStep[] = [
  { frame: 0, rotateDeg: 0, duration: 900 },
  { frame: 0, rotateDeg: -2, duration: 260 },
  { frame: 0, rotateDeg: 2, duration: 260 },
  { frame: 0, rotateDeg: -1, duration: 220 },
  { frame: 0, rotateDeg: 0, duration: 160 },
  { frame: 1, rotateDeg: 0, duration: 500 },
  { frame: 2, rotateDeg: 0, duration: 550 },
  { frame: 3, rotateDeg: 0, duration: 900 },
  { frame: 2, rotateDeg: 0, duration: 450 },
  { frame: 1, rotateDeg: 0, duration: 450 },
  { frame: 0, rotateDeg: 0, duration: 1200 },
]

/** prefers-reduced-motion fallback — frame 2 (hands already up, eyes open) reads as "a curious friend" even fully static, without the wobble/expression change. */
const REDUCED_MOTION_FRAME: 0 | 1 | 2 | 3 = 2

interface LandingMysteryEggProps {
  /** Tailwind size classes for the wrapper (e.g. "h-44 w-44 sm:h-56 sm:w-56") — sized at the call site rather than via a numeric prop so the hero can size it responsively without a JS resize listener. */
  className?: string
}

/**
 * Phase 3E-4 Follow-up — Variant B's hero visual. A plain setTimeout chain
 * over CYCLE (not a new animation framework/state machine) driving both the
 * frame swap and a CSS-transitioned rotate — no new global keyframes added,
 * self-contained to this component. Every frame is object-contain inside a
 * fixed-size wrapper (same technique as AssetImage) and all 4 source PNGs
 * are the same 1254x1254 square, so switching frames never shifts layout.
 */
export function LandingMysteryEgg({ className }: LandingMysteryEggProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Checked post-mount (not in a lazy useState initializer) so the very
  // first client render matches SSR output exactly — avoids a hydration
  // mismatch on which frame src is rendered. Causes at most one extra
  // render right after mount for a reduced-motion visitor, never a
  // server/client HTML mismatch.
  useEffect(() => {
    setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) return
    const timeout = setTimeout(() => {
      setStepIndex((i) => (i + 1) % CYCLE.length)
    }, CYCLE[stepIndex].duration)
    return () => clearTimeout(timeout)
  }, [stepIndex, prefersReducedMotion])

  const step = prefersReducedMotion ? null : CYCLE[stepIndex]
  const frame = step ? step.frame : REDUCED_MOTION_FRAME
  const rotateDeg = step ? step.rotateDeg : 0

  return (
    <div
      className={cn('flex items-center justify-center overflow-visible transition-transform duration-200 ease-in-out', className)}
      style={{ transform: `rotate(${rotateDeg}deg)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-authored static PNGs, same rationale as AssetImage: never re-optimized/resized by next/image. */}
      <img
        src={MYSTERY_EGG_FRAME_SRC[frame]}
        alt="알 안에서 꼬물거리는 신비의 Statling"
        className="h-full w-full object-contain"
        draggable={false}
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  )
}
