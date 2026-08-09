'use client'

import { useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ArrowRight, Download, Loader2, Share2 } from 'lucide-react'
import { CharacterTraits } from '@/components/brain-bet/result/character-traits'
import { CompatibleEnvironment } from '@/components/brain-bet/result/compatible-environment'
import { StatDistribution } from '@/components/brain-bet/result/stat-distribution'
import { StatlingCompatibility } from '@/components/brain-bet/result/statling-compatibility'
import { StatlingHero } from '@/components/brain-bet/result/statling-hero'
import { Logo } from '@/components/brain-bet/logo'
import { ShareFallbackModal } from '@/components/brain-bet/share-fallback-modal'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { StatlingShareCard, type ShareTopStatEntry } from '@/components/share/statling-share-card'
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import { getStatCompatibility, getStatTypeLabel } from '@/lib/pets/compatibility'
import { buildCoreTraitSummary } from '@/lib/pets/pet-analysis'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { buildShareText, buildShareTitle, buildShareUrl } from '@/lib/share/build-share-text'
import { createShareImage } from '@/lib/share/create-share-image'
import { saveShareImage } from '@/lib/share/save-share-image'
import { shareStatlingResult } from '@/lib/share/share-statling-result'
import { buildDifferentRhythmCards, buildGoodMatchCards } from '@/lib/stats/stat-compatibility-copy'
import { buildStatInsight } from '@/lib/stats/stat-insights'

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
  // One shared lock (not two independent flags): both actions capture the
  // same hidden card DOM node via html-to-image, so they must never overlap.
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const [fallback, setFallback] = useState<{ title: string; text: string; url: string } | null>(null)

  const handleShare = async () => {
    if (busyAction) return // prevent double-clicks while an action is in flight
    setBusyAction('share')
    try {
      const content = {
        title: buildShareTitle(),
        text: buildShareText({ petName: petProfile.name, primaryStat: stat.name, secondaryStat: secondary.name }),
        // Real per-result landing page (see app/share/[petId]/[[...stats]]/)
        // — carries TOP1/TOP2 as extra path segments so both the link
        // preview card and the page itself can headline the same 2 stats,
        // rather than sharing a generic site-root URL.
        url: buildShareUrl(`${window.location.origin}/share/${encodeURIComponent(petProfile.id)}/${topStat}/${secondaryStat}`),
      }
      const outcome = await shareStatlingResult(content, shareCardRef.current ?? undefined)

      switch (outcome.status) {
        case 'shared':
          toastManager.add({ title: '공유했어요!', type: 'success' })
          break
        case 'copied':
          toastManager.add({ title: '공유 내용이 복사되었어요.', type: 'success' })
          break
        case 'cancelled':
          break // user backed out of the share sheet — not an error
        case 'manual-copy':
          setFallback({ title: outcome.title, text: outcome.text, url: outcome.url })
          break
        case 'error':
          toastManager.add({ title: '공유하지 못했어요. 다시 시도해주세요.', type: 'error' })
          break
      }
    } finally {
      setBusyAction(null)
    }
  }

  const handleSaveImage = async () => {
    if (busyAction || !shareCardRef.current) return
    setBusyAction('save')
    try {
      const blob = await createShareImage(shareCardRef.current)
      if (!blob) {
        toastManager.add({ title: '이미지를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
        return
      }

      const outcome = await saveShareImage(blob, petProfile.name)
      switch (outcome.status) {
        case 'shared':
          toastManager.add({ title: '공유 시트에서 사진 앱에 저장할 수 있어요.', type: 'success' })
          break
        case 'downloaded':
          toastManager.add({ title: '이미지가 저장되었어요.', type: 'success' })
          break
        case 'cancelled':
          break // user backed out of the native share sheet — not an error
        case 'error':
          toastManager.add({ title: '이미지를 저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
          break
      }
    } catch {
      toastManager.add({ title: '이미지를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
    } finally {
      setBusyAction(null)
    }
  }

  const coreTraitSummary = buildCoreTraitSummary(finals, topStat, secondaryStat)
  const compatibility = getStatCompatibility(petProfile)
  const insight = buildStatInsight(topStat, secondaryStat)
  const goodMatchCards = buildGoodMatchCards(compatibility.goodMatches)
  const differentRhythmCards = buildDifferentRhythmCards(compatibility.differentRhythms)

  // Share-card content — TOP 2 from the *initial* diagnosis only (topStat/
  // secondaryStat, never a later-grown stat), reusing the same
  // STATLING_TYPES/getStatTypeLabel short tags already shown elsewhere on
  // this screen rather than inventing new keyword copy. goodMatchCards[0]/
  // differentRhythmCards[0] reuse the exact compatibility lists already
  // computed above for StatlingCompatibility, just the first of each.
  const buildTopStatEntry = (id: StatId): ShareTopStatEntry => ({
    name: STATS[id].name,
    keywords: [STATLING_TYPES[id].typeName, getStatTypeLabel(id)],
    description: STATLING_TYPES[id].personality,
  })
  const shareTopStats: [ShareTopStatEntry, ShareTopStatEntry] = [
    buildTopStatEntry(topStat),
    buildTopStatEntry(secondaryStat),
  ]
  const shareGoodMatch = goodMatchCards[0]
  const shareDifferentRhythm = differentRhythmCards[0]

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

        <ToyButton
          className="w-full"
          onClick={handleShare}
          disabled={busyAction !== null}
          aria-disabled={busyAction !== null}
          aria-label="대표 스탯링 결과 공유하기"
        >
          {busyAction === 'share' ? (
            <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
          ) : (
            <Share2 size={18} strokeWidth={2.4} />
          )}
          {busyAction === 'share' ? '공유 준비 중...' : '공유하기'}
        </ToyButton>

        <ToyButton
          variant="secondary"
          className="w-full"
          onClick={handleSaveImage}
          disabled={busyAction !== null}
          aria-disabled={busyAction !== null}
          aria-label="대표 스탯링 결과 이미지로 저장하기"
        >
          {busyAction === 'save' ? (
            <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
          ) : (
            <Download size={18} strokeWidth={2.4} />
          )}
          {busyAction === 'save' ? '이미지 만드는 중...' : '이미지로 저장'}
        </ToyButton>
      </div>

      {/* Hidden capture target for html-to-image — see StatlingShareCard's own doc comment for why opacity-0 (not display:none) plus aria-hidden/inert is the right combination here. */}
      <StatlingShareCard
        ref={shareCardRef}
        petProfile={petProfile}
        topStats={shareTopStats}
        goodMatch={shareGoodMatch}
        differentRhythm={shareDifferentRhythm}
      />

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
