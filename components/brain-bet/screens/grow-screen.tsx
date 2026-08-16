'use client'

import { ArrowLeft, Sparkles } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { PLAY_ORDER, STATS, type StatId } from '@/lib/brain-bet'
import type { StatStatusMap } from '@/lib/game/types'
import { cn } from '@/lib/utils'

interface GrowScreenProps {
  statStatus: StatStatusMap
  recommendedStat: StatId
  onSelect: (statId: StatId) => void
  onBack: () => void
}

/** Free Play game selection ("성장시키기"). No recommendation rule/XP math yet — see lib/room.ts. */
export function GrowScreen({ statStatus, recommendedStat, onSelect, onBack }: GrowScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-10 pt-8">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card toy-border"
          aria-label="뒤로 가기"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            성장시키기
          </p>
          <h1 className="font-display text-xl font-extrabold text-foreground">
            플레이할 게임을 골라보세요
          </h1>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {PLAY_ORDER.map((id) => {
          const stat = STATS[id]
          const status = statStatus[id]
          const isRecommended = id === recommendedStat
          // Normalized score (0-100), never raw.primary — a stat's 2 games
          // (e.g. 신호 반응 vs 장애물 피하기) have incompatible raw record
          // formats (ms vs count vs accuracy%), so a stat-level "개인 최고"
          // widget spanning both games can only ever show a fair, comparable
          // number here. Per-game raw records still show correctly on their
          // own difficulty-select card (see grow-game-screen.tsx).
          const personalBest = status.current ? `${Math.round(status.current.gameScore)}점` : '--'
          const lastResult = status.history[status.history.length - 1]
          const recent = lastResult ? `${Math.round(lastResult.gameScore)}점` : '--'
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border transition-transform hover:-translate-y-0.5 active:translate-y-0.5',
                isRecommended && 'toy-shadow-lg ring-2 ring-accent',
              )}
            >
              <StatBadge stat={stat} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-base font-extrabold text-foreground">
                    {stat.name}
                  </span>
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground toy-border">
                      <Sparkles size={10} strokeWidth={3} />
                      EXP ×1.5
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  개인 최고 {personalBest} · 최근 기록 {recent}
                </p>
                {isRecommended && (
                  <p className="mt-1 text-xs font-semibold text-primary">
                    Statling이 오늘 이 게임을 하고 싶어 해요!
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
