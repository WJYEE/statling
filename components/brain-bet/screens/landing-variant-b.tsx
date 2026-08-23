'use client'

import { ArrowRight, Gamepad2, Sparkles, Sprout } from 'lucide-react'
import { LandingMysteryEgg } from '@/components/brain-bet/screens/landing-mystery-egg'
import { Logo } from '@/components/brain-bet/logo'
import { TOTAL_GAMES } from '@/lib/brain-bet'
import type { LandingScreenProps } from '@/components/brain-bet/screens/landing-screen'

/**
 * Phase 3E-4 — "curiosity-first" hierarchy: Logo → curiosity headline →
 * short supporting copy → mystery-egg visual → CTA, all above the fold;
 * the "what you'll actually do" explainer moves below it. Deliberately
 * omits the 6-stat pill row Variant A leads with — B withholds exactly what
 * gets measured (only "미니게임"/"숨은 능력" in the subcopy, no named stats)
 * so the curiosity stays on "내 Statling은 무엇일까?" rather than "what will
 * be measured", per the experiment hypothesis.
 *
 * Phase 3E-4 Follow-up — the Hero/Logo/Headline/Subcopy/Egg/CTA block above
 * is tightened into one visually cohesive unit (smaller inter-step margins)
 * and the mystery egg is both larger and animated (LandingMysteryEgg) so it
 * reads as the screen's clear focal point rather than a small decoration.
 * The bottom explainer shrinks from 3 boxed cards to 3 compact chips so it
 * stays visually subordinate to the Hero — this is a refinement of the same
 * structure, not a redesign (see that Phase's own report for the full
 * before/after reasoning).
 *
 * Only ever mounted for an eligible (genuinely-new) visitor — see
 * landing-experiment.tsx's `eligible` computation in game-flow.tsx
 * (`introResume === null && !isReturningLoggedOut && !loadStoredPetProfile()`)
 * — so unlike LandingScreen, this deliberately does NOT implement the
 * resume/"이어서 하기"/returning-logged-out branches: an ineligible visitor
 * is always hardcoded to variant 'A' one level up and never reaches this
 * component. `resumeCount`/`onResume`/`onRestart`/`isReturningLoggedOut`
 * are still accepted (same LandingScreenProps shape LandingExperiment
 * spreads into whichever variant renders) but intentionally unused here.
 */
export function LandingVariantB({ onStart, onGoToLogin }: LandingScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 pt-7 pb-8 sm:max-w-xl sm:pt-12 sm:pb-14">
      <Logo size="md" />

      <div className="mt-5 flex flex-col items-center text-center sm:mt-8">
        {/* max-w-md here (mobile) vs the sm:max-w-xl root above is deliberate:
            at sm:text-5xl this sentence needs more horizontal room than the
            mobile-tuned root width to balance into 2 lines instead of an
            awkward 3rd line — see the Phase 3E-4 report's own note on this. */}
        <h1 className="text-balance font-display text-3xl font-extrabold leading-[1.2] tracking-tight text-foreground sm:text-5xl">
          내 안에는 어떤 <span className="text-primary">Statling</span>이 숨어 있을까?
        </h1>
        <p className="mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          미니게임으로 나의 숨은 능력을 발견하고,
          <br />
          나만의 Statling을 만나보세요.
        </p>
      </div>

      {/* Enlarged from the initial 3E-4 pass (h-32/h-40) — the egg is meant
          to read as this screen's focal point, not a small accent between
          the copy and the CTA. Tight mt- above/below keeps it feeling like
          one continuous Hero block rather than an isolated decoration. */}
      <LandingMysteryEgg className="mt-4 h-44 w-44 sm:mt-6 sm:h-56 sm:w-56" />

      <div className="mt-4 flex w-full flex-col items-center gap-3 sm:mt-6">
        <button
          type="button"
          onClick={onStart}
          data-sfx-skip="true"
          className="group inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 font-display text-xl font-extrabold text-primary-foreground toy-border toy-shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          내 Statling 만나기
          <ArrowRight size={22} strokeWidth={2.8} className="transition-transform duration-150 group-hover:translate-x-1" />
        </button>
        <button
          type="button"
          onClick={onGoToLogin}
          className="text-xs font-bold text-muted-foreground underline-offset-4 hover:underline"
        >
          이미 계정이 있으신가요? 로그인하기
        </button>
      </div>

      {/* Compact feature summary — deliberately lighter than a boxed card
          list (flex-wrap chips, not toy-border cards) so it reads as a
          footnote under the Hero, never competing with the egg/CTA above.
          flex-wrap lets narrow screens fall back to 2 lines instead of
          squeezing 3 chips onto one. */}
      <div className="mt-8 flex w-full max-w-sm flex-wrap items-center justify-center gap-2 sm:mt-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <Gamepad2 size={14} strokeWidth={2.4} className="shrink-0 text-primary" aria-hidden="true" />
          {TOTAL_GAMES}개 미니게임
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <Sparkles size={14} strokeWidth={2.4} className="shrink-0 text-primary" aria-hidden="true" />
          숨은 능력 발견
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <Sprout size={14} strokeWidth={2.4} className="shrink-0 text-primary" aria-hidden="true" />
          함께 성장
        </span>
      </div>
    </div>
  )
}
