'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { NicknameSetupCard } from '@/components/brain-bet/nickname-setup-card'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { PLAY_ORDER, STATS, type StatId } from '@/lib/brain-bet'
import { GAME_POOL } from '@/lib/game/game-registry'
import { useAuth } from '@/lib/auth/auth-provider'
import { trackEvent } from '@/lib/analytics/ga'
import { getProfileNickname } from '@/lib/profile/nickname'
import {
  rankingProvider,
  type GameRankingEntry,
  type OverallRankingEntry,
  type RankedDifficulty,
} from '@/lib/ranking/ranking-provider'
import { fetchXpLeaderboard, type MyXpRank, type XpLeaderboardEntry } from '@/lib/ranking/xp-leaderboard'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type RankingTab = 'overall' | 'byGame' | 'xp'

const RANKING_TABS: { id: RankingTab; label: string }[] = [
  { id: 'overall', label: '종합 랭킹' },
  { id: 'byGame', label: '게임별 랭킹' },
  { id: 'xp', label: 'XP 랭킹' },
]

const DIFFICULTY_TABS: { id: RankedDifficulty; label: string }[] = [
  { id: 'hard', label: 'HARD' },
  { id: 'extreme', label: 'EXTREME' },
]

interface RankingScreenProps {
  /** Shown as "나"'s row label — the pet's own given name. */
  statlingName: string
}

/**
 * Bottom tab bar's 랭킹 destination. Three independent views, all backed by
 * lib/ranking/ranking-provider.ts so a future Supabase-backed leaderboard is
 * a provider swap, not a UI rewrite:
 * - 종합 랭킹: full list, best-first, derived from every mini-game's Hard-tier
 *   record (never XP, never Extreme, never a visible internal score).
 * - 게임별 랭킹: 능력 선택 → 게임 선택 → Hard/Extreme 선택 → 그 게임·난이도
 *   기록 랭킹, ranked by that game's own raw metric (lib/ranking/
 *   game-ranking-metrics.config.ts). Each stat is purely a grouping
 *   category here; the actual ranking only ever happens per individual
 *   game+difficulty.
 * - XP 랭킹: totalXp only — the one ranking view XP is allowed to appear
 *   in; it never feeds 종합 랭킹's calculation.
 * All three pin a "내 순위" summary at the top of their list (see
 * MyRankCard) so a low rank is never something you have to scroll to find.
 */
export function RankingScreen({ statlingName }: RankingScreenProps) {
  const [activeTab, setActiveTab] = useState<RankingTab>('overall')
  const { user } = useAuth()

  // Fires on mount (the default 'overall' tab) and every subsequent tab
  // switch. `period` has no real filter behind it yet (no daily/weekly view
  // exists) — sent as a fixed 'all_time' placeholder rather than omitted, so
  // the parameter is present the moment a real period filter ships.
  useEffect(() => {
    trackEvent('ranking_view', { ranking_type: activeTab, period: 'all_time' })
  }, [activeTab])

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
                'flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold toy-border transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="mt-6">
        {activeTab === 'overall' && <OverallRankingPanel statlingName={statlingName} userId={user?.id ?? null} />}
        {activeTab === 'byGame' && <ByGameRankingPanel statlingName={statlingName} userId={user?.id ?? null} />}
        {activeTab === 'xp' && <XpRankingPanel statlingName={statlingName} />}
      </div>
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-muted/60" aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * "내 순위" summary — sticky at the top of every list panel so a low rank
 * never requires scrolling through the whole board to find. `rank: null`
 * (no record yet at this tab/game/difficulty) shows `emptyText` instead of
 * a rank number.
 */
function MyRankCard({
  loading,
  rank,
  label,
  detail,
  emptyText,
}: {
  loading: boolean
  rank: number | null
  label: string
  detail?: ReactNode
  emptyText: string
}) {
  return (
    <div className="sticky top-0 z-20 -mt-2 bg-background/95 pb-3 pt-2 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 toy-border toy-shadow-sm">
        {loading ? (
          <div className="h-9 w-full animate-pulse rounded-xl bg-muted/50" aria-hidden="true" />
        ) : rank == null ? (
          <p className="text-sm font-bold text-foreground">{emptyText}</p>
        ) : (
          <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground">
              {rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-accent-foreground/70">{label}</p>
              {detail}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OverallRankingPanel({ statlingName, userId }: { statlingName: string; userId: string | null }) {
  const [entries, setEntries] = useState<OverallRankingEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    rankingProvider.getOverallRanking({ displayName: statlingName || '게스트', userId }).then((result) => {
      if (!cancelled) setEntries(result)
    })
    return () => {
      cancelled = true
    }
  }, [statlingName, userId])

  const myIndex = entries?.findIndex((entry) => entry.isMe) ?? -1
  const myRank = myIndex >= 0 ? myIndex + 1 : null

  return (
    <div className="flex flex-col gap-2">
      <MyRankCard
        loading={entries === null}
        rank={myRank}
        label="내 종합 랭킹"
        detail={<p className="font-display text-lg font-extrabold text-foreground">{myRank}위</p>}
        emptyText="아직 게임 기록이 없어 종합 랭킹에 표시되지 않아요."
      />
      {entries === null
        ? <RankingSkeleton />
        : entries.map((entry, index) => (
            <RankRow key={entry.id} rank={index + 1} displayName={entry.displayName} isMe={entry.isMe} />
          ))}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        각 미니게임의 Hard 기록을 바탕으로 계산돼요. 다른 유저의 실제 기록은 서버 연동 후 반영될 예정이에요.
      </p>
    </div>
  )
}

/**
 * Phase 3B-4 — real Supabase-backed leaderboard, unlike the other two panels
 * above (still lib/ranking/ranking-provider.ts mock data — 종합/게임별 랭킹
 * are out of this phase's scope). Deliberately its own state machine rather
 * than reusing OverallRankingPanel/ByGameRankingPanel's simple
 * `entries: T[] | null` shape: a real backend adds guest/no-nickname/error
 * states none of the mock panels have to handle.
 */
type XpPanelState =
  | { kind: 'guest' }
  | { kind: 'loading' }
  | { kind: 'needsNickname' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: XpLeaderboardEntry[]; myRank: MyXpRank | null }

function XpRankingGuestPrompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-8 text-center toy-border">
      <p className="text-sm font-bold text-foreground">로그인하고 랭킹에 참여해보세요</p>
      <p className="text-xs text-muted-foreground">XP 랭킹은 로그인한 사용자만 볼 수 있어요.</p>
      <AuthForm className="mt-2 w-full" defaultMode="signin" />
    </div>
  )
}

function XpRankingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-8 text-center toy-border">
      <p className="text-sm font-bold text-foreground">{message}</p>
      <ToyButton variant="secondary" onClick={onRetry}>
        다시 시도
      </ToyButton>
    </div>
  )
}

