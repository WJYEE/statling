/** Strips everything except letters (incl. Hangul), digits, `_` and `-`, so a pet name like "천사폭신이" survives while slashes/colons/etc. that are unsafe in filenames don't. */
export function buildShareImageFilename(petName: string): string {
  const safe = petName.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40)
  return `statling-${safe || 'result'}.png`
}

/**
 * Triggers a browser download of the given blob via a throwaway <a download>.
 *
 * The object URL is revoked on a deferred macrotask (setTimeout), not
 * synchronously right after `link.click()`. Desktop Chromium/Firefox happen
 * to tolerate an immediate revoke (their download manager grabs the blob:
 * URL synchronously within the same click handling), but that's an
 * implementation coincidence, not a guarantee — `<a download>` on a blob:
 * URL is a well-documented source of intermittent/silent failures on mobile
 * browsers (most notoriously iOS Safari, which doesn't even support the
 * `download` attribute reliably and instead navigates the blob: URL itself)
 * precisely because the actual fetch of the URL's content can be scheduled
 * a tick or more after the synchronous click() call returns. Revoking
 * before that fetch runs silently breaks the download with no error and no
 * visible reaction — exactly the "버튼을 눌렀지만 아무 일도 일어나지 않음"
 * failure mode this guards against. The delay is invisible either way (it
 * only defers when the Blob's memory is freed); 4s is a generous, commonly
 * used margin, not a value the download's correctness depends on being
 * exact.
 */
export function downloadShareImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
