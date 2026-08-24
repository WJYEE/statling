'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { STATS, PLAY_ORDER, type StatId } from '@/lib/brain-bet'
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
 * 0 (rest) -> brief wobble -> 1 (eyes peek) -> 2 (hands up) -> 3 (eye-smile)
 * held -> back to 2 -> 3 again (a second, shorter hold — reads as the
 * Statling reacting/blinking at the visitor rather than a single static
 * pose) -> 2 -> 1 -> 0 (rest, longest pause) -> repeat. ~7.15s per cycle —
 * deliberately slow/loop-y (spec: "너무 빠른 GIF처럼 보이면 안 됨"), most of
 * the cycle spent resting or holding a frame rather than mid-transition.
 */
const CYCLE: MysteryEggStep[] = [
  { frame: 0, rotateDeg: 0, duration: 1400 },
  { frame: 0, rotateDeg: -2, duration: 260 },
  { frame: 0, rotateDeg: 2, duration: 260 },
  { frame: 0, rotateDeg: -1, duration: 220 },
  { frame: 0, rotateDeg: 0, duration: 160 },
  { frame: 1, rotateDeg: 0, duration: 600 },
  { frame: 2, rotateDeg: 0, duration: 550 },
  { frame: 3, rotateDeg: 0, duration: 700 },
  { frame: 2, rotateDeg: 0, duration: 300 },
  { frame: 3, rotateDeg: 0, duration: 600 },
  { frame: 2, rotateDeg: 0, duration: 400 },
  { frame: 1, rotateDeg: 0, duration: 400 },
  { frame: 0, rotateDeg: 0, duration: 1300 },
]

/** prefers-reduced-motion fallback — frame 2 (hands already up, eyes open) reads as "a curious friend" even fully static, without the wobble/expression change. */
const REDUCED_MOTION_FRAME: 0 | 1 | 2 | 3 = 2

/**
 * Where each of the 6 painted gems sits on the shared 1254x1254 egg artwork,
 * as a percentage of that square — read directly off 0.png (see the Phase
 * 3E-4 Follow-up report for the reference screenshot). Mapped to StatId by
 * matching each gem's actual pixel color to STATS[id].colorVar's resolved
 * hex (lib/brain-bet.ts / app/globals.css are the color source of truth —
 * this file invents no new color, just reuses that mapping): the top gem is
 * coral/red (~#ea6972, closest to `memory`), upper-left is lavender
 * (~#7f79d1, `reasoning`), upper-right is sky-blue (~#009edb, `focus`),
 * lower-left is orange (~#ee7a1f, `spatial`), lower-right is gold-yellow
 * (~#f2bc00, `reaction`), and the bottom gem is green (~#45bf82, `judgment`).
 */
const GEM_POSITION: Record<StatId, { x: number; y: number }> = {
  memory: { x: 50, y: 29 },
  reasoning: { x: 34, y: 45 },
  focus: { x: 66, y: 45 },
  spatial: { x: 34, y: 60 },
  reaction: { x: 66, y: 60 },
  judgment: { x: 50, y: 70 },
}

/** How long one ability label stays visible once shown (both motion modes) — long enough to read a 2-4 character stat name without feeling stuck. */
const ABILITY_HOLD_MS = 1600
/** Delay after entering the quiet (frame 0) window before the label appears — lets the wobble settle first rather than competing with it. */
const ABILITY_ENTER_DELAY_MS = 400
/** Reduced-motion-only: fixed gap between one label fading out and the next fading in, replacing the egg-frame-driven pacing above (the egg itself is static under reduced motion, so there is no "quiet window" to key off). */
const ABILITY_REDUCED_MOTION_GAP_MS = 500

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
 *
 * Also owns the "6 gems -> 6 abilities" reveal: while the egg is resting
 * (frame 0, including its own small wobble), one gem at a time gets a
 * quiet, single-line ability label — see GEM_POSITION's doc comment for the
 * color mapping and the ability-reveal effect below for why it's keyed off
 * `frame` rather than a separate timer. The label is a plain absolutely-
 * positioned child, never rotates with the egg's wobble (it lives in the
 * outer, non-rotating wrapper), and reuses this project's existing pill
 * styling (`toy-border`, `rounded-full`) rather than inventing new visual
 * language.
 */
