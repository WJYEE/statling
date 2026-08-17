'use client'

import { useEffect, useMemo, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ArrowLeft, Check, Trophy } from 'lucide-react'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { cn } from '@/lib/utils'
import { localDateKey } from '@/lib/missions/attendance-storage'
import { pickTodayMissions, type DailyMissionDef } from '@/lib/missions/daily-missions.config'
import { ensureToday, loadDailyMissionState, type DailyMissionState } from '@/lib/missions/daily-mission-storage'
import { claimAchievementReward, claimDailyMissionReward, evaluateSyncAchievements, type ClaimAchievementResult } from '@/lib/missions/mission-tracker'
import { evaluateRankAchievements } from '@/lib/missions/ranking-achievements'
import { loadAchievementState } from '@/lib/missions/achievement-storage'
import { ACHIEVEMENT_CATEGORY_LABELS, type AchievementCategory } from '@/lib/missions/achievements.config'
import type { AchievementTierProgress } from '@/lib/missions/achievement-evaluator'
import { ROOM_ASSETS } from '@/lib/room-assets'

/** A tier's status relative to the player's own AchievementState — see lib/missions/achievement-storage.ts. Purely a display concept, never persisted itself (derived fresh from unlockedTierIds/claimedTierIds + the live `completed` each render). */
type AchievementTierStatus = 'in_progress' | 'completed_unclaimed' | 'claimed'

function statusFor(item: AchievementTierProgress, claimedTierIds: readonly string[]): AchievementTierStatus {
  if (claimedTierIds.includes(item.tierId)) return 'claimed'
  if (item.completed) return 'completed_unclaimed'
  return 'in_progress'
}

