'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Toast } from '@base-ui/react/toast'
import { ChevronDown, Share2, X } from 'lucide-react'
import { CharacterTraits } from '@/components/brain-bet/result/character-traits'
import { CompatibleEnvironment } from '@/components/brain-bet/result/compatible-environment'
import { StatDistribution } from '@/components/brain-bet/result/stat-distribution'
import { StatlingCompatibility } from '@/components/brain-bet/result/statling-compatibility'
import { StatlingHero } from '@/components/brain-bet/result/statling-hero'
import { ShareFallbackModal } from '@/components/brain-bet/share-fallback-modal'
import { SharePreviewModal } from '@/components/brain-bet/share-preview-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { StatlingShareCard } from '@/components/share/statling-share-card'
import { trackProductEvent } from '@/lib/analytics/analytics'
import type { ShareContext } from '@/lib/analytics/ga'
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
import { useSound } from '@/hooks/use-sound'

/** Same fixed share_context/utm_content the original RevealScreen used — reusing this component's identity (not a new "my_page" one) so historical share-click funnels stay comparable. */
const SHARE_CONTEXT: ShareContext = 'character_result'

interface StatlingResultDetailProps {
  open: boolean
  petProfile: PetProfile
  topStat: StatId
  secondaryStat: StatId
  finals: Record<StatId, number>
  onClose: () => void
}

/**
 * My Page's "내 Statling 결과" MANUAL-only detail view — the full result
 * report RevealScreen originally showed before it was trimmed down to a
 * short Hatch Reveal beat (StatlingHero only). None of those sections were
 * deleted; this is where they now live, reused completely as-is
 * (StatlingHero/CharacterTraits/CompatibleEnvironment/StatDistribution/
 * StatlingCompatibility, plus the exact same share flow — StatlingShareCard/
 * useSharePreview/SharePreviewModal/ShareFallbackModal). Deliberately its
 * own component, not a branch inside home-result-popup.tsx: that component
 * stays the short auto-only summary (spec: "auto = 빠르게 이해"), and this
 * one only ever mounts for the manual replay path (spec: "manual = 자세히
 * 다시 보기") — keeping the two from ever pulling on each other's layout or
 * data needs.
 *
 * z-[100]/z-[105] (backdrop/popup) — deliberately LOWER than
 * SharePreviewModal/ShareFallbackModal's z-[110]/z-[120], since "공유하기"
 * here opens one of those on top of this modal; using the same z-index
 * band those already use elsewhere (e.g. HomeResultPopup's z-[130]/[140])
 * would incorrectly bury the share modal behind this one.
 */
export function StatlingResultDetail({ open, petProfile, topStat, secondaryStat, finals, onClose }: StatlingResultDetailProps) {
  const { play } = useSound()
  const toastManager = Toast.useToastManager()
  const shareCardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stat = STATS[topStat]
  const secondary = STATS[secondaryStat]
  const type = STATLING_TYPES[topStat]

  useEffect(() => {
    if (open) {
      play('modal-open')
      trackProductEvent('result_popup_viewed', { source: 'manual' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the closed->open transition
  }, [open])

  // "아래에 더 있다" affordance — visible only while there's real overflow
  // AND the user hasn't scrolled near the bottom yet; disappears once they
  // do, and never appears at all on a tall viewport where everything
  // already fits. Purely a visual cue (gradient + chevron, no scrollbar UI
  // reintroduced) — scroll itself is untouched either way (see
  // .scrollbar-hide's own doc comment in app/globals.css: it only hides
  // the track/thumb). Manual-only by construction — HomeResultPopup (auto)
  // doesn't have this at all, it's a separate, shorter component.
  const [showScrollHint, setShowScrollHint] = useState(false)
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    const NEAR_BOTTOM_PX = 24
    function updateHint() {
      if (!el) return
      const hasOverflow = el.scrollHeight > el.clientHeight + 1
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_PX
      setShowScrollHint(hasOverflow && !nearBottom)
    }
    updateHint()
    el.addEventListener('scroll', updateHint, { passive: true })
    window.addEventListener('resize', updateHint)
    return () => {
      el.removeEventListener('scroll', updateHint)
      window.removeEventListener('resize', updateHint)
    }
  }, [open])

  // Identical share wiring to the original RevealScreen's own — see that
  // git history for the source of truth this was copied from verbatim.
  const share = useSharePreview({
    cardRef: shareCardRef,
    buildContent: () => ({
      title: buildShareTitle(),
      text: buildShareText({ petName: petProfile.name, primaryStat: stat.name, secondaryStat: secondary.name }),
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
  const shareStrength = insight.strengths[0]
  const shareWeakness = insight.cautions[0]
  const shareGameCount = allGamePools().length
  const [shareRoomBackgroundSrc] = useState<string | null>(() => {
    try {
      const backgroundId = loadSavedRoomState().backgroundId
      return ROOM_ASSETS[backgroundId]?.src ?? null
    } catch {
      return null
    }
  })

  function handleClose() {
    play('confirm')
    onClose()
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => !next && handleClose()}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup
            aria-label={`${petProfile.name} 상세 결과`}
            className="fixed left-1/2 top-1/2 z-[105] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-card toy-border toy-shadow-lg transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <Dialog.Title className="font-display text-base font-extrabold text-foreground">내 Statling 결과</Dialog.Title>
              <Dialog.Close
                aria-label="상세 결과 닫기"
                onClick={() => play('ui-back')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground toy-border"
              >
                <X size={16} strokeWidth={2.6} />
              </Dialog.Close>
            </div>

            {/* Internal scroll only, same scrollbar-hide utility used
                elsewhere (app/globals.css) — track/thumb hidden, wheel/touch
                scroll untouched. Close/공유하기 both stay pinned below,
                outside this region. The outer `relative overflow-hidden`
                wrapper is just an anchor for the scroll-hint overlay below
                (fixed to the visible viewport, not scrolling away with the
                content) — it doesn't itself clip/restrict scrolling, the
                inner div's own overflow-y-auto still owns that. */}
            <div className="relative flex-1 overflow-hidden">
              <div ref={scrollRef} className="scrollbar-hide h-full overflow-y-auto px-5 pb-2 pt-2 text-center">
                <StatlingHero
                  petProfile={petProfile}
                  topStat={stat}
                  secondaryStat={secondary}
                  typeName={type.typeName}
                  coreTrait={coreTraitSummary}
                />
                <CharacterTraits insight={insight} />
                <CompatibleEnvironment insight={insight} />
                <StatDistribution finals={finals} />
                <StatlingCompatibility goodMatches={goodMatchCards} differentRhythms={differentRhythmCards} />
              </div>

              {showScrollHint && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-card via-card/85 to-transparent pb-1 pt-8"
                >
                  <ChevronDown size={18} strokeWidth={2.8} className="text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
              <ToyButton className="w-full" variant="secondary" onClick={share.openPreview}>
                <Share2 size={18} strokeWidth={2.4} />
                공유하기
              </ToyButton>
              <ToyButton className="w-full" onClick={handleClose}>
                닫기
              </ToyButton>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Hidden capture target + share modals — identical setup to the
          original RevealScreen's own (see StatlingShareCard's own doc
          comment for why opacity-0/fixed, not display:none). */}
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
    </>
  )
}
