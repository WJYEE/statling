import { BatteryMedium, Smile } from 'lucide-react'
import { FloatingDeltaText } from '@/components/brain-bet/floating-delta-text'
import type { FloatingDelta } from '@/hooks/use-pet-care'
import { ATTENTION_THRESHOLD } from '@/lib/config/pet-care.config'
import { BowlIcon, BubbleIcon, HeartIcon, type RoomIconProps } from '@/components/brain-bet/room-icons'
import type { CareStatId } from '@/lib/pet-care/types'
import { formatLevelLabel, MAX_LEVEL } from '@/lib/pet-care/leveling'
import { computeRelationshipStage, RELATIONSHIP_STAGE_LABEL } from '@/lib/pet-care/relationship-stage'
import { cn } from '@/lib/utils'

const STAT_ICON: Record<CareStatId, (props: RoomIconProps) => React.ReactElement> = {
  satiety: BowlIcon,
  cleanliness: BubbleIcon,
  affection: HeartIcon,
  energy: (props) => <BatteryMedium {...props} />,
  happiness: (props) => <Smile {...props} />,
}

const STAT_LABEL: Record<CareStatId, string> = {
  satiety: '포만감',
  cleanliness: '청결도',
  affection: '애정도',
  energy: '에너지',
  happiness: '행복도',
}

const STAT_STATUS_LABEL: Record<CareStatId, { low: string; mid: string; high: string }> = {
  satiety: { low: '배고파요', mid: '적당해요', high: '든든해요' },
  cleanliness: { low: '더러워요', mid: '보통이에요', high: '깨끗해요' },
  affection: { low: '서먹해요', mid: '친해지는 중이에요', high: '많이 좋아해요' },
  energy: { low: '지쳤어요', mid: '보통이에요', high: '활기차요' },
  happiness: { low: '우울해요', mid: '보통이에요', high: '행복해요' },
}

const STAT_ORDER: CareStatId[] = ['satiety', 'cleanliness', 'affection', 'energy', 'happiness']
const HIGH_THRESHOLD = 70

function statusLabel(statId: CareStatId, value: number): string {
  const labels = STAT_STATUS_LABEL[statId]
  if (value < ATTENTION_THRESHOLD[statId]) return labels.low
  if (value >= HIGH_THRESHOLD) return labels.high
  return labels.mid
}

interface PetCareHudProps {
  stats: Record<CareStatId, number>
  intimacyLevel: number
  intimacyExp: number
  expToNext: number
  floatingDeltas: FloatingDelta[]
  /** Phase 3D-2 — local calendar days since PetMemory.firstMetAt (see lib/pet-care/visit-context.ts#daysSince). Optional/best-effort: when omitted, the Lv. chip renders exactly as it did before this Phase, with no stage label. */
  daysTogether?: number
}

/** Phase 3D-2 — "Lv.18 · 익숙한 친구": a small, optional relationship-stage label next to the level this HUD chip already showed. Presentation-only — computeRelationshipStage never changes intimacyLevel/intimacyExp themselves. */
export function PetCareHud({ stats, intimacyLevel, intimacyExp, expToNext, floatingDeltas, daysTogether }: PetCareHudProps) {
  const isMaxLevel = intimacyLevel >= MAX_LEVEL
  const stageLabel =
    daysTogether !== undefined ? RELATIONSHIP_STAGE_LABEL[computeRelationshipStage(intimacyLevel, daysTogether)] : null
  return (
    <div className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
      <div className="flex items-center gap-2 rounded-xl bg-secondary/60 px-2.5 py-1 toy-border sm:px-3 sm:py-1.5">
        <span className="font-display text-xs font-extrabold text-secondary-foreground">
          {formatLevelLabel(intimacyLevel)}
          {stageLabel && <span className="font-bold text-muted-foreground"> · {stageLabel}</span>}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card">
          <div
            role="progressbar"
            aria-label="Statling Lv. 진행도"
            aria-valuemin={0}
            aria-valuemax={isMaxLevel ? 1 : expToNext}
            aria-valuenow={isMaxLevel ? 1 : intimacyExp}
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: isMaxLevel ? '100%' : `${Math.min(100, (intimacyExp / expToNext) * 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground">
          {isMaxLevel ? 'MAX' : `${intimacyExp}/${expToNext}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
        {STAT_ORDER.map((statId) => {
          const Icon = STAT_ICON[statId]
          const value = stats[statId]
          const low = value < ATTENTION_THRESHOLD[statId]
          const delta = floatingDeltas.find((d) => d.statId === statId)
          return (
            <div
              key={statId}
              className={cn(
                'relative flex items-center gap-1.5 rounded-xl bg-card px-2 py-1.5 toy-border sm:gap-2 sm:px-3 sm:py-2',
                low && 'ring-2 ring-destructive/50',
              )}
            >
              <Icon size={18} className="shrink-0 sm:hidden" />
              <Icon size={20} className="hidden shrink-0 sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground sm:text-[11px]">{STAT_LABEL[statId]}</span>
                  <span className="font-display text-xs font-extrabold tabular-nums text-foreground sm:text-sm">{value}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={STAT_LABEL[statId]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                >
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', low ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className="hidden text-[10px] font-semibold text-muted-foreground sm:block">{statusLabel(statId, value)}</span>
              </div>
              {delta && <FloatingDeltaText key={delta.id} delta={delta.delta} className="right-2 top-1" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
