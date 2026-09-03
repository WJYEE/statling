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
 * Mobile blank-image fix: html-to-image's own embed-images step re-fetches
 * every <img>'s `src` itself over the network (see its resourceToDataURL)
 * to inline it as a data URL — on a slow/flaky mobile connection that
 * second fetch can fail even after the image has already fully loaded on
 * screen, and html-to-image silently swallows the failure and falls back
 * to a blank image (only a console.warn, nothing surfaces to the caller).
 * The larger/heavier an asset (e.g. the ~390KB Statling wordmark logo vs a
 * much smaller character sprite), the more likely it loses that race.
 * `bakeToDataUrl` below closes this for good: once decode() confirms an
 * <img> is actually loaded, it's redrawn onto a canvas and read back out as
 * a data URL — a purely local, zero-network operation (safe here since
 * every image this card renders is a same-origin /public asset, so no
 * CORS-taint risk) — and that data URL is swapped in as the element's `src`
 * before html-to-image ever runs. `isDataUrl(src)` in its own
 * embedImageNode then skips the network fetch entirely for these, so
 * there's no second fetch left to lose. The original `src` is restored
 * right after capture so the live DOM never keeps the baked data URL around.
 */
function bakeToDataUrl(img: HTMLImageElement): string | null {
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (width === 0 || height === 0) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export async function createShareImage(node: HTMLElement): Promise<Blob | null> {
  const images = Array.from(node.querySelectorAll('img'))
  const originalSrcs = images.map((img) => img.src)
  try {
    await Promise.all(images.map((img) => img.decode().catch(() => {})))
    for (const img of images) {
      const dataUrl = bakeToDataUrl(img)
      if (dataUrl) img.src = dataUrl
    }
    // pixelRatio: 1 — the card is already built at its literal target pixel
    // size (see StatlingShareCard), so no additional scaling is needed.
    // cacheBust intentionally omitted — every image here is a fixed-URL
    // static asset with nothing to bust, and by this point every <img> is
    // already a data URL html-to-image never needs to fetch anyway.
    const blob = await toBlob(node, { pixelRatio: 1 })
    return blob
  } catch {
    return null
  } finally {
    images.forEach((img, i) => {
      img.src = originalSrcs[i]
    })
  }
}
