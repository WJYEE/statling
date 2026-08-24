const STORAGE_KEY = 'statling.pendingFriendCode.v1'

/**
 * Phase 3G-2 — persists a friend_code across a full page navigation, which a
 * future "친구로 추가하고 기록 비교하기" CTA (Phase 3G-4) needs because
 * Google OAuth is a hard redirect: the browser leaves the app entirely, and
 * app/auth/callback/route.ts redirects back to the bare origin on return —
 * dropping whatever path/query (e.g. /share/[petId]?ref=...) the user
 * started from (verified by reading that route directly, not assumed). The
 * email/password path doesn't hard-navigate, but a guest could still close
 * the tab between clicking the CTA and finishing AuthForm, so both paths use
 * this same mechanism rather than one relying on in-memory React state and
 * the other on storage.
 *
 * sessionStorage (not localStorage) is deliberate: a pending invite is
 * single-visit intent tied to the tab that received the invite link, not
 * something that should silently resurface in an unrelated future
 * tab/session days later.
 *
 * No caller yet — Phase 3G-2 is backend/data-layer foundation only. Phase
 * 3G-4 is expected to call setPendingFriendCode() when a logged-out visitor
 * taps the friend CTA (right before showing AuthForm), then
 * getPendingFriendCode() once auth resolves (after AuthForm's
 * onAuthenticated, and again on app boot to cover the Google OAuth
 * round-trip), then clearPendingFriendCode() once createFriendship() has
 * been attempted (success or a definitive failure) so a stale code never
 * re-fires on a later, unrelated login.
 */

export function setPendingFriendCode(code: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORAGE_KEY, code)
}

export function getPendingFriendCode(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(STORAGE_KEY)
}

export function clearPendingFriendCode(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(STORAGE_KEY)
}
