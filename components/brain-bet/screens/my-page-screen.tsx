'use client'

import { useRef, useState } from 'react'
import {
  Download,
  HelpCircle,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Music,
  RotateCcw,
  Share2,
  User,
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
import { StatlingFriendCard } from '@/components/share/statling-friend-card'
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import { audioManager } from '@/lib/audio/audio-manager'
import { loadSfxEnabled, saveSfxEnabled } from '@/lib/audio/audio-settings-storage'
import { useBgm } from '@/hooks/use-bgm'
import type { BgmTrackId } from '@/lib/audio/bgm-config'
import type { BgmMode } from '@/lib/audio/types'
import { useAuth } from '@/lib/auth/auth-provider'
import { loadPetCareState } from '@/lib/pet-care/pet-care-storage'
import { loadPetMemory } from '@/lib/pet-care/pet-memory-storage'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { loadStoredPetProfile } from '@/lib/pets/pet-storage'
import { daysTogether, totalMiniGamePlays } from '@/lib/pets/pet-growth-summary'
import { loadXpState } from '@/lib/ranking/xp-ledger'
import { trackShare } from '@/lib/missions/mission-tracker'
import { buildFriendInviteText, buildFriendInviteTitle, buildShareUrl } from '@/lib/share/build-share-text'
import { createShareImage } from '@/lib/share/create-share-image'
import { saveShareImage } from '@/lib/share/save-share-image'
import { shareStatlingResult } from '@/lib/share/share-statling-result'

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
  petProfile: PetProfile | null
  /** Wipes the pet profile + care state + memory and returns to Landing. See resetAllPetData in game-flow.tsx. */
  onResetPet: () => void
  /** Reopens the first-visit onboarding card on demand — see components/brain-bet/onboarding-modal.tsx. */
  onShowOnboarding: () => void
}

