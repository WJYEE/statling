'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Check, ChevronDown } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { markOnboardingSeen } from '@/lib/onboarding-storage'
import { cn } from '@/lib/utils'

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
}

/**
 * The core play loop, not a menu tour — each step is what the player
 * actually DOES, in the order they'll first experience it (Intro's 6
 * mini-games -> Free Play's 성장하기 -> Room/Statling care & decor), not a
 * tab-by-tab feature list. See this file's own doc comment below for why
 * this replaced the old per-tab TABS list.
 */
const STEPS = [
  {
    emoji: '🧠',
    title: '나의 능력 발견하기',
    desc: '처음 6개의 미니게임을 플레이하면 순발력 · 기억력 · 집중력 · 판단력 · 공간감각 · 추리력을 측정해요.',
  },
  {
    emoji: '🎮',
    title: '원하는 능력 키우기',
    desc: '"성장하기"에서 원하는 능력의 미니게임에 도전하고 더 좋은 기록을 만들어 스탯을 성장시켜요.',
  },
  {
    emoji: '🐾',
    title: 'Statling과 함께 성장하기',
    desc: '게임을 플레이해 XP와 보상을 얻고, 나만의 Statling을 키우고 꾸며보세요.',
  },
] as const

/**
 * One-card first-visit walkthrough — a single modal, no multi-page
 * tutorial, meant to be readable in ~10 seconds. Teaches the 3-step core
 * play loop (discover -> grow -> raise your Statling) rather than listing
 * every nav tab, so a brand-new player understands what the game IS before
 * ever seeing a menu. Shown once (see lib/onboarding-storage.ts + the
 * trigger in game-flow.tsx) unless "다시 보지 않기" is unchecked, and
 * reachable again anytime from MyPageScreen's "온보딩 다시 보기" row.
 */
export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(true)

  function handleClose() {
    if (dontShowAgain) markOnboardingSeen()
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && handleClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-5 text-left toy-border toy-shadow-lg transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="font-display text-lg font-extrabold text-foreground sm:text-xl">
            Statling은 이렇게 성장해요!
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground sm:text-sm">
            나의 능력을 발견하고, 작은 친구와 함께 성장해보세요.
          </Dialog.Description>

          <div className="mt-3 flex flex-col">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                {i > 0 && (
                  <div className="flex justify-center py-0.5" aria-hidden="true">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15">
                      <ChevronDown size={16} strokeWidth={3} className="text-primary" />
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 px-3.5 py-3 toy-border">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground toy-border">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-display text-sm font-extrabold leading-tight text-foreground sm:text-base">
                      <span aria-hidden="true">{step.emoji}</span>
                      {step.title}
                    </p>
                    <p className="mt-1.5 text-xs leading-snug text-muted-foreground sm:text-sm">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
            🏆 다른 플레이어와 기록도 비교할 수 있어요.
          </p>

          <ToyButton className="mt-4 w-full justify-center px-4 py-3 text-base" data-sfx-skip onClick={handleClose}>
            게임 시작하기!
          </ToyButton>

          <label className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground sm:text-sm">
            <button
              type="button"
              role="checkbox"
              aria-checked={dontShowAgain}
              onClick={() => setDontShowAgain((v) => !v)}
              className={cn(
                'grid h-4 w-4 shrink-0 place-items-center rounded border-2',
                dontShowAgain ? 'border-primary bg-primary text-primary-foreground' : 'border-[color:var(--ink)]',
              )}
            >
              {dontShowAgain && <Check size={11} strokeWidth={3} />}
            </button>
            다시 보지 않기
          </label>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