export function LandingMysteryEgg({ className }: LandingMysteryEggProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [abilityIndex, setAbilityIndex] = useState(0)
  const [abilityVisible, setAbilityVisible] = useState(false)

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

  // Ability reveal — normal motion: piggybacks on the egg's own quiet (frame
  // === 0) window, which spans several CYCLE steps (the wobble sub-steps
  // plus the trailing/leading rest) without `frame` itself changing value in
  // between, so this effect naturally fires once per quiet window rather
  // than once per wobble tick. Leaving the quiet window (frame !== 0, i.e.
  // hatch reaction starting) hides the label immediately via both the
  // early-return branch and this effect's own cleanup of any pending timers.
  useEffect(() => {
    if (prefersReducedMotion) return
    if (frame !== 0) {
      setAbilityVisible(false)
      return
    }
    const showTimer = setTimeout(() => setAbilityVisible(true), ABILITY_ENTER_DELAY_MS)
    const hideTimer = setTimeout(() => {
      setAbilityVisible(false)
      setAbilityIndex((i) => (i + 1) % PLAY_ORDER.length)
    }, ABILITY_ENTER_DELAY_MS + ABILITY_HOLD_MS)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [frame, prefersReducedMotion])

  // Ability reveal — reduced motion: the egg itself is frozen (no cycling,
  // no quiet-window concept), so this runs its own independent, very simple
  // fade cycle instead — a self-rescheduling setTimeout chain (same
  // convention as hooks/use-pet-autonomy.ts's autonomy scheduler), not
  // setInterval, and no translateY component in the label's own transition
  // (see the render below) — opacity-only, per the reduced-motion spec.
  const abilityChainCancelledRef = useRef(false)
  useEffect(() => {
    if (!prefersReducedMotion) return
    abilityChainCancelledRef.current = false
    function showNext() {
      if (abilityChainCancelledRef.current) return
      setAbilityVisible(true)
      setTimeout(() => {
        if (abilityChainCancelledRef.current) return
        setAbilityVisible(false)
        setTimeout(() => {
          if (abilityChainCancelledRef.current) return
          setAbilityIndex((i) => (i + 1) % PLAY_ORDER.length)
          showNext()
        }, ABILITY_REDUCED_MOTION_GAP_MS)
      }, ABILITY_HOLD_MS)
    }
    showNext()
    return () => {
      abilityChainCancelledRef.current = true
    }
  }, [prefersReducedMotion])

  const abilityStat = STATS[PLAY_ORDER[abilityIndex]]
  const gemPos = GEM_POSITION[abilityStat.id]

  return (
    <div className={cn('relative flex items-center justify-center overflow-visible', className)}>
      <div
        className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-in-out"
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

      {/* Ability label — decorative flourish only (stat display name, never
          the raw StatId), so it's hidden from the accessibility tree rather
          than announced. Positioned by percentage against this same square
          wrapper (see GEM_POSITION), anchored so its bottom edge sits just
          above the gem regardless of label text width. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute flex flex-col items-center gap-0.5"
        style={{
          left: `${gemPos.x}%`,
          top: `${gemPos.y}%`,
          transform: `translate(-50%, calc(-100% - 8px)) translateY(${abilityVisible ? '0px' : '4px'})`,
          opacity: abilityVisible ? 1 : 0,
          transition: 'opacity 300ms ease-out, transform 300ms ease-out',
        }}
      >
        <span className="whitespace-nowrap rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-foreground toy-border toy-shadow-sm">
          {abilityStat.name}
        </span>
        <Sparkles size={10} strokeWidth={2.4} style={{ color: `var(${abilityStat.colorVar})` }} />
      </div>
    </div>
  )
}