export function MyPageScreen({ statlingName, topStat, petProfile, onResetPet, onShowOnboarding }: MyPageScreenProps) {
  const [sfxEnabled, setSfxEnabled] = useState(() => loadSfxEnabled())
  /** Personal growth number only (see lib/ranking/xp-ledger.ts) — never used for any ranking computation, see lib/ranking/ranking-provider.ts. */
  const [totalXp] = useState(() => loadXpState().totalXp)
  /** Real, currently-available growth numbers for the friend-invite share card only (see StatlingFriendCard) — never the initial diagnosis TOP 2/scores that Character Reveal's own card uses. Loaded once via the same plain-storage-read pattern as totalXp above, not a live-ticking subscription (usePetCare), since this screen only needs a snapshot to render/capture a PNG. */
  const [friendCardStats] = useState(() => ({
    level: loadPetCareState().intimacyLevel,
    daysTogether: daysTogether(loadStoredPetProfile()?.confirmedAt),
    totalPlays: totalMiniGamePlays(loadPetMemory()),
  }))
  const shareCardRef = useRef<HTMLDivElement>(null)
  // One shared lock (not two independent flags): both actions capture the
  // same hidden card DOM node via html-to-image, so they must never overlap
  // — same convention as reveal-screen.tsx's own share/save buttons.
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const [fallback, setFallback] = useState<{ title: string; text: string; url: string } | null>(null)
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

  async function handleCopyShareLink() {
    if (!petProfile) return
    // encodeURIComponent is required, not defensive — every catalog id is
    // Korean (see lib/pets/pet-profile.ts), and app/share/[petId]/page.tsx
    // expects (and explicitly decodes) a properly percent-encoded segment.
    // Routed through buildShareUrl (like the two share/save actions below)
    // so a manually copy-pasted link still carries the same UTM attribution.
    const url = buildShareUrl(`${window.location.origin}/share/${encodeURIComponent(petProfile.id)}`, SHARE_CONTEXT)
    try {
      await navigator.clipboard.writeText(url)
      trackShare()
      toastManager.add({ title: '공유 링크를 복사했어요.', type: 'success' })
    } catch {
      toastManager.add({ title: url, description: '링크를 직접 복사해주세요.', type: 'error' })
    }
  }

  async function handleShareFriendCard() {
    if (!petProfile || busyAction) return
    setBusyAction('share')
    trackEvent('share_click', { action_type: 'web_share', share_context: SHARE_CONTEXT })
    try {
      const content = {
        title: buildFriendInviteTitle(),
        text: buildFriendInviteText({
          statlingName,
          characterName: petProfile.name,
          level: friendCardStats.level,
        }),
        // Reuses the exact same "친구 도감 등록" invite link handleCopyShareLink
        // already shares above, rather than a plain app-root URL — the one
        // existing structure this feature can hook a future friend system into.
        url: buildShareUrl(`${window.location.origin}/share/${encodeURIComponent(petProfile.id)}`, SHARE_CONTEXT),
      }
      const outcome = await shareStatlingResult(
        content,
        shareCardRef.current ?? undefined,
        `statling-${petProfile.id}-invite.png`,
      )

      switch (outcome.status) {
        case 'shared':
          toastManager.add({ title: '공유했어요!', type: 'success' })
          trackEvent('share_success', { action_type: 'web_share', share_context: SHARE_CONTEXT })
          break
        case 'copied':
          toastManager.add({ title: '공유 내용이 복사되었어요.', type: 'success' })
          trackEvent('share_success', { action_type: 'web_share', share_context: SHARE_CONTEXT })
          break
        case 'cancelled':
          break // user backed out of the share sheet — not an error
        case 'manual-copy':
          setFallback({ title: outcome.title, text: outcome.text, url: outcome.url })
          break
        case 'error':
          toastManager.add({ title: '공유하지 못했어요. 다시 시도해주세요.', type: 'error' })
          trackEvent('share_fail', { action_type: 'web_share', share_context: SHARE_CONTEXT, error_type: 'unknown' })
          break
      }
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSaveFriendCardImage() {
    if (!petProfile || busyAction || !shareCardRef.current) return
    setBusyAction('save')
    trackEvent('share_click', { action_type: 'png', share_context: SHARE_CONTEXT })
    try {
      const blob = await createShareImage(shareCardRef.current)
      if (!blob) {
        toastManager.add({ title: '이미지를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
        trackEvent('share_fail', { action_type: 'png', share_context: SHARE_CONTEXT, error_type: 'image_creation_failed' })
        return
      }

      const outcome = await saveShareImage(blob, statlingName)
      switch (outcome.status) {
        case 'shared':
          toastManager.add({ title: '공유 시트에서 사진 앱에 저장할 수 있어요.', type: 'success' })
          trackEvent('share_success', { action_type: 'png', share_context: SHARE_CONTEXT })
          break
        case 'downloaded':
          toastManager.add({ title: '이미지가 저장되었어요.', type: 'success' })
          trackEvent('share_success', { action_type: 'png', share_context: SHARE_CONTEXT })
          break
        case 'cancelled':
          break // user backed out of the native share sheet — not an error
        case 'error':
          toastManager.add({ title: '이미지를 저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
          trackEvent('share_fail', { action_type: 'png', share_context: SHARE_CONTEXT, error_type: 'unknown' })
          break
      }
    } catch {
      toastManager.add({ title: '이미지를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
      trackEvent('share_fail', { action_type: 'png', share_context: SHARE_CONTEXT, error_type: 'unknown' })
    } finally {
      setBusyAction(null)
    }
  }

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

      {petProfile && (
        <button
          type="button"
          onClick={handleCopyShareLink}
          className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
            <Link2 size={20} strokeWidth={2.2} />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-extrabold text-foreground">내 Statling 공유 링크</p>
            <p className="text-xs text-muted-foreground">친구가 링크를 열고 기록하면 친구 도감에 {petProfile.name}이 등록돼요.</p>
          </div>
        </button>
      )}

      {petProfile && (
        <>
          <button
            type="button"
            onClick={handleShareFriendCard}
            disabled={busyAction !== null}
            aria-disabled={busyAction !== null}
            className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border disabled:opacity-60"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
              {busyAction === 'share' ? (
                <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <Share2 size={20} strokeWidth={2.2} />
              )}
            </span>
            <div className="flex-1">
              <p className="font-display text-sm font-extrabold text-foreground">
                {busyAction === 'share' ? '공유 준비 중...' : '친구에게 공유'}
              </p>
              <p className="text-xs text-muted-foreground">지금 키우고 있는 {statlingName}을 카드로 소개해요.</p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleSaveFriendCardImage}
            disabled={busyAction !== null}
            aria-disabled={busyAction !== null}
            className="mt-2 flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left toy-border disabled:opacity-60"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground toy-border">
              {busyAction === 'save' ? (
                <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <Download size={20} strokeWidth={2.2} />
              )}
            </span>
            <div className="flex-1">
              <p className="font-display text-sm font-extrabold text-foreground">
                {busyAction === 'save' ? '이미지 만드는 중...' : '소개 카드 이미지로 저장'}
              </p>
              <p className="text-xs text-muted-foreground">공유 카드 PNG만 따로 저장해요.</p>
            </div>
          </button>
        </>
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
          level={friendCardStats.level}
          daysTogether={friendCardStats.daysTogether}
          totalPlays={friendCardStats.totalPlays}
        />
      )}

      {fallback && (
        <ShareFallbackModal
          open={!!fallback}
          onOpenChange={(open) => {
            if (!open) setFallback(null)
          }}
          title={fallback.title}
          text={fallback.text}
          url={fallback.url}
        />
      )}
    </div>
  )
}
