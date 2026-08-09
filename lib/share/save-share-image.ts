import { buildShareImageFilename, downloadShareImage } from '@/lib/share/download-share-image'
import { detectDevice } from '@/lib/game/device'

export type SaveImageOutcome =
  | { status: 'shared' } // native share sheet accepted the file (mobile)
  | { status: 'downloaded' } // direct <a download> (desktop, or a mobile fallback)
  | { status: 'cancelled' } // user backed out of the native share sheet
  | { status: 'error' }

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: unknown }).name === 'AbortError')
  )
}

/**
 * Saves a generated result image, mobile-first:
 *
 *   1. Mobile only (see detectDevice — desktop always skips straight to
 *      step 2, per spec: the existing download button stays exactly as-is
 *      on PC) + `navigator.canShare({ files })` — hands the PNG to the OS
 *      share sheet, which is where iOS Safari/Android Chrome actually
 *      expose a "저장"/"Save to Photos" option. The web platform has no API
 *      to write straight into the gallery — this share sheet IS the
 *      closest a browser can legitimately get, so this never tries to fake
 *      a direct gallery write.
 *   2. Everything else — desktop, a mobile browser without file-share
 *      support, or a non-cancel share failure — falls back to the existing
 *      <a download> flow untouched. Kept completely separate from
 *      lib/share/share-statling-result.ts's own file-share tier (the
 *      "공유하기" button) so the two features can never interfere with
 *      each other.
 *
 * A user backing out of the native share sheet (AbortError) stops here and
 * reports 'cancelled' rather than also forcing a download — same
 * convention as share-statling-result.ts's cancel handling, since silently
 * downloading a file right after someone dismissed the share sheet would
 * read as ignoring their "not now."
 */
export async function saveShareImage(blob: Blob, petName: string): Promise<SaveImageOutcome> {
  const filename = buildShareImageFilename(petName)
  const isMobile = detectDevice().deviceType === 'mobile'

  if (isMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: 'image/png' })
      const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (canShareFiles) {
        await navigator.share({ files: [file] })
        return { status: 'shared' }
      }
    } catch (err) {
      if (isAbortError(err)) return { status: 'cancelled' }
      // fall through to download
    }
  }

  try {
    downloadShareImage(blob, filename)
    return { status: 'downloaded' }
  } catch {
    return { status: 'error' }
  }
}
