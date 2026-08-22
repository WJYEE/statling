import { toBlob } from 'html-to-image'

/**
 * Rasterizes a DOM node (the hidden StatlingShareCard/StatlingFriendCard)
 * into a PNG Blob using html-to-image — chosen over html2canvas/dom-to-image
 * because it's ~10KB with zero dependencies and has noticeably fewer bugs
 * with modern CSS (oklch colors, container queries) that this project's
 * design system uses.
 *
 * Called exactly once per Share Preview open (see
 * lib/share/use-share-preview.ts) — the resulting Blob feeds both the
 * Preview's own on-screen image and the "이미지 저장" button (saveShareImage).
 * Phase 3C-1 Follow-up: "친구에게 공유" (shareStatlingResult) no longer uses
 * this image at all — that's URL-first now, the PNG is purely for the
 * Preview/save path. Never throws: any failure here — a pet image that
 * fails to load, an unsupported CSS feature, whatever — just resolves to
 * `null`, and the Preview shows its own "이미지를 만들지 못했어요" state
 * (link-sharing still works either way, since it never depended on this).
 */
export async function createShareImage(node: HTMLElement): Promise<Blob | null> {
  try {
    // pixelRatio: 1 — the card is already built at its literal target pixel
    // size (see StatlingShareCard), so no additional scaling is needed.
    const blob = await toBlob(node, { pixelRatio: 1, cacheBust: true })
    return blob
  } catch {
    return null
  }
}
