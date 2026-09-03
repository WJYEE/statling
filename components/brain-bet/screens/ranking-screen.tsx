'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, UserMinus } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { ConfirmDialog } from '@/components/brain-bet/confirm-dialog'
import { NicknameSetupCard } from '@/components/brain-bet/nickname-setup-card'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { PLAY_ORDER, STATS, type StatId } from '@/lib/brain-bet'
import { GAME_POOL } from '@/lib/game/game-registry'
import { getGameRankingMetricConfig } from '@/lib/ranking/game-ranking-metrics.config'
import { useAuth } from '@/lib/auth/auth-provider'
import { trackEvent } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { getProfileNickname } from '@/lib/profile/nickname'
import type { RankedDifficulty } from '@/lib/ranking/ranking-provider'
import { fetchGameLeaderboard } from '@/lib/ranking/game-leaderboard'
import { fetchOverallLeaderboard } from '@/lib/ranking/overall-leaderboard'
import { fetchXpLeaderboard } from '@/lib/ranking/xp-leaderboard'
import { fetchFriendGameRanking } from '@/lib/ranking/friend-game-leaderboard'
import { fetchFriendOverallRanking } from '@/lib/ranking/friend-overall-leaderboard'
import { fetchFriendXpRanking } from '@/lib/ranking/friend-xp-leaderboard'
import { removeFriendship } from '@/lib/friends/friend-connection'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type RankingTab = 'overall' | 'byGame' | 'xp'

const RANKING_TABS: { id: RankingTab; label: string }[] = [
  { id: 'overall', label: '종합 랭킹' },
  { id: 'byGame', label: '게임별 랭킹' },
  { id: 'xp', label: 'XP 랭킹' },
]

/**
 * Phase 3G-3 — top-level ranking population, independent of which of the 3
 * ranking types below is selected. 'global' is the untouched, pre-existing
 * behavior (every ranking-eligible user); 'friends' re-runs the identical
 * formula/eligibility/tie-break per type against just the caller + their
 * confirmed friendships (see supabase/migrations/20260829000000_phase3g3_
 * friend_ranking_rpcs.sql). Not persisted (localStorage etc.) — every fresh
 * entry into Ranking starts at 'global', matching existing behavior exactly;
 * 'friends' is shown only for the duration the user has it selected.
 */
type RankingScope = 'global' | 'friends'

const RANKING_SCOPES: { id: RankingScope; label: string }[] = [
  { id: 'global', label: '전체' },
  { id: 'friends', label: '친구' },
]

const DIFFICULTY_TABS: { id: RankedDifficulty; label: string }[] = [
  { id: 'hard', label: 'HARD' },
  { id: 'extreme', label: 'EXTREME' },
]

interface RankingScreenProps {
  /** Shown as "나"'s row label — the pet's own given name. */
  statlingName: string
}

function RankingHeader() {
  return (
    <header>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">랭킹</p>
      <h1 className="font-display text-2xl font-extrabold text-foreground">랭킹</h1>
    </header>
  )
}

/**
 * Phase 3B-4 Follow-up — profiles.nickname is shared by all 3 tabs (종합/
 * 게임별/XP), so whether it exists is checked exactly once here, before any
 * tab renders — not per-tab (that was Phase 3B-4's original, now-removed
 * XP-only gate inside XpRankingPanel). `ready` only means "nickname
 * confirmed to exist"; it says nothing about whether the XP leaderboard
 * fetch itself will succeed — that's XpRankingPanel's own concern.
 */
