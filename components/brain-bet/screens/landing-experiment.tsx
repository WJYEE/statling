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
 * Phase 3F-1 fix — `variant` used to be read via a lazy `useState`
 * initializer, deliberately chosen (Phase 3E-2 report §8) to avoid an
 * "assign variant, re-render, swap content" flicker window. That reasoning
 * didn't account for `/` being statically prerendered: the server-rendered
 * HTML always ships with 'A' (getOrAssignLandingVariant() short-circuits to
 * 'A' whenever `window` is undefined — see that function's own doc comment),
 * so any fresh visitor whose CLIENT-side coin flip landed on 'B' hydrated a
 * completely different tree (LandingVariantB) against server-sent Variant A
 * markup — a guaranteed React hydration-mismatch error (#418) on the very
 * page this whole experiment measures. Reproduced live against production
 * (see the Phase 3F-1 QA report) on every fresh 'B' assignment. Fixed by
 * starting at the SAME 'A' the server always sends, then resolving the real
 * variant in the mount effect below (same defensive pattern already used by
 * landing-mystery-egg.tsx's own prefersReducedMotion check) — first paint
 * now always matches server HTML, no assignment/eligibility/sticky logic or
 * event shape touched at all, still exactly one `getOrAssignLandingVariant()`
 * call and one `landing_experiment_viewed` per eligible mount.
 */
export function LandingExperiment({ eligible, ...landingProps }: LandingExperimentProps) {
  const [variant, setVariant] = useState<LandingVariant>('A')
  const hasFiredRef = useRef(false)

  // Fires exactly once per real mount — the ref guard (not just the `[]`
  // deps array) is what keeps React Strict Mode's dev-only double-invoke
  // from double-counting; a reload is a fresh mount (and a fresh $pageview),
  // so it fires again there, correctly.
  useEffect(() => {
    if (!eligible || hasFiredRef.current) return
    hasFiredRef.current = true
    const resolved = getOrAssignLandingVariant()
    setVariant(resolved)
    trackProductEvent('landing_experiment_viewed', { variant: resolved })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-once; eligible is stable for this component's lifetime
  }, [])

  // Phase 3E-4 — Variant B ships. Note this branch can only ever be reached
  // for an eligible visitor (see this file's own doc comment) — an
  // ineligible one is hardcoded to 'A' above and never reaches here.
  if (variant === 'B') return <LandingVariantB {...landingProps} />
  return <LandingScreen {...landingProps} />
}
