'use client'

import { useRef, useState } from 'react'
import {
  HelpCircle,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Music,
  RotateCcw,
  User,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { trackEvent, type ShareContext } from '@/lib/analytics/ga'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { ConfirmDialog } from '@/components/brain-bet/confirm-dialog'
import { FeedbackSection } from '@/components/brain-bet/feedback-section'
import { ShareFallbackModal } from '@/components/brain-bet/share-fallback-modal'
import { SharePreviewModal } from '@/components/brain-bet/share-preview-modal'
import { StatlingFriendCard } from '@/components/share/statling-friend-card'
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import { audioManager } from '@/lib/audio/audio-manager'
import { loadSfxEnabled, saveSfxEnabled } from '@/lib/audio/audio-settings-storage'
import { useBgm } from '@/hooks/use-bgm'
import type { BgmTrackId } from '@/lib/audio/bgm-config'
import type { BgmMode } from '@/lib/audio/types'
import { useAuth } from '@/lib/auth/auth-provider'
import { loadPetCareState } from '@/lib/pet-care/pet-care-storage'
import { allGamePools } from '@/lib/game/game-registry'
import { getStatCompatibility } from '@/lib/pets/compatibility'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { ROOM_ASSETS } from '@/lib/room-assets'
import { loadSavedRoomState } from '@/lib/room/room-storage'
import { loadXpState } from '@/lib/ranking/xp-ledger'
import { trackShare } from '@/lib/missions/mission-tracker'
import { buildFriendInviteText, buildFriendInviteTitle, buildFriendInviteUrl, buildShareUrl } from '@/lib/share/build-share-text'
import { useSharePreview } from '@/lib/share/use-share-preview'
import { buildDifferentRhythmCards, buildGoodMatchCards } from '@/lib/stats/stat-compatibility-copy'
import { buildStatInsight } from '@/lib/stats/stat-insights'
import { getOrCreateMyFriendCode } from '@/lib/friends/friend-connection'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** Correct 이/가 for a Korean noun by checking whether its last syllable has a batchim (same technique as mission-screen.tsx's withObjectParticle for 을/를 — Hangul syllables are a fixed Unicode block starting at U+AC00, in 28-value groups, remainder 0 means no final consonant). Falls back to '가' for anything that isn't a plain Hangul syllable (defensive only — every Statling character name in lib/pets/pet-profile.ts is Korean). */
function withSubjectParticle(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}가`
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return `${word}${hasBatchim ? '이' : '가'}`
}

const BGM_MODE_LABELS: Record<BgmMode, string> = {
  'repeat-one': '단일 반복',
  sequential: '선택곡 순차 재생',
  shuffle: '선택곡 랜덤 재생',
}

/** This screen's fixed share_context/utm_content value — see lib/analytics/ga.ts's ShareContext doc comment for why the same constant feeds both the GA event param and buildShareUrl's UTM. */
const SHARE_CONTEXT: ShareContext = 'my_page'

interface MyPageScreenProps {
  statlingName: string
  topStat: StatId
  /** The pet's initial-diagnosis secondary stat (see game-flow.tsx's own `secondaryStat`, computed identically to `topStat` — Phase 3C-2 threads it through for the friend-invite share card's TOP STATS/strength/compatibility content, none of which existed here before). */
  secondaryStat: StatId
  petProfile: PetProfile | null
  /** Wipes the pet profile + care state + memory and returns to Landing. See resetAllPetData in game-flow.tsx. */
  onResetPet: () => void
  /** Reopens the first-visit onboarding card on demand — see components/brain-bet/onboarding-modal.tsx. */
  onShowOnboarding: () => void
}

export function MyPageScreen({ statlingName, topStat, secondaryStat, petProfile, onResetPet, onShowOnboarding }: MyPageScreenProps) {
  const [sfxEnabled, setSfxEnabled] = useState(() => loadSfxEnabled())
  /** Personal growth number only (see lib/ranking/xp-ledger.ts) — never used for any ranking computation, see lib/ranking/ranking-provider.ts. */
  const [totalXp] = useState(() => loadXpState().totalXp)
  /** Only used by buildFriendInviteText's share-message copy (never the visual card — see StatlingFriendCard). Loaded once via the same plain-storage-read pattern as totalXp above. */
  const [petCareLevel] = useState(() => loadPetCareState().intimacyLevel)
  const shareCardRef = useRef<HTMLDivElement>(null)
  const bgm = useBgm()
  const [bgmEnabled, setBgmEnabledState] = useState(() => bgm.isEnabled())
  const [bgmMode, setBgmModeState] = useState<BgmMode>(() => bgm.getMode())
  const [bgmRepeatTrackId, setBgmRepeatTrackIdState] = useState<BgmTrackId>(() => bgm.getRepeatTrackId())
  const [bgmSelectedTrackIds, setBgmSelectedTrackIdsState] = useState<BgmTrackId[]>(() => bgm.getSelectedTrackIds())
  const { user, loading, isConfigured, signOut } = useAuth()
  const toastManager = Toast.useToastManager()
  const [showLogin, setShowLogin] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // Phase 3C-1 — Share Preview: same shared hook as RevealScreen's own
  // share/save buttons (see lib/share/use-share-preview.ts). trackShare()
  // (mission progress) is passed as onShareSucceeded since it's specific to
  // this friend-invite card — RevealScreen's result share never had it.
  const share = useSharePreview({
    cardRef: shareCardRef,
    buildContent: () =>
      petProfile
        ? {
            title: buildFriendInviteTitle(),
            text: buildFriendInviteText({
              statlingName,
              characterName: petProfile.name,
              level: petCareLevel,
            }),
            // Same "친구 도감 등록" invite link the old standalone copy-link
            // button used to share on its own, before this action absorbed it —
            // the one existing structure this feature can hook a future friend
            // system into. Phase 3H-1: public slug, not the internal petId.
            url: buildShareUrl(`${window.location.origin}/share/${encodeURIComponent(petProfile.slug)}`, SHARE_CONTEXT),
          }
        : { title: '', text: '', url: '' }, // unreachable — the buttons below only render when petProfile is set
    saveName: statlingName,
    shareContext: SHARE_CONTEXT,
    toastManager,
    onShareSucceeded: trackShare,
  })

  // Phase 3G-4 — Friend Invite: a SEPARATE useSharePreview instance (same
  // hook, same hidden StatlingFriendCard capture target, same Preview/
  // Fallback modals below) rather than branching the general `share` hook
  // above — keeps the general "내 Statling 친구에게 공유" button (no `ref`,
  // can end up posted publicly) completely untouched while still reusing
  // every existing share/save/native-share/clipboard code path. `friendCode`
  // is resolved BEFORE opening the preview (not inside buildContent, which
  // stays synchronous like every other caller of this hook) — see
  // handleFriendInviteClick below.
  const [friendCode, setFriendCode] = useState<string | null>(null)
  const [friendCodeLoading, setFriendCodeLoading] = useState(false)
  const friendShare = useSharePreview({
    cardRef: shareCardRef,
    buildContent: () =>
      petProfile && friendCode
        ? {
            title: buildFriendInviteTitle(),
            text: buildFriendInviteText({ statlingName, characterName: petProfile.name, level: petCareLevel }),
            // Phase 3H-1: public slug, not the internal petId (see reveal-screen.tsx's sibling comment above).
            url: buildFriendInviteUrl(`${window.location.origin}/share/${encodeURIComponent(petProfile.slug)}`, SHARE_CONTEXT, friendCode),
          }
        : { title: '', text: '', url: '' }, // unreachable — handleFriendInviteClick never opens the preview before friendCode resolves
    saveName: statlingName,
    shareContext: SHARE_CONTEXT,
    toastManager,
    onShareSucceeded: trackShare,
  })

  /** Guest: reveals the existing inline login form (same as the account card's own 로그인 button) instead of proceeding — generating a friend_code needs a real account, and there's nothing to "resume" after login here (unlike consuming someone else's invite link), so this simply asks the user to tap the button again once signed in. */
  async function handleFriendInviteClick() {
    if (!user) {
      setShowLogin(true)
      return
    }
    const client = getSupabaseBrowserClient()
    if (!client) {
      toastManager.add({ title: '친구 초대 링크를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
      return
    }
    setFriendCodeLoading(true)
    const result = await getOrCreateMyFriendCode(client)
    setFriendCodeLoading(false)
    if (!result.ok) {
      if (process.env.NODE_ENV !== 'production') console.warn('[friend-invite] get_or_create_my_friend_code failed:', result.error)
      toastManager.add({ title: '친구 초대 링크를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
      return
    }
    setFriendCode(result.friendCode)
    friendShare.openPreview()
  }

  // Phase 3C-2 — Share Card content: same real diagnosis-derived data
  // RevealScreen's own StatlingShareCard uses (see that component's doc
  // comment) — getStatCompatibility/buildStatInsight are both pure
  // functions of petProfile/topStat/secondaryStat, nothing newly computed.
  const insight = buildStatInsight(topStat, secondaryStat)
  const shareStrength = insight.strengths[0]
  const shareWeakness = insight.cautions[0]
  const compatibility = petProfile ? getStatCompatibility(petProfile) : null
  const shareGoodMatches = compatibility ? buildGoodMatchCards(compatibility.goodMatches) : undefined
  const shareDifferentRhythms = compatibility ? buildDifferentRhythmCards(compatibility.differentRhythms) : undefined
  const [shareGameCount] = useState(() => allGamePools().length)
  // Best-effort decorative framing only (see ShareCardHero's own doc
  // comment) — never blocks rendering if unavailable.
  const [shareRoomBackgroundSrc] = useState<string | null>(() => {
    try {
      const backgroundId = loadSavedRoomState().backgroundId
      return ROOM_ASSETS[backgroundId]?.src ?? null
    } catch {
      return null
    }
  })

  function toggleSfx() {
    const next = !sfxEnabled
    setSfxEnabled(next)
    saveSfxEnabled(next)
    audioManager.setMuted(!next)
    trackEvent('audio_setting_change', { audio_type: 'sfx', enabled: next })
  }

  function toggleBgm() {
    const next = !bgmEnabled
    setBgmEnabledState(next)
    bgm.setEnabled(next)
    trackEvent('audio_setting_change', { audio_type: 'bgm', enabled: next })
  }

  function changeBgmMode(mode: BgmMode) {
    setBgmModeState(mode)
    bgm.setMode(mode)
    trackEvent('bgm_play_mode_change', { play_mode: mode })
  }

  function changeBgmRepeatTrack(id: BgmTrackId) {
    setBgmRepeatTrackIdState(id)
    bgm.setRepeatTrack(id)
    trackEvent('bgm_track_change', { track_id: id })
  }

  function toggleBgmTrackSelection(id: BgmTrackId) {
    const next = bgmSelectedTrackIds.includes(id)
      ? bgmSelectedTrackIds.filter((trackId) => trackId !== id)
      : [...bgmSelectedTrackIds, id]
    // Keep at least one track selected — setBgmSelectedTrackIds silently
    // falls back to "all 31" on an empty array, which would desync this
    // component's local state from what audioManager actually applied.
    if (next.length === 0) return
    setBgmSelectedTrackIdsState(next)
    bgm.setSelectedTrackIds(next)
    trackEvent('bgm_track_change', { track_id: id })
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
    toastManager.add({ title: '로그아웃했어요.', type: 'success' })
    trackEvent('logout', {})
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          마이페이지
        </p>
        <h1 className="font-display text-2xl font-extrabold text-foreground">내 정보</h1>
      </header>

      {/* 1. 계정 */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">계정</p>
      <div className="mt-2 rounded-2xl bg-card px-4 py-4 toy-border">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            {user ? <Mail size={20} strokeWidth={2.2} /> : <User size={20} strokeWidth={2.2} />}
          </span>
          <div className="min-w-0 flex-1">
            {user ? (
              <>
                <p className="truncate font-display text-base font-extrabold text-foreground">
                  {user.email}
                </p>
                <p className="text-xs text-muted-foreground">로그인된 계정이에요.</p>
              </>
            ) : (
              <>
                <p className="font-display text-base font-extrabold text-foreground">게스트</p>
                <p className="text-xs text-muted-foreground">
                  {loading
                    ? '불러오는 중...'
                    : isConfigured
                      ? '펫 데이터는 아직 이 기기에만 저장돼요. 로그인하면 계정에 연결할 수 있어요.'
                      : '로그인 기능은 아직 준비 중이에요.'}
                </p>
              </>
            )}
          </div>
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-foreground transition-opacity disabled:opacity-60"
            >
              <LogOut size={14} strokeWidth={2.4} />
              {signingOut ? '처리 중...' : '로그아웃'}
            </button>
          ) : (
            isConfigured &&
            !loading && (
              <button
                type="button"
                onClick={() => setShowLogin((v) => !v)}
                className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                {showLogin ? '닫기' : '로그인'}
              </button>
            )
          )}
        </div>

        {!user && showLogin && (
          <AuthForm className="mt-4" defaultMode="signin" onAuthenticated={() => setShowLogin(false)} />
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 toy-border">
        <StatBadge stat={STATS[topStat]} size="sm" />
        <div className="flex-1">
          <p className="font-display text-sm font-extrabold text-foreground">{statlingName}</p>
          <p className="text-xs text-muted-foreground">{STATLING_TYPES[topStat].typeName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-extrabold text-foreground">{totalXp.toLocaleString()} XP</p>
          <p className="text-[10px] text-muted-foreground">누적 성장치</p>
        </div>
      </div>

      {/* 2. 게임 */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">게임</p>
      <button
        type="button"
        onClick={onShowOnboarding}
        className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
          <HelpCircle size={20} strokeWidth={2.2} />
        </span>
        <div className="flex-1">
          <p className="font-display text-sm font-extrabold text-foreground">온보딩 다시 보기</p>
          <p className="text-xs text-muted-foreground">앱 사용법을 다시 확인해요.</p>
        </div>
      </button>

      {/* Merged with the old standalone "친구에게 공유" button — one action
          now covers both "링크만 복사" and "친구에게 공유", since
          shareStatlingResult's own fallback chain already lands on a plain
          link copy whenever native share isn't available, so a separate
          copy-only button no longer added anything. Phase 3C-1: opens
          Share Preview (see share.openPreview) rather than firing
          immediately. Phase 3C-1 Follow-up: removed the separate "소개
          카드 이미지로 저장" button entirely — Share Preview's own "이미지
          저장" button already covers that, so a second entry point into the
          identical Preview was pure duplication; this is now MyPage's one
          share entry point. */}
      {petProfile && (
        <button
          type="button"
          onClick={share.openPreview}
          className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border disabled:opacity-60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            <Link2 size={20} strokeWidth={2.2} />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-extrabold text-foreground">내 Statling 친구에게 공유</p>
            <p className="text-xs text-muted-foreground">친구가 링크를 열고 기록하면 친구 도감에 {withSubjectParticle(petProfile.name)} 등록돼요.</p>
          </div>
        </button>
      )}

      {/* Phase 3G-4 — separate, explicit action from the general share above:
          this is the ONLY place a friend-invite link (with `?ref=`) gets
          created. General share never carries it. */}
      {petProfile && (
        <button
          type="button"
          onClick={handleFriendInviteClick}
          disabled={friendCodeLoading}
          className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border disabled:opacity-60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            <Users size={20} strokeWidth={2.2} />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-extrabold text-foreground">친구와 기록 비교하기</p>
            <p className="text-xs text-muted-foreground">
              {user ? '친구가 링크를 열고 수락하면 랭킹에서 서로 기록을 비교할 수 있어요.' : '로그인하면 친구와 기록을 비교할 수 있어요.'}
            </p>
          </div>
          {friendCodeLoading && <Loader2 size={16} strokeWidth={2.4} className="shrink-0 animate-spin text-muted-foreground" />}
        </button>
      )}

      {/* 3. 설정 */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">설정</p>
      <button
        type="button"
        data-sfx-skip
        onClick={toggleSfx}
        className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
          {sfxEnabled ? <Volume2 size={20} strokeWidth={2.2} /> : <VolumeX size={20} strokeWidth={2.2} />}
        </span>
        <div className="flex-1">
          <p className="font-display text-sm font-extrabold text-foreground">효과음 (SFX)</p>
          <p className="text-xs text-muted-foreground">버튼음, 게임 효과음 등을 켜고 꺼요.</p>
        </div>
        <span
          aria-hidden="true"
          className={`grid h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${sfxEnabled ? 'justify-end bg-primary' : 'justify-start bg-muted'}`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </span>
      </button>

      <div className="mt-2 rounded-2xl bg-card px-4 py-4 toy-border">
        <button type="button" onClick={toggleBgm} className="flex w-full items-center gap-3 text-left">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            <Music size={20} strokeWidth={2.2} />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-extrabold text-foreground">배경음악 (BGM)</p>
            <p className="text-xs text-muted-foreground">플레이 중 흐르는 배경음악을 켜고 꺼요.</p>
          </div>
          <span
            aria-hidden="true"
            className={`grid h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${bgmEnabled ? 'justify-end bg-primary' : 'justify-start bg-muted'}`}
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </button>

        {bgmEnabled && (
          <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BGM_MODE_LABELS) as BgmMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeBgmMode(mode)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    bgmMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {BGM_MODE_LABELS[mode]}
                </button>
              ))}
            </div>

            {bgmMode === 'repeat-one' ? (
              <select
                value={bgmRepeatTrackId}
                onChange={(e) => changeBgmRepeatTrack(e.target.value as BgmTrackId)}
                className="w-full rounded-xl bg-muted px-3 py-2 text-xs font-bold text-foreground toy-border"
              >
                {bgm.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-muted/60 p-2 toy-border">
                <p className="px-1 pb-1 text-[11px] font-bold text-muted-foreground">
                  로테이션에 포함할 곡을 선택하세요 ({bgmSelectedTrackIds.length}/{bgm.tracks.length})
                </p>
                {bgm.tracks.map((track) => (
                  <label
                    key={track.id}
                    className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-medium text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={bgmSelectedTrackIds.includes(track.id)}
                      onChange={() => toggleBgmTrackSelection(track.id)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {track.title}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        BGM 및 일부 효과음은 Suno AI를 활용해 제작되었습니다.
      </p>

      {/* 4. 의견 보내기 */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">의견 보내기</p>
      <FeedbackSection className="mt-2" petProfile={petProfile} />

      {/* 5. 관리 */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">관리</p>
      <button
        type="button"
        onClick={() => setConfirmingReset(true)}
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-destructive toy-border"
      >
        <RotateCcw size={16} strokeWidth={2.4} />
        펫 초기화
      </button>

      <ConfirmDialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title="펫을 초기화할까요?"
        description={`${statlingName}과의 기록이 모두 사라져요.\nStatling 성장 기록, 대화 기록을 포함해 되돌릴 수 없어요.`}
        confirmLabel="초기화"
        cancelLabel="취소"
        onConfirm={onResetPet}
      />

      {/* Hidden capture target for html-to-image — see StatlingFriendCard/ShareCardHidden's own doc comments for why this stays off-screen via opacity-0 + aria-hidden/inert rather than display:none. */}
      {petProfile && (
        <StatlingFriendCard
          ref={shareCardRef}
          petProfile={petProfile}
          statlingName={statlingName}
          topStat={topStat}
          secondaryStat={secondaryStat}
          strength={shareStrength}
          weakness={shareWeakness}
          goodMatches={shareGoodMatches}
          differentRhythms={shareDifferentRhythms}
          gameCount={shareGameCount}
          roomBackgroundSrc={shareRoomBackgroundSrc}
        />
      )}

      <SharePreviewModal
        open={share.isOpen}
        onOpenChange={share.onOpenChange}
        imageState={share.imageState}
        imageUrl={share.imageUrl}
        busyAction={share.busyAction}
        onShare={share.handleShare}
        onSave={share.handleSave}
      />

      {share.fallback && (
        <ShareFallbackModal
          open={!!share.fallback}
          onOpenChange={(open) => {
            if (!open) share.clearFallback()
          }}
          title={share.fallback.title}
          text={share.fallback.text}
          url={share.fallback.url}
        />
      )}

      {/* Phase 3G-4 — Friend Invite's own Preview/Fallback modal pair, same
          components as the general share above, just bound to friendShare's
          own state instead. */}
      <SharePreviewModal
        open={friendShare.isOpen}
        onOpenChange={friendShare.onOpenChange}
        imageState={friendShare.imageState}
        imageUrl={friendShare.imageUrl}
        busyAction={friendShare.busyAction}
        onShare={friendShare.handleShare}
        onSave={friendShare.handleSave}
      />

      {friendShare.fallback && (
        <ShareFallbackModal
          open={!!friendShare.fallback}
          onOpenChange={(open) => {
            if (!open) friendShare.clearFallback()
          }}
          title={friendShare.fallback.title}
          text={friendShare.fallback.text}
          url={friendShare.fallback.url}
        />
      )}
    </div>
  )
}
