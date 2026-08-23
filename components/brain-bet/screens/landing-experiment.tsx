'use client'

import { useEffect, useRef, useState } from 'react'
import { LandingScreen, type LandingScreenProps } from '@/components/brain-bet/screens/landing-screen'
import { getOrAssignLandingVariant, type LandingVariant } from '@/lib/experiments/landing-variant'
import { trackProductEvent } from '@/lib/analytics/analytics'

export interface LandingExperimentProps extends LandingScreenProps {
  /**
   * False for the resumable-Intro / previously-logged-in-but-signed-out
   * sub-states of Landing (see game-flow.tsx's introResume/
   * isReturningLoggedOut) — those aren't the "genuinely new visitor"
   * population the experiment is scoped to (spec §5: "실제로 Landing을 보는
   * 사용자에게만 variant를 적용"), so they render the exact same
   * `<LandingScreen/>` with no variant assignment and no
   * `landing_experiment_viewed` event — byte-for-byte the pre-3E-2 behavior.
   */
  eligible: boolean
}

/**
 * Phase 3E-2 — component boundary for the Landing A/B experiment. Landing B
 * has no real UI yet (spec: "이번 Phase에서는 Landing B의 실제 새로운 디자인을
 * 만들지 마세요") — both arms render the SAME `<LandingScreen/>` today, so
 * this wrapper is deliberately the only place that needs to change once a
 * real Landing B ships (see the comment at the bottom).
 *
 * Variant is read via a lazy `useState` initializer (not an effect) so it's
 * already resolved on this component's very first render — by the time
 * `LandingExperiment` ever mounts, game-flow.tsx's `!bootReady` spinner gate
 * has already resolved auth/restore state, so there is no "assign variant,
 * re-render, swap content" flicker window (see the Phase 3E-2 report §8).
 */
export function LandingExperiment({ eligible, ...landingProps }: LandingExperimentProps) {
  const [variant] = useState<LandingVariant>(() => (eligible ? getOrAssignLandingVariant() : 'A'))
  const hasFiredRef = useRef(false)

  // Fires exactly once per real mount — the ref guard (not just the `[]`
  // deps array) is what keeps React Strict Mode's dev-only double-invoke
  // from double-counting; a reload is a fresh mount (and a fresh $pageview),
  // so it fires again there, correctly.
  useEffect(() => {
    if (!eligible || hasFiredRef.current) return
    hasFiredRef.current = true
    trackProductEvent('landing_experiment_viewed', { variant })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-once; eligible/variant are stable for this component's lifetime
  }, [])

  // No Landing B UI exists yet (next Phase's job). When it ships, this
  // becomes: `if (variant === 'B') return <LandingScreenB {...landingProps} />`
  // — nothing else in the app (game-flow.tsx, this file's own props) needs
  // to change.
  return <LandingScreen {...landingProps} />
}