function XpRankingPanel({ statlingName }: { statlingName: string }) {
  const { user } = useAuth()
  const [state, setState] = useState<XpPanelState>({ kind: user ? 'loading' : 'guest' })
  const [reloadToken, setReloadToken] = useState(0)

  // nickname -> leaderboard, in that order, every time the signed-in user
  // (or a manual retry) changes — never fires an RPC at all while `user` is
  // null (see the 'guest' branch), matching this RPC pair's authenticated-only
  // access.
  useEffect(() => {
    if (!user) {
      setState({ kind: 'guest' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })

    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }

    getProfileNickname(client, user.id).then((nicknameResult) => {
      if (cancelled) return
      if (!nicknameResult.ok) {
        if (process.env.NODE_ENV !== 'production') console.warn('[ranking] nickname fetch failed:', nicknameResult.error)
        setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
        return
      }
      if (!nicknameResult.nickname || nicknameResult.nickname.trim() === '') {
        setState({ kind: 'needsNickname' })
        return
      }
      fetchXpLeaderboard(client).then((leaderboardResult) => {
        if (cancelled) return
        if (!leaderboardResult.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] xp leaderboard fetch failed:', leaderboardResult.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        setState({ kind: 'ready', entries: leaderboardResult.entries, myRank: leaderboardResult.myRank })
      })
    })

    return () => {
      cancelled = true
    }
  }, [user, reloadToken])

  // Nickname was just saved — no need to re-check it, go straight to the
  // leaderboard fetch instead of re-running the whole effect above.
  async function loadAfterNicknameSaved() {
    if (!user) return
    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }
    setState({ kind: 'loading' })
    const leaderboardResult = await fetchXpLeaderboard(client)
    if (!leaderboardResult.ok) {
      if (process.env.NODE_ENV !== 'production') console.warn('[ranking] xp leaderboard fetch failed:', leaderboardResult.error)
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }
    setState({ kind: 'ready', entries: leaderboardResult.entries, myRank: leaderboardResult.myRank })
  }

  if (state.kind === 'guest') return <XpRankingGuestPrompt />
  if (state.kind === 'needsNickname') {
    return <NicknameSetupCard statlingName={statlingName} onSaved={() => void loadAfterNicknameSaved()} />
  }
  if (state.kind === 'error') {
    return <XpRankingErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} />
  }

  const loading = state.kind === 'loading'
  const entries = state.kind === 'ready' ? state.entries : []
  const myRank = state.kind === 'ready' ? state.myRank : null

  return (
    <div className="flex flex-col gap-2">
      <MyRankCard
        loading={loading}
        rank={myRank?.rank ?? null}
        label="내 XP 랭킹"
        detail={
          myRank ? (
            <p className="font-display text-lg font-extrabold text-foreground">
              {myRank.rank}위 <span className="text-xs font-bold text-muted-foreground">· {myRank.totalXp.toLocaleString()} XP</span>
            </p>
          ) : undefined
        }
        emptyText="아직 랭킹 기록이 없어요. 게임을 플레이하면 순위가 기록돼요."
      />
      {loading ? (
        <RankingSkeleton />
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-muted-foreground">아직 랭킹 기록이 없어요.</p>
      ) : (
        // RPC never returns user_id, and duplicate nicknames are allowed
        // (Phase 3B-2) — there is no safe way to tell which row is "me" here,
        // so isMe is always false; MyRankCard above already covers "내 순위".
        entries.map((entry) => (
          <RankRow
            key={entry.rank}
            rank={entry.rank}
            displayName={entry.nickname}
            isMe={false}
            trailing={<span className="shrink-0 font-display text-sm font-extrabold text-foreground">{entry.totalXp.toLocaleString()} XP</span>}
          />
        ))
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        게임을 완료할 때마다 점수만큼 XP를 얻어요. 최대 100명까지 표시돼요.
      </p>
    </div>
  )
}

function ByGameRankingPanel({ statlingName, userId }: { statlingName: string; userId: string | null }) {
  const [selectedStat, setSelectedStat] = useState<StatId | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<RankedDifficulty>('hard')
  const [entries, setEntries] = useState<GameRankingEntry[] | null>(null)

  useEffect(() => {
    if (!selectedGameId) {
      setEntries(null)
      return
    }
    let cancelled = false
    setEntries(null)
    rankingProvider
      .getGameRanking({ gameId: selectedGameId, difficulty: selectedDifficulty, displayName: statlingName || '게스트', userId })
      .then((result) => {
        if (!cancelled) setEntries(result)
      })
    return () => {
      cancelled = true
    }
  }, [selectedGameId, selectedDifficulty, statlingName, userId])

  if (selectedStat && selectedGameId) {
    const game = GAME_POOL[selectedStat].find((g) => g.key === selectedGameId)
    const myIndex = entries?.findIndex((entry) => entry.isMe) ?? -1
    const myEntry = myIndex >= 0 ? entries?.[myIndex] : undefined
    const myRank = myIndex >= 0 ? myIndex + 1 : null

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

        <div role="tablist" aria-label="난이도" className="flex gap-2">
          {DIFFICULTY_TABS.map((tab) => {
            const isActive = tab.id === selectedDifficulty
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedDifficulty(tab.id)}
                className={cn(
                  'flex-1 rounded-xl px-3 py-2 text-xs font-bold toy-border transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <MyRankCard
          loading={entries === null}
          rank={myRank}
          label={`내 기록 (${DIFFICULTY_TABS.find((t) => t.id === selectedDifficulty)?.label})`}
          detail={
            <p className="font-display text-lg font-extrabold text-foreground">
              {myRank}위{' '}
              {myEntry && <span className="text-xs font-bold text-muted-foreground">· {myEntry.primaryDisplay}</span>}
            </p>
          }
          emptyText="이 난이도에서 아직 기록이 없어요."
        />

        <div className="flex flex-col gap-2">
          {entries === null
            ? <RankingSkeleton />
            : entries.map((entry, index) => (
                <RankRow
                  key={entry.id}
                  rank={index + 1}
                  displayName={entry.displayName}
                  isMe={entry.isMe}
                  trailing={<span className="shrink-0 font-display text-sm font-extrabold text-foreground">{entry.primaryDisplay}</span>}
                  subtitle={entry.tiebreakerDisplay}
                />
              ))}
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
              onClick={() => {
                setSelectedDifficulty('hard')
                setSelectedGameId(game.key)
              }}
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

/** Shared row shape for all three ranking lists — `trailing` (a metric/XP figure) and `subtitle` (a tiebreaker line) are both optional so 종합 랭킹 can render rank+name only, matching "내부 점수는 노출하지 않음". */
function RankRow({
  rank,
  displayName,
  isMe,
  subtitle,
  trailing,
}: {
  rank: number
  displayName: string
  isMe: boolean
  subtitle?: string
  trailing?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3 toy-border',
        isMe ? 'bg-accent toy-shadow-sm' : 'bg-card',
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
          {displayName}
          {isMe && <span className="ml-1.5 text-[10px] font-bold text-primary">나</span>}
        </p>
        {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {trailing}
    </div>
  )
}
