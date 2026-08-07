'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Trophy } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { PLAY_ORDER, STATS, type StatId } from '@/lib/brain-bet'
import { GAME_POOL } from '@/lib/game/game-registry'
import { useAuth } from '@/lib/auth/auth-provider'
import { rankingProvider, type GameRankingEntry, type OverallRankingResult } from '@/lib/ranking/ranking-provider'
import { cn } from '@/lib/utils'

type RankingTab = 'overall' | 'byGame'

const RANKING_TABS: { id: RankingTab; label: string }[] = [
  { id: 'overall', label: '종합 랭킹' },
  { id: 'byGame', label: '게임별 랭킹' },
]

interface RankingScreenProps {
  /** Shown as "나"'s row label — the pet's own given name. */
  statlingName: string
}

/**
 * Bottom tab bar's 랭킹 destination. Two independent views, both backed by
 * lib/ranking/ranking-provider.ts so a future Supabase-backed leaderboard is
 * a provider swap, not a UI rewrite:
 * - 종합 랭킹: one rank number derived from every mini-game's record
 *   (never XP, never a visible composite score — see ranking-provider.ts).
 * - 게임별 랭킹: 능력 선택 → 게임 선택 → 그 게임 기록 랭킹. Each stat is
 *   purely a grouping category here; the actual ranking only ever happens
 *   per individual game.
 */
export function RankingScreen({ statlingName }: RankingScreenProps) {
  const [activeTab, setActiveTab] = useState<RankingTab>('overall')
  const { user } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">랭킹</p>
        <h1 className="font-display text-2xl font-extrabold text-foreground">랭킹</h1>
      </header>

      <div role="tablist" aria-label="랭킹 종류" className="mt-6 flex gap-2">
        {RANKING_TABS.map((tab) => {
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
        {activeTab === 'overall' ? (
          <OverallRankingPanel statlingName={statlingName} userId={user?.id ?? null} />
        ) : (
          <ByGameRankingPanel statlingName={statlingName} userId={user?.id ?? null} />
        )}
      </div>
    </div>
  )
}

function OverallRankingPanel({ statlingName, userId }: { statlingName: string; userId: string | null }) {
  const [result, setResult] = useState<OverallRankingResult | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    setResult('loading')
    rankingProvider.getOverallRanking({ displayName: statlingName || '게스트', userId }).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [statlingName, userId])

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-6 py-10 toy-border toy-shadow">
      {result === 'loading' ? (
        <div className="h-24 w-full max-w-xs animate-pulse rounded-2xl bg-muted/60" aria-hidden="true" />
      ) : result.rank == null ? (
        <>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            <Trophy size={26} strokeWidth={2.2} />
          </span>
          <p className="max-w-xs text-center text-sm font-bold text-foreground">
            아직 종합 랭킹을 계산할 기록이 없어요.
          </p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            미니게임을 플레이하면 그 기록을 바탕으로 종합 랭킹이 매겨져요.
          </p>
        </>
      ) : (
        <>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground toy-border">
            <Trophy size={26} strokeWidth={2.2} />
          </span>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">종합 랭킹</p>
          <p className="font-display text-4xl font-extrabold text-foreground">{result.rank.toLocaleString()}위</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            각 미니게임 기록을 바탕으로 계산돼요. 게임을 더 플레이하면 순위가 바뀔 수 있어요.
          </p>
        </>
      )}
    </div>
  )
}

function ByGameRankingPanel({ statlingName, userId }: { statlingName: string; userId: string | null }) {
  const [selectedStat, setSelectedStat] = useState<StatId | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [entries, setEntries] = useState<GameRankingEntry[] | null>(null)

  useEffect(() => {
    if (!selectedGameId) {
      setEntries(null)
      return
    }
    let cancelled = false
    setEntries(null)
    rankingProvider
      .getGameRanking({ gameId: selectedGameId, displayName: statlingName || '게스트', userId })
      .then((result) => {
        if (!cancelled) setEntries(result)
      })
    return () => {
      cancelled = true
    }
  }, [selectedGameId, statlingName, userId])

  if (selectedStat && selectedGameId) {
    const game = GAME_POOL[selectedStat].find((g) => g.key === selectedGameId)
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setSelectedGameId(null)}
          className="flex w-fit items-center gap-1 text-xs font-bold text-muted-foreground"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          게임 선택으로
        </button>
        <div className="flex items-center gap-2 px-1">
          <StatBadge stat={STATS[selectedStat]} size="sm" />
          <p className="font-display text-sm font-extrabold text-foreground">{game?.name ?? selectedGameId}</p>
        </div>
        <div className="mt-1 flex flex-col gap-2">
          {entries === null
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-muted/60" aria-hidden="true" />
              ))
            : entries.map((entry, index) => <GameRankingRow key={entry.id} rank={index + 1} entry={entry} />)}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          이 게임의 실제 기록 기준으로 순위가 매겨져요. 다른 유저의 실제 기록은 서버 연동 후 반영될 예정이에요.
        </p>
      </div>
    )
  }

  if (selectedStat) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setSelectedStat(null)}
          className="flex w-fit items-center gap-1 text-xs font-bold text-muted-foreground"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          능력 선택으로
        </button>
        <div className="flex items-center gap-2 px-1">
          <StatBadge stat={STATS[selectedStat]} size="sm" />
          <p className="font-display text-sm font-extrabold text-foreground">{STATS[selectedStat].name}의 게임</p>
        </div>
        <div className="mt-1 flex flex-col gap-2">
          {GAME_POOL[selectedStat].map((game) => (
            <button
              key={game.key}
              type="button"
              onClick={() => setSelectedGameId(game.key)}
              className="flex items-center justify-between rounded-2xl bg-card px-4 py-3.5 text-left toy-border"
            >
              <span className="font-display text-sm font-extrabold text-foreground">{game.name}</span>
              <ChevronRight size={18} strokeWidth={2.4} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PLAY_ORDER.map((statId) => (
        <button
          key={statId}
          type="button"
          onClick={() => setSelectedStat(statId)}
          className="flex flex-col items-center gap-2 rounded-2xl bg-card px-3 py-4 toy-border"
        >
          <StatBadge stat={STATS[statId]} size="sm" />
          <span className="font-display text-xs font-extrabold text-foreground">{STATS[statId].name}</span>
        </button>
      ))}
    </div>
  )
}

function GameRankingRow({ rank, entry }: { rank: number; entry: GameRankingEntry }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3 toy-border',
        entry.isMe ? 'bg-accent toy-shadow-sm' : 'bg-card',
      )}
    >
      <span
        className={cn(
          'w-6 shrink-0 text-center font-display text-sm font-extrabold',
          rank <= 3 ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-extrabold text-foreground">
          {entry.displayName}
          {entry.isMe && <span className="ml-1.5 text-[10px] font-bold text-primary">나</span>}
        </p>
        {entry.raw && <p className="truncate text-[11px] text-muted-foreground">{entry.raw.primary}</p>}
      </div>
      <p className="shrink-0 font-display text-sm font-extrabold text-foreground">{entry.normalizedScore}점</p>
    </div>
  )
}