type RankingGateState =
  | { kind: 'guest' }
  | { kind: 'loading' }
  | { kind: 'needsNickname' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }

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
  const [scope, setScope] = useState<RankingScope>('global')
  const { user } = useAuth()
  const [gate, setGate] = useState<RankingGateState>({ kind: user ? 'loading' : 'guest' })
  const [gateReloadToken, setGateReloadToken] = useState(0)

  // Fires on mount (the default 'overall' tab) and every subsequent tab
  // switch. `period` has no real filter behind it yet (no daily/weekly view
  // exists) — sent as a fixed 'all_time' placeholder rather than omitted, so
  // the parameter is present the moment a real period filter ships.
  useEffect(() => {
    trackEvent('ranking_view', { ranking_type: activeTab, period: 'all_time' })
  }, [activeTab])

  /**
   * Phase 3G-5 — friend_ranking_viewed for 종합/XP only; 게임별 fires its own
   * copy from ByGameRankingPanel below, once a specific game+difficulty is
   * actually selected (game_id/difficulty aren't known at this level, and
   * "게임별 랭킹" tab alone doesn't mean a ranking is being viewed yet — the
   * stat/game picker has to be navigated first). Keyed on [activeTab, scope]
   * only — never on a panel's own reloadToken, so a "다시 시도" click can
   * never re-fire this; matches the existing ranking_view effect's own
   * once-per-tab-change choke point immediately above, just additionally
   * gated to scope === 'friends'.
   */
  useEffect(() => {
    if (scope !== 'friends') return
    if (activeTab === 'overall') {
      trackEvent('friend_ranking_viewed', { ranking_type: 'overall' })
      trackProductEvent('friend_ranking_viewed', { ranking_type: 'overall' })
    } else if (activeTab === 'xp') {
      trackEvent('friend_ranking_viewed', { ranking_type: 'xp' })
      trackProductEvent('friend_ranking_viewed', { ranking_type: 'xp' })
    }
  }, [activeTab, scope])

  // Common nickname gate — never fires the nickname read at all for a guest
  // (matches profiles_select_own's authenticated-only reach anyway).
  useEffect(() => {
    if (!user) {
      setGate({ kind: 'guest' })
      return
    }
    let cancelled = false
    setGate({ kind: 'loading' })

    const client = getSupabaseBrowserClient()
    if (!client) {
      setGate({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }

    getProfileNickname(client, user.id).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (process.env.NODE_ENV !== 'production') console.warn('[ranking] nickname fetch failed:', result.error)
        setGate({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
        return
      }
      setGate({ kind: !result.nickname || result.nickname.trim() === '' ? 'needsNickname' : 'ready' })
    })

    return () => {
      cancelled = true
    }
  }, [user, gateReloadToken])

  if (gate.kind === 'guest') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
        <RankingHeader />
        <div className="mt-6">
          <RankingGuestPrompt />
        </div>
      </div>
    )
  }

  if (gate.kind === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
        <RankingHeader />
        <div className="mt-6">
          <RankingSkeleton />
        </div>
      </div>
    )
  }

  if (gate.kind === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
        <RankingHeader />
        <div className="mt-6">
          <RankingErrorState message={gate.message} onRetry={() => setGateReloadToken((t) => t + 1)} />
        </div>
      </div>
    )
  }

  if (gate.kind === 'needsNickname') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
        <RankingHeader />
        <div className="mt-6">
          <NicknameSetupCard statlingName={statlingName} onSaved={() => setGate({ kind: 'ready' })} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
      <RankingHeader />

      {/* Phase 3G-3 — scope selector, deliberately smaller/more muted than
          the type tabs below it (a segmented control, not a second equal-
          weight tab row) so the two rows read as "broad filter, then
          specific view" rather than two competing navigations — see the
          Phase 3G-3 report's mobile-layout note. */}
      <div role="tablist" aria-label="랭킹 범위" className="mt-6 flex gap-1.5 rounded-xl bg-muted p-1">
        {RANKING_SCOPES.map((s) => {
          const isActive = s.id === scope
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setScope(s.id)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                isActive ? 'bg-card text-foreground toy-shadow-sm' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <div role="tablist" aria-label="랭킹 종류" className="mt-3 flex gap-2">
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
                'flex-1 truncate rounded-2xl px-2 py-2.5 text-xs font-bold toy-border transition-colors sm:px-3 sm:text-sm',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="mt-6">
        {activeTab === 'overall' && <OverallRankingPanel scope={scope} />}
        {activeTab === 'byGame' && <ByGameRankingPanel scope={scope} />}
        {activeTab === 'xp' && <XpRankingPanel scope={scope} />}
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

/**
 * Phase 3B-6 — real Supabase-backed leaderboard, same shape as
 * XpRankingPanel below (loading/error/ready over lib/ranking/
 * overall-leaderboard.ts's fetchOverallLeaderboard). RankingScreen's shared
 * gate above already guarantees a signed-in user with a confirmed nickname
 * by the time this mounts, so — like XpRankingPanel — this state machine
 * only covers whether the RPC pair itself succeeded. Deliberately not
 * factored into a shared hook with XpRankingPanel despite the near-identical
 * shape: XP Ranking's own code is explicitly out of this phase's scope, and
 * introducing a shared abstraction both panels depend on is the one change
 * most likely to accidentally touch it.
 *
 * Phase 3G-3 — `entries`/`myRank` are normalized to this SAME local shape
 * regardless of `scope`, so every line below this point (MyRankCard, the
 * empty-state branch, RankRow) runs completely unchanged for either scope —
 * only the fetch effect and these two lines' construction differ. Global
 * scope still can't safely know "which row is me" (duplicate nicknames —
 * unchanged, still `isMe: false` always); friend scope's RPC returns a real
 * per-row `isMe` (safe there — see friend-overall-leaderboard.ts's doc
 * comment), which now finally lets RankRow's already-existing `isMe`
 * highlighting do something for the first time in this file.
 */
type OverallRankingRow = { rank: number; nickname: string; overallScore: number; isMe: boolean; friendCode: string | null }
type OverallPanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: OverallRankingRow[]; myRank: OverallRankingRow | null }

/** Matches the "N점" convention lib/game/player-skill-storage.ts-derived scores already use everywhere else (My Status, CompleteScreen, GrowScreen) — overall_score is an average of those same 0-100 values, rounded the same way rather than showing raw decimals. */
function formatOverallScore(score: number): string {
  return `${Math.round(score)}점`
}

function OverallRankingPanel({ scope }: { scope: RankingScope }) {
  const { user } = useAuth()
  const [state, setState] = useState<OverallPanelState>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const toastManager = Toast.useToastManager()
  const [pendingRemoval, setPendingRemoval] = useState<{ friendCode: string; nickname: string } | null>(null)

  async function confirmRemoval() {
    if (!pendingRemoval) return
    const client = getSupabaseBrowserClient()
    setPendingRemoval(null)
    if (!client) return
    const result = await removeFriendship(client, pendingRemoval.friendCode)
    if (result.ok) {
      toastManager.add({ title: '친구를 삭제했어요.', type: 'success' })
      setReloadToken((t) => t + 1)
    } else {
      toastManager.add({ title: '친구 삭제에 실패했어요. 다시 시도해주세요.', type: 'error' })
    }
  }

  // RankingScreen's gate already guarantees `user` + a confirmed nickname by
  // the time this mounts — this effect only ever fetches the leaderboard
  // itself, never a nickname. `scope` in the dependency array means
  // switching 전체<->친구 resets straight to `loading` before the new fetch
  // resolves, so the previous scope's rows never flash inside this panel.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setState({ kind: 'loading' })

    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }

    if (scope === 'friends') {
      fetchFriendOverallRanking(client).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] friend overall ranking fetch failed:', result.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = result.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, overallScore: e.overallScore, isMe: e.isMe, friendCode: e.friendCode }))
        setState({ kind: 'ready', entries, myRank: entries.find((e) => e.isMe) ?? null })
      })
    } else {
      fetchOverallLeaderboard(client).then((leaderboardResult) => {
        if (cancelled) return
        if (!leaderboardResult.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] overall leaderboard fetch failed:', leaderboardResult.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = leaderboardResult.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, overallScore: e.overallScore, isMe: false, friendCode: null }))
        const myRank = leaderboardResult.myRank
          ? { rank: leaderboardResult.myRank.rank, nickname: leaderboardResult.myRank.nickname, overallScore: leaderboardResult.myRank.overallScore, isMe: false, friendCode: null }
          : null
        setState({ kind: 'ready', entries, myRank })
      })
    }

    return () => {
      cancelled = true
    }
  }, [user, reloadToken, scope])

  if (state.kind === 'error') {
    return <RankingErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} />
  }

  const loading = state.kind === 'loading'
  const entries = state.kind === 'ready' ? state.entries : []
  const myRank = state.kind === 'ready' ? state.myRank : null
  const friendCount = entries.filter((e) => !e.isMe).length

  return (
    <div className="flex flex-col gap-2">
      <MyRankCard
        loading={loading}
        rank={myRank?.rank ?? null}
        label={scope === 'friends' ? '친구 중 내 순위' : '내 종합 랭킹'}
        detail={
          myRank ? (
            <p className="font-display text-lg font-extrabold text-foreground">
              {myRank.rank}위 <span className="text-xs font-bold text-muted-foreground">· {formatOverallScore(myRank.overallScore)}</span>
            </p>
          ) : undefined
        }
        emptyText="아직 종합 랭킹 기록이 없어요."
      />
      {loading ? (
        <RankingSkeleton />
      ) : scope === 'friends' && friendCount === 0 ? (
        <FriendRankingEmptyState />
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-muted-foreground">아직 랭킹 기록이 없어요.</p>
      ) : (
        entries.map((entry) => (
          <RankRow
            key={entry.rank}
            rank={entry.rank}
            displayName={entry.nickname}
            isMe={entry.isMe}
            trailing={<span className="shrink-0 font-display text-sm font-extrabold text-foreground">{formatOverallScore(entry.overallScore)}</span>}
            onRemove={
              scope === 'friends' && !entry.isMe && entry.friendCode
                ? () => setPendingRemoval({ friendCode: entry.friendCode as string, nickname: entry.nickname })
                : undefined
            }
          />
        ))
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        6개 능력치의 현재 평균으로 계산돼요. {scope === 'friends' ? '나와 친구만 표시돼요.' : '최대 100명까지 표시돼요.'}
      </p>
      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title="친구를 삭제할까요?"
        description={`${pendingRemoval?.nickname ?? ''}님과의 친구 관계가 사라져요. 서로의 친구 랭킹에서도 사라져요.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmRemoval}
      />
    </div>
  )
}

/**
 * Phase 3B-4 — real Supabase-backed leaderboard, unlike the other two panels
 * above (still lib/ranking/ranking-provider.ts mock data — 종합/게임별 랭킹
 * are out of this phase's scope).
 *
 * Phase 3B-4 Follow-up — guest/no-nickname are no longer this panel's own
 * concern: RankingScreen's shared gate above guarantees this only ever
 * mounts for a signed-in user with a confirmed nickname. This state machine
 * now covers exactly one thing: whether the XP leaderboard RPC pair itself
 * succeeded.
 */
type XpRankingRow = { rank: number; nickname: string; totalXp: number; isMe: boolean; friendCode: string | null }
type XpPanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: XpRankingRow[]; myRank: XpRankingRow | null }

/** Phase 3G-3 — shown when the current scope+ranking-type combination is "친구", and the caller has zero confirmed friendships (or exactly zero OTHER than themselves). No CTA button here — Phase 3G-4 wires the actual share/invite flow; this is text-only guidance for now. */
function FriendRankingEmptyState() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-5 py-10 text-center toy-border">
      <p className="text-sm font-bold text-foreground">아직 비교할 친구가 없어요.</p>
      <p className="text-xs text-muted-foreground">친구와 Statling을 공유하고 기록을 비교해보세요.</p>
    </div>
  )
}

function RankingGuestPrompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-8 text-center toy-border">
      <p className="text-sm font-bold text-foreground">로그인하고 랭킹에 참여해보세요</p>
      <p className="text-xs text-muted-foreground">랭킹은 로그인한 사용자만 볼 수 있어요.</p>
      <AuthForm className="mt-2 w-full" defaultMode="signin" />
    </div>
  )
}

function RankingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-8 text-center toy-border">
      <p className="text-sm font-bold text-foreground">{message}</p>
      <ToyButton variant="secondary" onClick={onRetry}>
        다시 시도
      </ToyButton>
    </div>
  )
}

function XpRankingPanel({ scope }: { scope: RankingScope }) {
  const { user } = useAuth()
  const [state, setState] = useState<XpPanelState>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const toastManager = Toast.useToastManager()
  const [pendingRemoval, setPendingRemoval] = useState<{ friendCode: string; nickname: string } | null>(null)

  async function confirmRemoval() {
    if (!pendingRemoval) return
    const client = getSupabaseBrowserClient()
    setPendingRemoval(null)
    if (!client) return
    const result = await removeFriendship(client, pendingRemoval.friendCode)
    if (result.ok) {
      toastManager.add({ title: '친구를 삭제했어요.', type: 'success' })
      setReloadToken((t) => t + 1)
    } else {
      toastManager.add({ title: '친구 삭제에 실패했어요. 다시 시도해주세요.', type: 'error' })
    }
  }

  // RankingScreen's gate already guarantees `user` + a confirmed nickname by
  // the time this mounts — this effect only ever fetches the leaderboard
  // itself, never a nickname. `scope` in the dependency array means
  // switching 전체<->친구 resets straight to `loading` before the new fetch
  // resolves, so the previous scope's rows never flash inside this panel.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setState({ kind: 'loading' })

    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }

    if (scope === 'friends') {
      fetchFriendXpRanking(client).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] friend xp ranking fetch failed:', result.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = result.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, totalXp: e.totalXp, isMe: e.isMe, friendCode: e.friendCode }))
        setState({ kind: 'ready', entries, myRank: entries.find((e) => e.isMe) ?? null })
      })
    } else {
      fetchXpLeaderboard(client).then((leaderboardResult) => {
        if (cancelled) return
        if (!leaderboardResult.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] xp leaderboard fetch failed:', leaderboardResult.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = leaderboardResult.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, totalXp: e.totalXp, isMe: false, friendCode: null }))
        const myRank = leaderboardResult.myRank
          ? { rank: leaderboardResult.myRank.rank, nickname: leaderboardResult.myRank.nickname, totalXp: leaderboardResult.myRank.totalXp, isMe: false, friendCode: null }
          : null
        setState({ kind: 'ready', entries, myRank })
      })
    }

    return () => {
      cancelled = true
    }
  }, [user, reloadToken, scope])

  if (state.kind === 'error') {
    return <RankingErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} />
  }

  const loading = state.kind === 'loading'
  const entries = state.kind === 'ready' ? state.entries : []
  const myRank = state.kind === 'ready' ? state.myRank : null
  const friendCount = entries.filter((e) => !e.isMe).length

  return (
    <div className="flex flex-col gap-2">
      <MyRankCard
        loading={loading}
        rank={myRank?.rank ?? null}
        label={scope === 'friends' ? '친구 중 내 XP 순위' : '내 XP 랭킹'}
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
      ) : scope === 'friends' && friendCount === 0 ? (
        <FriendRankingEmptyState />
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-muted-foreground">아직 랭킹 기록이 없어요.</p>
      ) : (
        entries.map((entry) => (
          <RankRow
            key={entry.rank}
            rank={entry.rank}
            displayName={entry.nickname}
            isMe={entry.isMe}
            trailing={<span className="shrink-0 font-display text-sm font-extrabold text-foreground">{entry.totalXp.toLocaleString()} XP</span>}
            onRemove={
              scope === 'friends' && !entry.isMe && entry.friendCode
                ? () => setPendingRemoval({ friendCode: entry.friendCode as string, nickname: entry.nickname })
                : undefined
            }
          />
        ))
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        게임을 완료할 때마다 점수만큼 XP를 얻어요. {scope === 'friends' ? '나와 친구만 표시돼요.' : '최대 100명까지 표시돼요.'}
      </p>
      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title="친구를 삭제할까요?"
        description={`${pendingRemoval?.nickname ?? ''}님과의 친구 관계가 사라져요. 서로의 친구 랭킹에서도 사라져요.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmRemoval}
      />
    </div>
  )
}

/**
 * Phase 3B-7 — real Supabase-backed leaderboard, same loading/error/ready
 * shape as XpRankingPanel/OverallRankingPanel. Unlike those two, this one
 * ranks by each game's own real raw metric (never normalizedScore) — see
 * lib/ranking/game-ranking-metrics.config.ts, reused here (not
 * re-implemented) to format lib/ranking/game-leaderboard.ts's raw
 * recordValue/tiebreakValue into the exact same display text
 * (e.g. "285ms"/"92%") CompleteScreen and the old mock leaderboard already
 * used.
 */
type GameRankingRow = { rank: number; nickname: string; recordValue: number; tiebreakValue: number | null; isMe: boolean; friendCode: string | null }
type GamePanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: GameRankingRow[]; myRank: GameRankingRow | null }

