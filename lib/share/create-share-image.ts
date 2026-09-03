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
 *
 * Mobile blank-character fix: html-to-image's own embed-images step
 * re-fetches every <img>'s `src` itself (see its resourceToDataURL) to
 * inline it as a data URL — on a slow/flaky mobile connection that fetch
 * can lose the race against the rest of the capture, and html-to-image
 * silently swallows a failed fetch and falls back to a blank image (only a
 * console.warn, nothing surfaces to the caller). Awaiting decode() on every
 * <img> already in the DOM first guarantees the browser has each image
 * fully downloaded before html-to-image ever starts, so its own fetch of
 * the same URL reliably resolves from cache instead of hitting the network
 * again. `cacheBust` is deliberately NOT passed: every image this card
 * renders (character, room background) is a static /public asset at a
 * fixed URL per id — there's nothing to bust, and cache-busting only forced
 * an extra, unnecessary network fetch (exactly the failure point above) on
 * every single capture.
 */
export async function createShareImage(node: HTMLElement): Promise<Blob | null> {
  try {
    const images = Array.from(node.querySelectorAll('img'))
    await Promise.all(images.map((img) => img.decode().catch(() => {})))
    // pixelRatio: 1 — the card is already built at its literal target pixel
    // size (see StatlingShareCard), so no additional scaling is needed.
    const blob = await toBlob(node, { pixelRatio: 1 })
    return blob
  } catch {
    return null
  }
}
