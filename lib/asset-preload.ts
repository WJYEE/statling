/**
 * Fire-and-forget image preload — creates an off-DOM Image for each URL so
 * the browser fetches (and, where supported, decodes) it into cache ahead
 * of time. Used for the active pet's full 24-state character art (see
 * pet-mood-view.tsx) so the FIRST time a Pet Care action or a mood swing
 * needs a state nobody has seen yet this session, swapping <img src> to it
 * is an instant cache hit instead of a fresh network fetch + decode — on a
 * slow mobile connection that gap is exactly what read as "the Statling
 * reacts late." Never awaited by callers; nothing here can block a click
 * handler or a render.
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === 'undefined') return
  for (const url of urls) {
    const img = new Image()
    img.src = url
    // decode() pre-decodes off the main thread where supported, so even
    // the first paint of a newly-cached state doesn't pay a decode cost —
    // best-effort only, a rejection here (e.g. Safari on an unattached
    // image) doesn't matter since the src assignment above already queued
    // the fetch that populates the browser's own cache.
    img.decode?.().catch(() => {})
  }
}
