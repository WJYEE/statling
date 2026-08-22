'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Toast } from '@base-ui/react/toast'
import { trackEvent, type ShareContext } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { createShareImage } from '@/lib/share/create-share-image'
import { saveShareImage } from '@/lib/share/save-share-image'
import { shareStatlingResult } from '@/lib/share/share-statling-result'
import type { ShareCardContent } from '@/lib/share/share-types'

export type SharePreviewImageState = 'generating' | 'ready' | 'failed'

export interface UseSharePreviewOptions {
  /** The hidden html-to-image capture target (StatlingShareCard/StatlingFriendCard) — same node both actions read from, see create-share-image.ts. */
  cardRef: RefObject<HTMLDivElement | null>
  /** Called fresh each share attempt (title/url can depend on window.location) — mirrors the pre-Phase-3C-1 inline content construction at each screen's own handleShare call site. */
  buildContent: () => ShareCardContent
  /** Passed through to saveShareImage's own filename-safe slug — the pet/Statling display name. */
  saveName: string
  shareContext: ShareContext
  toastManager: Pick<ReturnType<typeof Toast.useToastManager>, 'add'>
  /** Fired on a successful 'shared' or 'copied' share outcome only — e.g. MyPage's trackShare() mission progress, which Character Reveal's own share button never had. */
  onShareSucceeded?: () => void
}

export interface UseSharePreviewResult {
  isOpen: boolean
  imageState: SharePreviewImageState
  imageUrl: string | null
  busyAction: 'share' | 'save' | null
  openPreview: () => void
  onOpenChange: (open: boolean) => void
  handleShare: () => void
  handleSave: () => void
  fallback: { title: string; text: string; url: string } | null
  clearFallback: () => void
}

/**
 * Phase 3C-1 — Share Preview: generates the PNG exactly once (the moment
 * Preview opens — see create-share-image.ts's cacheBust note; no second
 * html-to-image render ever happens for the same open) and keeps the
 * resulting Blob/object URL alive for the lifetime of the screen that owns
 * this hook, so repeat Preview open/close cycles reuse the same image
 * instead of regenerating it. Both Character Reveal's result card and
 * MyPage's friend-invite card share this one hook so the preview/share/save
 * flow (and its GA/PostHog instrumentation) is defined exactly once.
 *
 * Phase 3C-1 Follow-up: the generated Blob now feeds only the Preview's own
 * on-screen image and the "이미지 저장" button (saveShareImage) — "친구에게
 * 공유" (handleShare) is URL-first and never touches it (see
 * shareStatlingResult's own doc comment).
 */
export function useSharePreview({
  cardRef,
  buildContent,
  saveName,
  shareContext,
  toastManager,
  onShareSucceeded,
}: UseSharePreviewOptions): UseSharePreviewResult {
  const [isOpen, setIsOpen] = useState(false)
  const [imageState, setImageState] = useState<SharePreviewImageState>('generating')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const [fallback, setFallback] = useState<{ title: string; text: string; url: string } | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const generatingRef = useRef(false)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const openPreview = useCallback(() => {
    setIsOpen(true)
    // Already have (or are already fetching) an image for this screen's
    // card — reuse it rather than re-rendering on every re-open.
    if (blobRef.current || generatingRef.current) return
    const node = cardRef.current
    if (!node) {
      setImageState('failed')
      return
    }
    generatingRef.current = true
    setImageState('generating')
    createShareImage(node).then((blob) => {
      generatingRef.current = false
      if (!blob) {
        setImageState('failed')
        return
      }
      blobRef.current = blob
      objectUrlRef.current = URL.createObjectURL(blob)
      setImageUrl(objectUrlRef.current)
      setImageState('ready')
    })
  }, [cardRef])

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open)
  }, [])

  const handleShare = useCallback(() => {
    if (busyAction) return
    setBusyAction('share')
    trackEvent('share_click', { action_type: 'web_share', share_context: shareContext })
    trackProductEvent('share_started', { channel: 'web_share', share_context: shareContext })
    ;(async () => {
      try {
        const content = buildContent()
        const outcome = await shareStatlingResult(content)
        switch (outcome.status) {
          case 'shared':
            toastManager.add({ title: '공유했어요!', type: 'success' })
            trackEvent('share_success', { action_type: 'web_share', share_context: shareContext })
            trackProductEvent('share_completed', { channel: 'web_share', share_context: shareContext })
            onShareSucceeded?.()
            setIsOpen(false)
            break
          case 'copied':
            toastManager.add({ title: '공유 내용이 복사되었어요.', type: 'success' })
            trackEvent('share_success', { action_type: 'web_share', share_context: shareContext })
            trackProductEvent('share_completed', { channel: 'web_share', share_context: shareContext })
            onShareSucceeded?.()
            setIsOpen(false)
            break
          case 'cancelled':
            break // user backed out of the share sheet — stay on Preview, not an error
          case 'manual-copy':
            setIsOpen(false)
            setFallback({ title: outcome.title, text: outcome.text, url: outcome.url })
            break
          case 'error':
            toastManager.add({ title: '공유하지 못했어요. 다시 시도해주세요.', type: 'error' })
            trackEvent('share_fail', { action_type: 'web_share', share_context: shareContext, error_type: 'unknown' })
            break
        }
      } finally {
        setBusyAction(null)
      }
    })()
  }, [busyAction, buildContent, shareContext, toastManager, onShareSucceeded])

  const handleSave = useCallback(() => {
    if (busyAction) return
    if (!blobRef.current) {
      toastManager.add({ title: '이미지를 만들지 못했어요. 다시 시도해주세요.', type: 'error' })
      trackEvent('share_fail', { action_type: 'png', share_context: shareContext, error_type: 'image_creation_failed' })
      return
    }
    setBusyAction('save')
    trackEvent('share_click', { action_type: 'png', share_context: shareContext })
    trackProductEvent('share_started', { channel: 'png', share_context: shareContext })
    ;(async () => {
      try {
        const outcome = await saveShareImage(blobRef.current as Blob, saveName)
        switch (outcome.status) {
          case 'shared':
            toastManager.add({ title: '공유 시트에서 사진 앱에 저장할 수 있어요.', type: 'success' })
            trackEvent('share_success', { action_type: 'png', share_context: shareContext })
            trackProductEvent('share_completed', { channel: 'png', share_context: shareContext })
            setIsOpen(false)
            break
          case 'downloaded':
            toastManager.add({ title: '이미지가 저장되었어요.', type: 'success' })
            trackEvent('share_success', { action_type: 'png', share_context: shareContext })
            trackProductEvent('share_completed', { channel: 'png', share_context: shareContext })
            setIsOpen(false)
            break
          case 'cancelled':
            break // user backed out of the native share sheet — stay on Preview, not an error
          case 'error':
            toastManager.add({ title: '이미지를 저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
            trackEvent('share_fail', { action_type: 'png', share_context: shareContext, error_type: 'unknown' })
            break
        }
      } finally {
        setBusyAction(null)
      }
    })()
  }, [busyAction, saveName, shareContext, toastManager])

  const clearFallback = useCallback(() => setFallback(null), [])

  return { isOpen, imageState, imageUrl, busyAction, openPreview, onOpenChange, handleShare, handleSave, fallback, clearFallback }
}
