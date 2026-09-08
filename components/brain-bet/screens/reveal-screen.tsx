'use client'

import { useEffect, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ArrowRight, Share2, Sparkles } from 'lucide-react'
import { trackEvent, type ShareContext } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { StatlingHero } from '@/components/brain-bet/result/statling-hero'
import { Logo } from '@/components/brain-bet/logo'
import { ShareFallbackModal } from '@/components/brain-bet/share-fallback-modal'
import { SharePreviewModal } from '@/components/brain-bet/share-preview-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { StatlingShareCard } from '@/components/share/statling-share-card'
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import { allGamePools } from '@/lib/game/game-registry'
import { getStatCompatibility } from '@/lib/pets/compatibility'
import { buildCoreTraitSummary } from '@/lib/pets/pet-analysis'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { ROOM_ASSETS } from '@/lib/room-assets'
import { loadSavedRoomState } from '@/lib/room/room-storage'
import { buildShareText, buildShareTitle, buildShareUrl } from '@/lib/share/build-share-text'
import { useSharePreview } from '@/lib/share/use-share-preview'
import { buildDifferentRhythmCards, buildGoodMatchCards } from '@/lib/stats/stat-compatibility-copy'
import { buildStatInsight } from '@/lib/stats/stat-insights'

/** This screen's fixed share_context/utm_content value — see lib/analytics/ga.ts's ShareContext doc comment for why the same constant feeds both the GA event param and buildShareUrl's UTM. */
const SHARE_CONTEXT: ShareContext = 'character_result'

interface RevealScreenProps {
  petProfile: PetProfile
  topStat: StatId
  secondaryStat: StatId
  finals: Record<StatId, number>
  isConfirmed: boolean
  /** Writes confirmed:true/confirmedAt/dex-entry — called automatically on mount below (see the effect just under this), never from a click anymore. Kept as a prop (not inlined) since game-flow.tsx also needs the same write from its own boot-restore path. */
  onConfirm: () => void
  /** The one user-driven action left on this screen — advances to Naming. Confirming (above) and continuing (this) are deliberately separate: a hatch is never "undone", so there's nothing left to decide here, but the user still gets a moment to actually see their Statling before moving on. */
  onContinue: () => void
}

/**
 * Hatch Reveal — trimmed to an emotional "내 Statling이 태어났다" beat
 * (StatlingHero only: portrait/name/type/top+secondary stat badges/core
 * trait), not a detailed result report. CharacterTraits/CompatibleEnvironment/
 * StatDistribution/StatlingCompatibility/ContentUnlockPreview/NextJourneyPreview
 * used to render here too — none were deleted, they're reserved for a future
 * "결과 상세" surface reachable after Home (see the onboarding-redesign
 * report); this screen only stopped mounting them. Share stays exactly as
 * it was (self-contained: StatlingShareCard/useSharePreview compute their
 * own data below independent of which visual sections are on screen), since
 * it doesn't structurally compete with the trimmed flow the way a full
 * results report would.
 */
