'use client'

import { useEffect } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ThumbsUp } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { StatDistribution } from '@/components/brain-bet/result/stat-distribution'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { STATS, type StatId } from '@/lib/brain-bet'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { buildStatInsight } from '@/lib/stats/stat-insights'
import { useSound } from '@/hooks/use-sound'

interface HomeResultPopupProps {
  open: boolean
  petProfile: PetProfile
  topStat: StatId
  secondaryStat: StatId
  finals: Record<StatId, number>
  /** Whether this open was the automatic first-Home-visit show or a manual "내 Statling 결과" reopen from My Page — passed straight through to analytics (see lib/analytics/analytics.ts's result_popup_viewed). */
  source: 'auto' | 'manual'
  onContinue: () => void
}

/**
 * Home's first-visit RESULT REPORT — deliberately not a character
 * reintroduction. By the time this shows, the user already met the
 * portrait and name twice (Hatch Reveal, then the Naming transition's own
 * "함께 놀아볼까요?" beat) — repeating a big portrait here would be the
 * third time. This screen's actual job is the one thing neither of those
 * covered: connecting the 6-game Assessment the user just finished to WHY
 * this specific Statling came out the way it did, using the same
 * StatDistribution bar-chart RevealScreen used to show (removed from
 * Reveal, reused here instead — see that screen's own doc comment) plus a
 * compact one-line strength pulled from the same buildStatInsight()
 * RevealScreen already relied on. No traits list, no compatibility, no
 * content-unlock preview, no XP/Level preview — those are HomeOnboardingGuide's
 * job (see game-flow.tsx's Popup -> Guide sequencing) or the real Home UI's
 * own job, not this screen's.
 */
export function HomeResultPopup({ open, petProfile, topStat, secondaryStat, finals, source, onContinue }: HomeResultPopupProps) {
  const { play } = useSound()
  const stat = STATS[topStat]
  const secondary = STATS[secondaryStat]
  const insight = buildStatInsight(topStat, secondaryStat)
  const topStrengths = insight.strengths.slice(0, 2)

  useEffect(() => {
    if (open) {
      play('modal-open')
      trackProductEvent('result_popup_viewed', { source })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the closed->open transition
  }, [open])

  function handleContinue() {
    play('confirm')
    onContinue()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && handleContinue()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[130] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup
          aria-label={`${petProfile.name} 결과 요약`}
          className="fixed left-1/2 top-1/2 z-[140] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-card text-center toy-border toy-shadow-lg transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
        >
          {/* Internal scroll only — the CTA below stays pinned outside this
              region so it's always reachable regardless of scroll position
              (spec: CTA 접근 가능). scrollbar-hide (see app/globals.css,
              already used by reveal-screen.tsx) only hides the track/thumb,
              never the scroll behavior itself. */}
          <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pt-5">
            <Dialog.Title className="font-display text-lg font-extrabold text-foreground">6가지 능력치 결과</Dialog.Title>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              6가지 게임에서 나타난 나의 능력치를 바탕으로
              <br />
              {petProfile.name}이 태어났어요.
            </p>

            <div className="mt-2">
              <StatDistribution finals={finals} />
            </div>

            <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">가장 높은 능력</p>
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">
                <StatBadge stat={stat} size="xs" />
                <span className="text-xs font-bold text-secondary-foreground">{stat.name}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">
                <StatBadge stat={secondary} size="xs" />
                <span className="text-xs font-bold text-secondary-foreground">{secondary.name}</span>
              </span>
            </div>

            {topStrengths.length > 0 && (
              <div className="mt-4 rounded-xl bg-secondary/50 px-3 py-2.5 text-left toy-border">
                <div className="flex items-center gap-1.5">
                  <ThumbsUp size={13} strokeWidth={2.6} className="text-foreground" aria-hidden="true" />
                  <span className="text-xs font-extrabold text-foreground">이런 특징이 보여요</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {topStrengths.map((item) => (
                    <li key={item} className="text-[12px] leading-snug text-secondary-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-4 text-pretty text-xs leading-relaxed text-muted-foreground">
              Statling은 나의 능력치에서 태어나, 게임을 플레이하며
              <br />
              스탯과 XP를 키우고 함께 성장하는 나만의 친구예요.
            </p>
          </div>

          <div className="px-5 pb-5 pt-3">
            <ToyButton className="w-full" onClick={handleContinue}>
              {source === 'auto' ? '이제 함께 시작하기' : '닫기'}
            </ToyButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
