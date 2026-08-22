import { detectDevice } from '@/lib/game/device'
import type { ShareCardContent, ShareOutcome } from '@/lib/share/share-types'

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: unknown }).name === 'AbortError')
  )
}

/**
 * Shares a Statling result — Phase 3C-1 Follow-up: URL-first, not PNG-first.
 * "친구에게 공유" is about getting a clickable Statling link in front of a
 * friend (title+text+url), never the raw image file — the image is what
 * OG Preview (app/api/og/share/route.tsx) shows once the link is opened, and
 * what the Preview's own separate "이미지 저장" button saves (see
 * saveShareImage) — this function no longer touches the PNG at all.
 *
 *   1. Mobile only (see detectDevice — desktop always skips straight to
 *      step 2, deliberately: Web Share's actual OS-level behavior is
 *      inconsistent enough across desktop browsers/OSes that a native share
 *      sheet there reads as "different from what I expected" more often
 *      than it helps) + navigator.share exists: native share with
 *      { title, text, url } — never `files`.
 *   2. Clipboard — copies `text + url` as plain text. This is the Desktop
 *      default, and Mobile's own fallback when native share is unsupported
 *      or fails.
 *   3. Manual — caller shows the content in a modal so the user can select
 *      and copy it themselves (there's always a next tier, so this never
 *      needs to fail).
 *
 * A user backing out of the OS share sheet (AbortError) stops the whole
 * chain immediately and reports 'cancelled' — that's a deliberate "I don't
 * want to share", not a signal to try clipboard instead. Only a genuinely
 * unexpected exception (nothing in the normal flow should throw past this)
 * produces 'error'.
 */
export async function shareStatlingResult(content: ShareCardContent): Promise<ShareOutcome> {
  try {
    const { title, text, url } = content
    const isMobile = detectDevice().deviceType === 'mobile'
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    // --- 1. Mobile native share: title + text + url, never files ---
    if (isMobile && canShare) {
      try {
        await navigator.share({ title, text, url })
        return { status: 'shared', method: 'web-share' }
      } catch (err) {
        if (isAbortError(err)) return { status: 'cancelled' }
        // fall through to clipboard
      }
    }

    // --- 2. clipboard (Desktop default; Mobile's own fallback) ---
    const canWriteClipboard =
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
    if (canWriteClipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n\n${url}`)
        return { status: 'copied', method: 'clipboard' }
      } catch {
        // fall through to manual
      }
    }

    // --- 3. manual (always succeeds) ---
    return { status: 'manual-copy', title, text, url }
  } catch {
    return { status: 'error' }
  }
}
