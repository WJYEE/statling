'use client'

import { useEffect } from 'react'
import { ArrowRight, Trophy } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'
import { STATS, type RawRecord, type StatId } from '@/lib/brain-bet'

interface FreePlayResultScreenProps {
  statId: StatId
  raw: RawRecord
  personalBestRaw?: RawRecord | null
  isNewRecord?: boolean
  isRecommended: boolean
  /** The exact amount just added to XpState by addXp (lib/ranking/xp-ledger.ts) for this completion — the caller computes it the same way addXp does (Math.max(0, Math.round(gameScore))) so this display can never drift from what was actually granted. */
  xpEarned: number
  onReturnToRoom: () => void
}

/**
 * Free Play completion screen (distinct from the first-play Stat Discovery
 * screen per GAME_SPEC §109-110). Shows the raw record plus Personal Best /
 * NEW RECORD, and the real XP amount just granted (see `xpEarned`).
 */
export function FreePlayResultScreen({
  statId,
  raw,
  personalBestRaw,
  isNewRecord,
  isRecommended,
  xpEarned,
  onReturnToRoom,
}: FreePlayResultScreenProps) {
  const stat = STATS[statId]
  const { play } = useSound()

  useEffect(() => {
    play('final-result')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once per mount
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <StatBadge stat={stat} size="lg" />
      <h1 className="mt-5 text-balance font-display text-2xl font-extrabold text-foreground">
        {stat.name} 게임을 완료했어요!
      </h1>

      <div className="mt-6 w-full rounded-2xl bg-card px-6 py-5 toy-border toy-shadow">
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            이번 기록
          </p>
          {isNewRecord && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              <Trophy size={10} strokeWidth={3} />
              NEW RECORD
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-4xl font-extrabold leading-none text-foreground">
          {raw.primary}
        </p>
        {raw.secondary && <p className="mt-2 text-sm text-muted-foreground">{raw.secondary}</p>}

        {personalBestRaw && !isNewRecord && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              개인 최고
            </p>
            <p className="mt-1 font-display text-lg font-extrabold text-foreground">
              {personalBestRaw.primary}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 toy-border">
        <Trophy size={18} strokeWidth={2.4} className="text-primary" />
        <span className="font-display text-sm font-extrabold text-secondary-foreground">
          EXP +{xpEarned}
          {isRecommended ? ' · 추천 보너스 ×1.5' : ''}
        </span>
      </div>

      <ToyButton className="mt-8 w-full" onClick={onReturnToRoom}>
        방으로 돌아가기
        <ArrowRight size={20} strokeWidth={2.8} />
      </ToyButton>
    </div>
  )
}