function ByGameRankingPanel({ scope }: { scope: RankingScope }) {
  const { user } = useAuth()
  const [selectedStat, setSelectedStat] = useState<StatId | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<RankedDifficulty>('hard')
  const [state, setState] = useState<GamePanelState>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const toastManager = Toast.useToastManager()
  const [pendingRemoval, setPendingRemoval] = useState<{ friendCode: string; nickname: string } | null>(null)

  async function confirmRemoval() {
    if (!pendingRemoval) return
    const client = getSupabaseBrowserClient()
    setPendingRemoval(null)
    if (!client) return
    const result = await removeFriendship(client, pendingRemoval.friendCode)
    if (result.ok) {
      toastManager.add({ title: '친구를 삭제했어요.', type: 'success' })
      setReloadToken((t) => t + 1)
    } else {
      toastManager.add({ title: '친구 삭제에 실패했어요. 다시 시도해주세요.', type: 'error' })
    }
  }

  // RankingScreen's gate already guarantees `user` + a confirmed nickname by
  // the time this mounts — never fires while no game is selected yet, and
  // re-fires on every game/difficulty/scope change so switching HARD<->EXTREME
  // (or to a different game, or 전체<->친구) never shows the previous
  // selection's stale data.
  useEffect(() => {
    if (!selectedGameId || !user) return
    let cancelled = false
    setState({ kind: 'loading' })

    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
      return
    }

    if (scope === 'friends') {
      fetchFriendGameRanking(client, selectedGameId, selectedDifficulty).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] friend game ranking fetch failed:', result.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = result.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, recordValue: e.recordValue, tiebreakValue: e.tiebreakValue, isMe: e.isMe, friendCode: e.friendCode }))
        setState({ kind: 'ready', entries, myRank: entries.find((e) => e.isMe) ?? null })
      })
    } else {
      fetchGameLeaderboard(client, selectedGameId, selectedDifficulty).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          if (process.env.NODE_ENV !== 'production') console.warn('[ranking] game leaderboard fetch failed:', result.error)
          setState({ kind: 'error', message: '랭킹을 불러오지 못했어요.' })
          return
        }
        const entries = result.entries.map((e) => ({ rank: e.rank, nickname: e.nickname, recordValue: e.recordValue, tiebreakValue: e.tiebreakValue, isMe: false, friendCode: null }))
        const myRank = result.myRank
          ? { rank: result.myRank.rank, nickname: result.myRank.nickname, recordValue: result.myRank.recordValue, tiebreakValue: result.myRank.tiebreakValue, isMe: false, friendCode: null }
          : null
        setState({ kind: 'ready', entries, myRank })
      })
    }

    return () => {
      cancelled = true
    }
  }, [selectedGameId, selectedDifficulty, user, reloadToken, scope])

  /**
   * Phase 3G-5 — friend_ranking_viewed for 게임별, the counterpart to
   * RankingScreen's own overall/xp firing above. Keyed on
   * [scope, selectedGameId, selectedDifficulty] only — deliberately NOT
   * reloadToken, so a "다시 시도" click on a fetch error never re-fires
   * this; fires again on a genuine game or Hard<->Extreme change, which is
   * a real new ranking being viewed.
   */
  useEffect(() => {
    if (scope !== 'friends' || !selectedGameId) return
    trackEvent('friend_ranking_viewed', { ranking_type: 'game', game_id: selectedGameId, difficulty: selectedDifficulty })
    trackProductEvent('friend_ranking_viewed', { ranking_type: 'game', game_id: selectedGameId, difficulty: selectedDifficulty })
  }, [scope, selectedGameId, selectedDifficulty])

  if (selectedStat && selectedGameId) {
    const game = GAME_POOL[selectedStat].find((g) => g.key === selectedGameId)
    const metricConfig = getGameRankingMetricConfig(selectedGameId, selectedDifficulty)
    const loading = state.kind === 'loading'
    const entries = state.kind === 'ready' ? state.entries : []
    const myRank = state.kind === 'ready' ? state.myRank : null
    const friendCount = entries.filter((e) => !e.isMe).length

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

        {state.kind === 'error' ? (
          <RankingErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} />
        ) : (
          <>
            <MyRankCard
              loading={loading}
              rank={myRank?.rank ?? null}
              label={
                scope === 'friends'
                  ? `친구 중 내 기록 (${DIFFICULTY_TABS.find((t) => t.id === selectedDifficulty)?.label})`
                  : `내 기록 (${DIFFICULTY_TABS.find((t) => t.id === selectedDifficulty)?.label})`
              }
              detail={
                myRank && metricConfig ? (
                  <p className="font-display text-lg font-extrabold text-foreground">
                    {myRank.rank}위{' '}
                    <span className="text-xs font-bold text-muted-foreground">· {metricConfig.primary.format(myRank.recordValue)}</span>
                  </p>
                ) : undefined
              }
              emptyText="아직 이 난이도의 기록이 없어요."
            />

            <div className="flex flex-col gap-2">
              {loading ? (
                <RankingSkeleton />
              ) : scope === 'friends' && friendCount === 0 ? (
                <FriendRankingEmptyState />
              ) : entries.length === 0 ? (
                <p className="py-8 text-center text-sm font-semibold text-muted-foreground">아직 이 난이도의 기록이 없어요.</p>
              ) : (
                entries.map((entry) => (
                  <RankRow
                    key={entry.rank}
                    rank={entry.rank}
                    displayName={entry.nickname}
                    isMe={entry.isMe}
                    trailing={
                      <span className="shrink-0 font-display text-sm font-extrabold text-foreground">
                        {metricConfig ? metricConfig.primary.format(entry.recordValue) : entry.recordValue}
                      </span>
                    }
                    subtitle={
                      metricConfig?.tiebreaker && entry.tiebreakValue != null
                        ? metricConfig.tiebreaker.format(entry.tiebreakValue)
                        : undefined
                    }
                    onRemove={
                      scope === 'friends' && !entry.isMe && entry.friendCode
                        ? () => setPendingRemoval({ friendCode: entry.friendCode as string, nickname: entry.nickname })
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          </>
        )}
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          이 게임의 실제 기록 기준으로 순위가 매겨져요. {scope === 'friends' ? '나와 친구만 표시돼요.' : '최대 100명까지 표시돼요.'}
        </p>
        <p className="text-center text-[11px] text-muted-foreground">
          동일한 기록은 먼저 달성한 순서대로 순위가 결정돼요.
        </p>
        <ConfirmDialog
          open={!!pendingRemoval}
          onOpenChange={(open) => !open && setPendingRemoval(null)}
          title="친구를 삭제할까요?"
          description={`${pendingRemoval?.nickname ?? ''}님과의 친구 관계가 사라져요. 서로의 친구 랭킹에서도 사라져요.`}
          confirmLabel="삭제"
          cancelLabel="취소"
          onConfirm={confirmRemoval}
        />
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

/**
 * Shared row shape for all three ranking lists — `trailing` (a metric/XP
 * figure) and `subtitle` (a tiebreaker line) are both optional so 종합
 * 랭킹 can render rank+name only, matching "내부 점수는 노출하지 않음".
 *
 * Phase 3G-4 — `onRemove` is the ONLY new thing here: an optional minimal
 * friend-removal affordance, never passed for global scope or for the
 * caller's own row (see each panel's render call site) — this row itself
 * has no opinion about confirmation dialogs or the actual remove_friendship
 * call, it just renders the button when handed a handler.
 */
function RankRow({
  rank,
  displayName,
  isMe,
  subtitle,
  trailing,
  onRemove,
}: {
  rank: number
  displayName: string
  isMe: boolean
  subtitle?: string
  trailing?: ReactNode
  onRemove?: () => void
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
      {onRemove && (
        <button
          type="button"
          aria-label={`${displayName} 친구 삭제`}
          onClick={onRemove}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-destructive"
        >
          <UserMinus size={16} strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
}
