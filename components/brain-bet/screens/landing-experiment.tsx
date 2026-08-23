'use client'

import { useEffect, useRef, useState } from 'react'
import { LandingScreen, type LandingScreenProps } from '@/components/brain-bet/screens/landing-screen'
import { LandingVariantB } from '@/components/brain-bet/screens/landing-variant-b'
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
 * Phase 3E-2 — component boundary for the Landing A/B experiment.
 * Phase 3E-4 — Variant B (components/brain-bet/screens/landing-variant-b.tsx)
 * ships here; Variant A (LandingScreen) is untouched Control. This remains
 * the only place that branches on `variant` — game-flow.tsx and every other
 * caller only ever sees `LandingExperiment`, never either variant directly.
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

  // Phase 3E-4 — Variant B ships. Note this branch can only ever be reached
  // for an eligible visitor (see this file's own doc comment) — an
  // ineligible one is hardcoded to 'A' above and never reaches here.
  if (variant === 'B') return <LandingVariantB {...landingProps} />
  return <LandingScreen {...landingProps} />
}
