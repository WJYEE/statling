'use client'

import { useEffect, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ArrowRight, Share2 } from 'lucide-react'
import { trackEvent, type ShareContext } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { CharacterTraits } from '@/components/brain-bet/result/character-traits'
import { CompatibleEnvironment } from '@/components/brain-bet/result/compatible-environment'
import { StatDistribution } from '@/components/brain-bet/result/stat-distribution'
import { StatlingCompatibility } from '@/components/brain-bet/result/statling-compatibility'
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
  onConfirm: () => void
}

export function RevealScreen({
  petProfile,
  topStat,
  secondaryStat,
  finals,
  isConfirmed,
  onConfirm,
}: RevealScreenProps) {
  const stat = STATS[topStat]
  const secondary = STATS[secondaryStat]
  const type = STATLING_TYPES[topStat]

  const toastManager = Toast.useToastManager()
  const shareCardRef = useRef<HTMLDivElement>(null)

  // "캐릭터 공개" — fires on every mount, including a refresh that bounces
  // straight back here pre-confirm (see game-flow.tsx's restore effect), by
  // design: this is view-based telemetry ("was the reveal screen shown"),
  // not a first-time-only funnel step like home_enter.
  useEffect(() => {
    trackEvent('statling_reveal', { statling_type: petProfile.id, top_ability: topStat, second_ability: secondaryStat })
    trackProductEvent('statling_revealed', { character_id: petProfile.id, top_stat: topStat, second_stat: secondaryStat })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only
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
      // rather than sharing a generic site-root URL.
      url: buildShareUrl(
        `${window.location.origin}/share/${encodeURIComponent(petProfile.id)}/${topStat}/${secondaryStat}`,
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
    <div className="dot-grid-bg contain-[layout] mx-auto flex min-h-dvh w-full max-w-md flex-col items-center overflow-x-hidden px-5 py-6">
      <Logo size="sm" />

      <div className="mt-4 w-full">
        <StatlingHero
          petProfile={petProfile}
          topStat={stat}
          secondaryStat={secondary}
          typeName={type.typeName}
          coreTrait={coreTraitSummary}
        />
      </div>

      <CharacterTraits insight={insight} />

      <CompatibleEnvironment insight={insight} />

      <StatDistribution finals={finals} />

      <StatlingCompatibility goodMatches={goodMatchCards} differentRhythms={differentRhythmCards} />

      <div className="mt-7 flex w-full flex-col gap-3">
        <ToyButton className="w-full" onClick={onConfirm}>
          {isConfirmed ? '저장하고 시작하기' : '이 Statling과 함께하기'}
          <ArrowRight size={20} strokeWidth={2.8} />
        </ToyButton>

        {/* Phase 3C-1 Follow-up: one entry point into Share Preview, which
            itself offers both "친구에게 공유" and "이미지 저장" — a
            separate "이미지로 저장" button here just opened the identical
            Preview, so it added nothing (same consolidation MyPage's own
            share buttons went through). */}
        <ToyButton
          className="w-full"
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
