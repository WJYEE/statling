'use client'

import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { ChevronRight, PartyPopper } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import type { NavTab } from '@/components/brain-bet/nav-rail'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { useSound } from '@/hooks/use-sound'

export interface OnboardingStep {
  /** Which real NavRail tab must be active for this step's target to exist — game-flow.tsx drives an actual setPhase(tab) navigation on Next/Prev, never a fake standalone screen. */
  phase: NavTab
  /** Matches a real `data-onboarding-target` attribute already on the actual Room/NavRail/screen element — never a fabricated/placeholder target. */
  target: string
  title: string
  description: string
  /**
   * 'strong' (Steps 1-3, still on Room) — full-page dim with a cutout, same
   * as the original single-screen coach mark. 'light' (Steps 4-7, each on
   * its own real tab) — no full-page dim, since these steps are
   * introducing the whole screen rather than one button on top of an
   * otherwise-familiar Room; dimming the very content being introduced
   * would defeat the point. Only the target (the NavRail tab) gets a
   * highlight ring in that mode.
   */
  intensity: 'strong' | 'light'
}

/**
 * Real Home tabs/buttons only — verified against nav-rail.tsx's NAV_ITEMS
 * and each real screen's own markup before writing this list (no invented
 * feature names). Steps 1-3 stay on Room and spotlight one element each;
 * steps 4-7 each switch to the real tab (game-flow.tsx does the actual
 * setPhase) and introduce that whole screen. 'Statling' covers both
 * character deco AND the 도감/dex (see nav-rail.tsx's own doc comment on
 * why those aren't separate top-level tabs, and statling-screen.tsx's own
 * "방 꾸미기"/"도감" buttons) — described as one step rather than two
 * fabricated ones.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    phase: 'room',
    target: 'room-care-actions',
    title: 'Statling을 돌봐주세요!',
    description: '밥 주기 · 샤워 · 청소 · 놀아주기 · 쓰다듬기 · 대화하기로 Statling을 직접 돌볼 수 있어요.',
    intensity: 'strong',
  },
  {
    phase: 'room',
    target: 'room-grow-cta',
    title: '성장시키기',
    description: '미니게임을 플레이하면서 Statling의 XP와 레벨, 스탯을 성장시킬 수 있어요.',
    intensity: 'strong',
  },
  {
    phase: 'room',
    target: 'room-mission',
    title: '미션',
    description: '매일 미션과 업적을 확인하고 보상을 받을 수 있어요.',
    intensity: 'strong',
  },
  {
    phase: 'mystats',
    target: 'nav-mystats',
    title: '내 스탯을 확인해보세요!',
    description: '게임을 플레이하며 성장한 각 능력치와 기록을 여기서 확인할 수 있어요.',
    intensity: 'light',
  },
  {
    phase: 'ranking',
    target: 'nav-ranking',
    title: '다른 사용자와 비교해보세요!',
    description: '내 기록과 성장을 다른 사용자와 비교하고 랭킹에 도전할 수 있어요.',
    intensity: 'light',
  },
  {
    phase: 'statling',
    target: 'nav-statling',
    title: 'Statling을 더 만나보세요!',
    description: '발견한 Statling을 도감에서 확인하고, 꾸미기 등 Statling 관련 기능을 이용할 수 있어요.',
    intensity: 'light',
  },
  {
    phase: 'mypage',
    target: 'nav-mypage',
    title: '더 많은 기능을 확인해보세요!',
    description: '내 정보와 설정을 관리하고, 필요할 때 이 Statling 가이드도 다시 볼 수 있어요.',
    intensity: 'light',
  },
]

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface HomeOnboardingGuideProps {
  open: boolean
  /** True once Step 7's "다음" has been pressed — game-flow.tsx has already navigated back to Room; this renders the short completion card instead of a coach-mark step. */
  complete: boolean
  stepIndex: number
  /** Whether this run was the automatic first-visit show or a manual "Statling 가이드" reopen — passed straight through to analytics. */
  source: 'auto' | 'manual'
  /** Advances to the next step (or, from the last step, tells the caller to switch to the completion card) — game-flow.tsx owns the actual setPhase navigation. */
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  /** The completion card's own "시작하기" — distinct from onNext since it's reached via a different UI (no step to advance to). */
  onFinish: () => void
}

/**
 * First-visit "Home 사용법" coach mark. Steps 1-3 spotlight one Room
 * element at a time (data-onboarding-target attributes on the actual
 * elements in room-screen.tsx); Steps 4-7 each ride along an actual
 * setPhase(tab) navigation (driven by the caller, see onNext/onPrev) so the
 * user sees the REAL My Stats/Ranking/Statling/My Page screens, never a
 * fake mock — this component only renders the overlay (spotlight ring +
 * bubble) on top of whatever real screen game-flow.tsx has already
 * navigated to. Ends with a short completion card that returns the user to
 * Room. Reuses the exact same onboardingSeen storage/My Page reopen entry
 * point the app's original 3-step OnboardingModal used (see
 * lib/onboarding-storage.ts) — game-flow.tsx's onFinish/onSkip handlers own
 * the actual markOnboardingSeen call, this component only renders.
 */
