'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, RotateCcw, Trophy } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { trackEvent } from '@/lib/analytics/ga'
import { RadarChart } from '@/components/brain-bet/radar-chart'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'
import { pickTopTwoStats, STATS, STAT_DISPLAY_ORDER, type StatId } from '@/lib/brain-bet'
import { GAME_DIFFICULTIES } from '@/lib/game/difficulty'
import { getGameDisplayName, getGamePoolSize } from '@/lib/game/game-registry'
import type { MiniGamePerformanceRecord } from '@/lib/game/player-skill-storage'
import { cn } from '@/lib/utils'

interface StatusScreenProps {
  /** first-complete: the raw Intro diagnostic (finals), unchanged. my-stats: currentStats (category average — see lib/game/player-skill-storage.ts#computeCurrentStats). */
  values: Record<StatId, number>
  /** first-complete: right after the first 6 games. my-stats: viewed via Room nav. */
  context?: 'first-complete' | 'my-stats'
  /** my-stats only — the frozen Intro diagnostic, shown alongside currentStats so "최초 진단" and "지금 실력" never get confused with each other (see the my-stats UI below). */
  initialStats?: Record<StatId, number>
  /** my-stats only — every registered game's best record, for the per-stat "반영된 기록" breakdown. */
  gameBestRecords?: Record<string, MiniGamePerformanceRecord>
  onMeetStatling?: () => void
  onReplay?: () => void
}

export function StatusScreen({
  values,
  context = 'first-complete',
  initialStats,
  gameBestRecords,
  onMeetStatling,
  onReplay,
}: StatusScreenProps) {
  // Reuses the same top-two ranking (and random tie-break) that decides which
  // pet the player hatches (see lib/brain-bet.ts#pickTopTwoStats) instead of
  // a separate first-occurrence reduce, so "가장 강한 능력" always agrees with
  // whichever stats actually drove pet selection.
  const [firstStat, secondStat] = pickTopTwoStats(values)
  const isFirstComplete = context === 'first-complete'
  const { play } = useSound()
  const [expandedStat, setExpandedStat] = useState<StatId | null>(null)

  useEffect(() => {
    if (isFirstComplete) play('final-result')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once per mount, only for the real "all 6 games done" moment
  }, [])

  useEffect(() => {
    trackEvent('my_status_view', { view_context: context })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only
  }, [])

  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-5 py-8',
        !isFirstComplete && 'pb-28',
      )}
    >
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        {isFirstComplete ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground toy-border toy-shadow-sm">
            <Trophy size={14} strokeWidth={2.6} />
            6개 게임 모두 완료
          </span>
        ) : (
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            내 스탯
          </span>
        )}
      </header>

      <div className="mt-6 text-center">
        <h1 className="text-balance font-display text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
          MY <span className="text-primary">STATUS</span>
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          가장 강한 능력은{' '}
          <span className="font-bold text-foreground">{STATS[firstStat].name}</span>,{' '}
          <span className="font-bold text-foreground">{STATS[secondStat].name}</span>
          이에요.
        </p>
      </div>

      {!isFirstComplete && (
        <p className="mt-4 text-pretty text-center text-xs font-semibold leading-relaxed text-muted-foreground">
          현재 스탯은 각 미니게임의 최고 기록 평균을 기반으로 계산돼요.
          <br />
          게임별 랭킹은 각 미니게임 화면에서 확인할 수 있어요.
        </p>
      )}

      <div className="mt-6 grid items-center gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* radar */}
        <div className="rounded-3xl bg-card p-6 toy-border toy-shadow-lg sm:p-8">
          <RadarChart values={values} />
        </div>

        {/* stat values */}
        <ul className="grid gap-3">
          {STAT_DISPLAY_ORDER.map((id) => {
            const stat = STATS[id]
            const value = Math.round(values[id] ?? 0)
            const initial = initialStats ? Math.round(initialStats[id] ?? 0) : null
            const isExpanded = expandedStat === id
            const records = gameBestRecords
              ? Object.values(gameBestRecords).filter((record) => record.statCategory === id)
              : []
            const poolSize = gameBestRecords ? getGamePoolSize(id) : null

            return (
              <li key={id} className="rounded-2xl bg-card toy-border toy-shadow-sm">
                <button
                  type="button"
                  onClick={() => (gameBestRecords ? setExpandedStat(isExpanded ? null : id) : undefined)}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', gameBestRecords && 'cursor-pointer')}
                >
                  <StatBadge stat={stat} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-extrabold text-foreground">
                        {stat.name}
                      </span>
                      <span className="font-display text-lg font-extrabold leading-none text-foreground">
                        {value}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full border-2 border-[color:var(--ink)] bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${value}%`,
                          backgroundColor: `var(${stat.colorVar})`,
                        }}
                      />
                    </div>
                    {initial !== null && (
                      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                        현재 미니게임 기록 평균 · 최초 진단 {initial}
                        {poolSize !== null && (
                          <>
                            {' · '}
                            {records.length}/{poolSize}개 게임 반영
                            {records.length > 0 && records.length < poolSize && ' (임시)'}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  {gameBestRecords && (
                    <ChevronDown
                      size={16}
                      strokeWidth={2.6}
                      className={cn('shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                    />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-[color:var(--line)] px-4 py-3">
                    {records.length === 0 ? (
                      <p className="text-xs font-semibold text-muted-foreground">
                        아직 플레이한 기록이 없어서 최초 진단값({initial ?? 0})을 보여주고 있어요.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">반영된 기록</p>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {records.map((record) => (
                            <li key={record.gameId} className="flex items-center justify-between text-xs font-semibold text-foreground">
                              <span className="flex items-center gap-1.5">
                                {getGameDisplayName(record.gameId)}
                                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-secondary-foreground">
                                  {GAME_DIFFICULTIES[record.difficulty].label}
                                </span>
                              </span>
                              <span>{record.normalizedScore}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                          {records.length}개 기록의 평균 (게임마다 가장 높이 도전한 난이도 기록 기준) · 플레이 횟수·EXP는 반영되지 않아요.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* actions */}
      {isFirstComplete && (
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ToyButton onClick={onMeetStatling}>
            나의 Statling 만나러 가기
            <ArrowRight size={20} strokeWidth={2.8} />
          </ToyButton>
          <ToyButton variant="secondary" onClick={onReplay}>
            <RotateCcw size={20} strokeWidth={2.6} />
            다시 하기
          </ToyButton>
        </div>
      )}
    </div>
  )
}