/** Correct 을/를 for a Korean noun by checking whether its last syllable has a batchim (Hangul syllables are a fixed Unicode block starting at U+AC00, in 28-value groups — remainder 0 means no final consonant). Falls back to '를' for anything that isn't a plain Hangul syllable (defensive only — every Room reward name in lib/room-assets.ts is Korean). */
function withObjectParticle(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}를`
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return `${word}${hasBatchim ? '을' : '를'}`
}

/** "100 XP와 산 액자를 획득했어요!" / "산 액자를 획득했어요!" / "100 XP를 획득했어요!" — concise claim-success feedback, see Part D of the achievement-claim spec. */
function buildClaimToastTitle(result: ClaimAchievementResult): string {
  const roomAssetName = result.roomReward ? ROOM_ASSETS[result.roomReward]?.name : undefined
  if (roomAssetName && result.rewardXp) {
    return `${result.rewardXp} XP와 ${withObjectParticle(roomAssetName)} 획득했어요!`
  }
  if (roomAssetName) {
    return `${withObjectParticle(roomAssetName)} 획득했어요!`
  }
  return `${result.rewardXp ?? 0} XP를 획득했어요!`
}

type MissionTab = 'daily' | 'achievement'

const MISSION_TABS: { id: MissionTab; label: string }[] = [
  { id: 'daily', label: '일일 미션' },
  { id: 'achievement', label: '업적' },
]

const CATEGORY_ORDER: AchievementCategory[] = ['attendance', 'game', 'bond', 'growth', 'collection', 'share']

/** Achievement families whose metric is a rank position (lower is better) — displayed as "현재 N위" text instead of a fraction/progress bar. See lib/missions/achievements.config.ts's RANK_ACHIEVEMENT_METRICS. */
const RANK_FAMILY_IDS = new Set(['best-game-rank', 'overall-rank'])

interface MissionScreenProps {
  onBack: () => void
  /** "나" identity for the rank-based achievement check — same values RankingScreen already uses. */
  statlingName: string
  userId: string | null
}

/** Home's 🎯 button destination — tabbed 일일 미션 / 업적, both backed by lib/missions/*. */
export function MissionScreen({ onBack, statlingName, userId }: MissionScreenProps) {
  const [activeTab, setActiveTab] = useState<MissionTab>('daily')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-24 pt-8 sm:pb-10">
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
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">미션</p>
          <h1 className="font-display text-xl font-extrabold text-foreground">오늘의 미션을 확인해보세요</h1>
        </div>
      </header>

      <div role="tablist" aria-label="미션 카테고리" className="mt-6 flex gap-2">
        {MISSION_TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 rounded-2xl px-4 py-2.5 text-sm font-bold toy-border transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="mt-6">
        {activeTab === 'daily' ? <DailyMissionPanel /> : <AchievementPanel statlingName={statlingName} userId={userId} />}
      </div>
    </div>
  )
}

function DailyMissionPanel() {
  const todaysMissions = useMemo(() => pickTodayMissions(localDateKey(new Date())), [])
  const [state, setState] = useState<DailyMissionState>(() => ensureToday(loadDailyMissionState(), new Date()))

  function handleClaim(mission: DailyMissionDef) {
    const result = claimDailyMissionReward(mission.id, mission.target, mission.rewardXp, new Date())
    if (result.claimed) setState(ensureToday(loadDailyMissionState(), new Date()))
  }

  return (
    <div className="flex flex-col gap-2">
      {todaysMissions.map((mission) => {
        const progress = Math.min(state.progress[mission.id] ?? 0, mission.target)
        const isComplete = progress >= mission.target
        const isClaimed = state.claimed.includes(mission.id)
        return (
          <div key={mission.id} className="rounded-2xl bg-card px-4 py-3.5 toy-border toy-shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-extrabold text-foreground">{mission.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{mission.description}</p>
              </div>
              <ToyButton
                className="shrink-0 px-3 py-2 text-xs"
                variant={isClaimed ? 'secondary' : 'primary'}
                disabled={!isComplete || isClaimed}
                onClick={() => handleClaim(mission)}
              >
                {isClaimed ? '완료' : `+${mission.rewardXp} XP`}
              </ToyButton>
            </div>
            {/* fill uses bg-primary/45 (not bg-secondary) while in progress —
                bg-secondary and the track's bg-muted render nearly (light
                mode) or exactly (dark mode) identical, making the fill
                invisible regardless of its width. See AchievementRow's
                identical fix below for the same underlying issue. */}
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', isComplete ? 'bg-primary' : 'bg-primary/45')}
                style={{ width: `${Math.min(100, (progress / mission.target) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[10px] font-bold text-muted-foreground">
              {progress}/{mission.target}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function AchievementPanel({ statlingName, userId }: { statlingName: string; userId: string | null }) {
  const [progress, setProgress] = useState<AchievementTierProgress[] | null>(null)
  const [claimedTierIds, setClaimedTierIds] = useState<string[]>(() => loadAchievementState().claimedTierIds)
  const toastManager = Toast.useToastManager()

  useEffect(() => {
    let cancelled = false
    // Sync families resolve instantly (no network); rank families need an
    // async ranking-provider round trip, so they're merged in once ready
    // rather than blocking the whole tab on them — see
    // lib/missions/ranking-achievements.ts.
    const syncProgress = evaluateSyncAchievements()
    if (!cancelled) {
      setProgress(syncProgress)
      // Re-read after evaluateSyncAchievements — it may have just unlocked
      // (but never auto-claims) a tier, which doesn't change claimedTierIds,
      // but keeps this in sync with whatever WAS already claimed on load.
      setClaimedTierIds(loadAchievementState().claimedTierIds)
    }
    evaluateRankAchievements(statlingName || '게스트', userId).then((rankProgress) => {
      if (cancelled) return
      setProgress((prev) => [...(prev ?? []), ...rankProgress])
      setClaimedTierIds(loadAchievementState().claimedTierIds)
    })
    return () => {
      cancelled = true
    }
  }, [statlingName, userId])

  function handleClaim(item: AchievementTierProgress) {
    const result = claimAchievementReward(item.tierId)
    if (!result.claimed) return // already claimed / not actually unlocked — silent no-op, see claimAchievementReward's own guard
    setClaimedTierIds(loadAchievementState().claimedTierIds)
    toastManager.add({ title: buildClaimToastTitle(result), type: 'success' })
  }

  if (progress === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" aria-hidden="true" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {CATEGORY_ORDER.map((category) => {
        const items = progress.filter((p) => p.category === category)
        if (items.length === 0) return null
        return (
          <div key={category}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {ACHIEVEMENT_CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <AchievementRow
                  key={item.tierId}
                  item={item}
                  status={statusFor(item, claimedTierIds)}
                  onClaim={() => handleClaim(item)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AchievementRow({
  item,
  status,
  onClaim,
}: {
  item: AchievementTierProgress
  status: AchievementTierStatus
  onClaim: () => void
}) {
  const isRank = RANK_FAMILY_IDS.has(item.familyId)
  const value = item.currentValue ?? 0
  // Drives every "does this look done" visual below — deliberately the
  // derived status, not the live `item.completed`, so a claimed tier always
  // reads as done even in the (currently never-happens, but not
  // type-guaranteed) case a metric's live value were to regress.
  const isCompletedLike = status !== 'in_progress'
  // Real ROOM_ASSETS PNG (never a placeholder icon) — only set for the
  // handful of "특별 Achievement" tiers with a roomReward (see
  // lib/missions/achievements.config.ts). Most tiers stay XP-only. Shown
  // regardless of status — in_progress/completed_unclaimed show it as a
  // preview of what's coming, claimed shows it as confirmation of what was
  // actually received (same PNG either way, reused as-is).
  const roomAsset = item.roomReward ? ROOM_ASSETS[item.roomReward] : undefined

  return (
    <div className={cn('rounded-2xl px-4 py-3.5 toy-border', isCompletedLike ? 'bg-accent toy-shadow-sm' : 'bg-card')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-extrabold text-foreground">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        </div>
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full toy-border',
            isCompletedLike ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {isCompletedLike ? <Check size={14} strokeWidth={3} /> : <Trophy size={13} strokeWidth={2.2} />}
        </span>
      </div>

      {isRank ? (
        <p className="mt-2 text-[11px] font-bold text-muted-foreground">
          {Number.isFinite(value) ? `현재 ${value}위 (목표: Top ${item.target})` : '아직 순위 기록이 없어요.'}
        </p>
      ) : (
        <>
          {/* Fill is bg-primary/45 while in progress, solid bg-primary once
              completed — bg-secondary (the old fill color) renders nearly
              (light mode) or byte-for-byte identical (dark mode) to the
              track's own bg-muted, so a partially-filled bar was previously
              invisible regardless of its (correctly-computed) width. */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', isCompletedLike ? 'bg-primary' : 'bg-primary/45')}
              style={{ width: `${Math.min(100, (value / item.target) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] font-bold text-muted-foreground">
            {Math.min(value, item.target)}/{item.target}
          </p>
        </>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-primary">+{item.rewardXp} XP</p>
        {roomAsset && (
          <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-secondary/60 py-0.5 pl-0.5 pr-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a pre-authored static PNG, matches theme-screen.tsx's convention */}
              <img src={roomAsset.src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
            </span>
            <span className="truncate text-[10px] font-bold text-foreground">{roomAsset.name}</span>
          </div>
        )}
      </div>

      {status === 'completed_unclaimed' && (
        <ToyButton className="mt-2.5 w-full py-2.5 text-xs" onClick={onClaim}>
          보상 받기
        </ToyButton>
      )}
      {status === 'claimed' && (
        <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground">
          <Check size={12} strokeWidth={3} />
          보상 수령 완료
        </p>
      )}
    </div>
  )
}