export function RevealScreen({
  petProfile,
  topStat,
  secondaryStat,
  finals,
  isConfirmed,
  onConfirm,
  onContinue,
}: RevealScreenProps) {
  const stat = STATS[topStat]
  const secondary = STATS[secondaryStat]
  const type = STATLING_TYPES[topStat]

  const toastManager = Toast.useToastManager()
  const shareCardRef = useRef<HTMLDivElement>(null)

  // Hides the page scrollbar's TRACK/THUMB (never its scroll function —
  // .scrollbar-hide only sets scrollbar-width/-webkit-scrollbar, see
  // app/globals.css) for exactly as long as this screen is mounted. This
  // content sits right at the viewport edge (min-h-dvh, centered), where a
  // sliver scrollbar can appear from ordinary dvh sub-pixel rounding even
  // though nothing is actually being clipped.
  //
  // Targets `document.scrollingElement` — the browser-standard way to ask
  // "which element actually owns the viewport's scrollbar right now"
  // (https://drafts.csswg.org/cssom-view/#dom-document-scrollingelement).
  // In a standards-mode document (this app always renders one), that's
  // `document.documentElement` (<html>), NOT <body> — applying the class to
  // body only (an earlier version of this fix did exactly that) left the
  // real root scrollbar fully visible, since body was never the element
  // rendering it. Falls back to documentElement directly if
  // scrollingElement is ever null (SSR-adjacent edge case; both resolve to
  // the same element in practice for this app). Captured in a ref-like
  // const inside the effect so the exact same node is removed on unmount,
  // even in the (currently impossible, but cheap to guard) case that
  // scrollingElement could resolve differently between mount and unmount.
  useEffect(() => {
    const root = document.scrollingElement ?? document.documentElement
    root.classList.add('scrollbar-hide')
    return () => root.classList.remove('scrollbar-hide')
  }, [])

  // "캐릭터 공개" — fires on every mount, including a refresh that bounces
  // straight back here pre-confirm (see game-flow.tsx's restore effect), by
  // design: this is view-based telemetry ("was the reveal screen shown"),
  // not a first-time-only funnel step like home_enter.
  useEffect(() => {
    trackEvent('statling_reveal', { statling_type: petProfile.id, top_ability: topStat, second_ability: secondaryStat })
    trackProductEvent('statling_revealed', { character_id: petProfile.id, top_stat: topStat, second_stat: secondaryStat })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only
  }, [])

  // Confirm now happens automatically the moment this screen is actually
  // seen — there is no reroll/decline option anywhere in this flow, so
  // requiring an extra tap to "accept" a foregone conclusion only added
  // friction. Runs once on mount; a refresh that lands back here with
  // isConfirmed already true (see game-flow.tsx's boot-restore effect,
  // which routes any !confirmed pet straight back to 'reveal') correctly
  // no-ops instead of re-writing confirmedAt.
  useEffect(() => {
    if (!isConfirmed) onConfirm()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read isConfirmed's mount-time value only; onConfirm is idempotent-guarded by the caller anyway
  }, [])

  // Phase 3C-1 — Share Preview: image generation, the file/text/clipboard
  // fallback cascade, and toast/analytics for both "공유하기"/"이미지로
  // 저장" now live in this one shared hook (also used by MyPageScreen's
  // friend-invite card) rather than being duplicated per screen.
  const share = useSharePreview({
    cardRef: shareCardRef,
    buildContent: () => ({
      title: buildShareTitle(),
      text: buildShareText({ petName: petProfile.name, primaryStat: stat.name, secondaryStat: secondary.name }),
      // Real per-result landing page (see app/share/[petId]/[[...stats]]/)
      // — carries TOP1/TOP2 as extra path segments so both the link
      // preview card and the page itself can headline the same 2 stats,
      // rather than sharing a generic site-root URL. Phase 3H-1: uses the
      // public slug, never the internal petId (see pet-profile.ts).
      url: buildShareUrl(
        `${window.location.origin}/share/${encodeURIComponent(petProfile.slug)}/${topStat}/${secondaryStat}`,
        SHARE_CONTEXT,
      ),
    }),
    saveName: petProfile.name,
    shareContext: SHARE_CONTEXT,
    toastManager,
  })

  const coreTraitSummary = buildCoreTraitSummary(finals, topStat, secondaryStat)
  const compatibility = getStatCompatibility(petProfile)
  const insight = buildStatInsight(topStat, secondaryStat)
  const goodMatchCards = buildGoodMatchCards(compatibility.goodMatches)
  const differentRhythmCards = buildDifferentRhythmCards(compatibility.differentRhythms)

  // Phase 3C-2 (Follow-up: now both strength+weakness, both compatibility
  // entries per group) — coreTraitSummary/insight/goodMatchCards/
  // differentRhythmCards above are already this screen's own real,
  // already-computed diagnosis results (see StatlingShareCard's own doc
  // comment) — nothing here is newly calculated for the card.
  const shareStrength = insight.strengths[0]
  const shareWeakness = insight.cautions[0]
  const shareGameCount = allGamePools().length
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

  return (
    <div className="dot-grid-bg contain-[layout] mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center overflow-x-hidden px-5 py-6">
      <Logo size="sm" />

      {/* Replaces StatlingHero's own former internal eyebrow line (see that
          component's doc comment) — ties this moment back to the test the
          user just finished, for a first-time viewer who might otherwise
          not connect "결과" with "이 캐릭터가 왜 나왔는지". Two short lines
          max (spec: 모바일에서 1~2줄), no "Stat + -ling" etymology. */}
      <div className="mt-4 flex flex-col items-center gap-1 text-center">
        <p className="flex items-center gap-1.5 font-display text-lg font-extrabold text-foreground">
          <Sparkles size={18} strokeWidth={2.6} className="text-primary" aria-hidden="true" />
          나의 Statling이 태어났어요!
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          테스트에서 나타난 나의 능력치를 바탕으로 태어난 나만의 친구예요.
        </p>
      </div>

      <div className="mt-3 w-full">
        <StatlingHero
          petProfile={petProfile}
          topStat={stat}
          secondaryStat={secondary}
          typeName={type.typeName}
          coreTrait={coreTraitSummary}
        />
      </div>

      <div className="mt-7 flex w-full flex-col items-center gap-3">
        {/* The one user-driven action left on this trimmed screen — see
            onContinue's own doc comment above for why confirming and
            continuing are separate. */}
        <ToyButton className="w-full" onClick={onContinue}>
          이름 지어주기
          <ArrowRight size={20} strokeWidth={2.8} />
        </ToyButton>

        {/* Phase 3C-1 Follow-up: one entry point into Share Preview, which
            itself offers both "친구에게 공유" and "이미지 저장" — a
            separate "이미지로 저장" button here just opened the identical
            Preview, so it added nothing (same consolidation MyPage's own
            share buttons went through).
            variant="secondary" (toned-down bg/shadow vs the primary CTA
            above) is a deliberate hierarchy fix: sharing is still one tap
            away, but no longer visually competes with "내 Statling
            키우기" as an equally-weighted "the last thing you do here"
            action — see this screen's drop-off investigation. Share itself
            is untouched (same handler, same modal, same analytics). */}
        <ToyButton
          className="w-full"
          variant="secondary"
          onClick={share.openPreview}
          aria-label="대표 스탯링 결과 공유 미리보기 열기"
        >
          <Share2 size={18} strokeWidth={2.4} />
          공유하기
        </ToyButton>
      </div>

      {/* Hidden capture target for html-to-image — see StatlingShareCard's own doc comment for why opacity-0 (not display:none) plus aria-hidden/inert is the right combination here. */}
      <StatlingShareCard
        ref={shareCardRef}
        petProfile={petProfile}
        topStat={topStat}
        secondaryStat={secondaryStat}
        coreTrait={coreTraitSummary}
        strength={shareStrength}
        weakness={shareWeakness}
        goodMatches={goodMatchCards}
        differentRhythms={differentRhythmCards}
        gameCount={shareGameCount}
        roomBackgroundSrc={shareRoomBackgroundSrc}
      />

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
    </div>
  )
}
