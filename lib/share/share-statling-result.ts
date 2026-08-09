import { createShareImage } from '@/lib/share/create-share-image'
import type { ShareCardContent, ShareOutcome } from '@/lib/share/share-types'

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: unknown }).name === 'AbortError')
  )
}

/**
 * Shares a Statling result, cascading down a priority chain until something
 * works (each tier's *failure* — not the user cancelling — falls through to
 * the next):
 *
 *   1. Image file + text, via navigator.share({ files }) — only attempted if
 *      an `imageElement` was given, image generation succeeds, AND
 *      navigator.canShare({ files }) reports true.
 *   2. Text + url, via navigator.share({ title, text, url }).
 *   3. Clipboard — copies `text + url` as plain text.
 *   4. Manual — caller shows the content in a modal so the user can select
 *      and copy it themselves (there's always a next tier, so this never
 *      needs to fail).
 *
 * A user backing out of the OS share sheet (AbortError) stops the whole
 * chain immediately and reports 'cancelled' — that's a deliberate "I don't
 * want to share", not a signal to try clipboard instead. Only a genuinely
 * unexpected exception (nothing in the normal flow should throw past this)
 * produces 'error'.
 */
export async function shareStatlingResult(
  content: ShareCardContent,
  imageElement?: HTMLElement,
  imageFilename = 'my-statling.png',
): Promise<ShareOutcome> {
  try {
    const { title, text, url } = content

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    // --- 1. image file + text ---
    if (canShare && imageElement) {
      const blob = await createShareImage(imageElement)
      if (blob) {
        const file = new File([blob], imageFilename, { type: 'image/png' })
        const canShareFiles =
          typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

        if (canShareFiles) {
          try {
            await navigator.share({ title, text, files: [file] })
            return { status: 'shared', method: 'file' }
          } catch (err) {
            if (isAbortError(err)) return { status: 'cancelled' }
            // fall through to text+url share
          }
        }
      }
    }

    // --- 2. text + url ---
    if (canShare) {
      try {
        await navigator.share({ title, text, url })
        return { status: 'shared', method: 'web-share' }
      } catch (err) {
        if (isAbortError(err)) return { status: 'cancelled' }
        // fall through to clipboard
      }
    }

    // --- 3. clipboard ---
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

    // --- 4. manual (always succeeds) ---
    return { status: 'manual-copy', title, text, url }
  } catch {
    return { status: 'error' }
  }
}