export function HomeOnboardingGuide({ open, complete, stepIndex, source, onNext, onPrev, onSkip, onFinish }: HomeOnboardingGuideProps) {
  const { play } = useSound()
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const step = ONBOARDING_STEPS[stepIndex]
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1

  useEffect(() => {
    if (open) {
      play('modal-open')
      trackProductEvent('onboarding_viewed', { source })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the closed->open transition
  }, [open])

  // Re-measures the current step's target on every step/phase change and on
  // resize/scroll — Room's own content can be taller than the viewport, so
  // the target is scrolled into view (instant, not smooth — avoids
  // measuring mid-animation) before its rect is captured. Re-runs whenever
  // `step.target` changes, which covers both an in-place Room step change
  // AND a real tab navigation (a fresh screen mounts, then this effect
  // finds ITS target instead of the old one).
  useLayoutEffect(() => {
    if (!open || complete) return
    const el = document.querySelector<HTMLElement>(`[data-onboarding-target="${step.target}"]`)
    el?.scrollIntoView({ block: 'center' })

    function measure() {
      const target = document.querySelector<HTMLElement>(`[data-onboarding-target="${step.target}"]`)
      if (!target) {
        setRect(null)
        return
      }
      const r = target.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, complete, step.target])

  function handleSkip() {
    play('ui-back')
    onSkip()
  }

  function handleNext() {
    play(isLast ? 'confirm' : 'ui-click-soft')
    onNext()
  }

  function handlePrev() {
    play('ui-back')
    onPrev()
  }

  function handleFinish() {
    play('confirm')
    onFinish()
  }

  if (!open) return null

  if (complete) {
    return (
      <div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label="Statling 가이드 완료">
        <div className="w-full max-w-sm rounded-3xl bg-card p-5 text-center toy-border toy-shadow-lg">
          <PartyPopper size={40} strokeWidth={2} className="mx-auto text-primary" aria-hidden="true" />
          <p className="mt-2 font-display text-lg font-extrabold text-foreground">이제 준비가 끝났어요! 🎉</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Statling과 함께 즐겁게 플레이해주세요!</p>
          <ToyButton className="mt-4 w-full" onClick={handleFinish}>
            시작하기
          </ToyButton>
        </div>
      </div>
    )
  }

  const PAD = 8
  const spotlight = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null
  const isStrong = step.intensity === 'strong'

  const viewportH = window.innerHeight
  const bubbleBelow = spotlight ? spotlight.top + spotlight.height + 180 < viewportH : true
  const bubbleStyle: CSSProperties = spotlight
    ? bubbleBelow
      ? { top: spotlight.top + spotlight.height + 16 }
      : { top: Math.max(16, spotlight.top - 16), transform: 'translate(-50%, -100%)' }
    : { top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="fixed inset-0 z-[130]" role="dialog" aria-modal="true" aria-label="Home 사용법 안내">
      {/* Strong steps (Room): dims everything except the target rect via a
          giant box-shadow cutout. Light steps (tab intro): no dim at all —
          the whole point is to let the real screen content read clearly;
          only the highlight ring below marks the tab. Either way, a
          full-page transparent layer still blocks background interaction
          while the guide is open. */}
      {(isStrong || !spotlight) && (
        <div
          className="absolute rounded-2xl transition-all duration-200"
          style={
            spotlight
              ? { top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)' }
              : { top: 0, left: 0, width: '100%', height: '100%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)' }
          }
        />
      )}
      {/* Highlight ring — purely visual. */}
      {spotlight && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-4 ring-primary transition-all duration-200"
          style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
        />
      )}
      {/* Invisible blocker over the spotlighted element itself — the cutout leaves it visually reachable, but tapping the real button mid-tour (e.g. a different NavRail tab) must not actually navigate away from the guided sequence. */}
      {spotlight && (
        <div className="absolute" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }} />
      )}

      <div
        className="absolute left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-3xl bg-card p-4 text-left toy-border toy-shadow-lg"
        style={bubbleStyle}
      >
        <p className="text-xs font-bold text-muted-foreground">{stepIndex + 1} / {ONBOARDING_STEPS.length}</p>
        <p className="mt-1 font-display text-base font-extrabold leading-snug text-foreground">{step.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>

        <div className="mt-3 flex items-center gap-2">
          {stepIndex > 0 && (
            <ToyButton variant="secondary" className="flex-1 px-3 py-2.5 text-sm" onClick={handlePrev}>
              이전
            </ToyButton>
          )}
          <ToyButton className="flex-1 px-3 py-2.5 text-sm" data-sfx-skip onClick={handleNext}>
            다음
            <ChevronRight size={16} strokeWidth={2.8} />
          </ToyButton>
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="mt-2 w-full text-center text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          건너뛰기
        </button>
      </div>
    </div>
  )
}
