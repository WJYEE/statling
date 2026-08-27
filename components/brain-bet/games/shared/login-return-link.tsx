'use client'

/**
 * Guest-only escape hatch from Initial Assessment back to the existing login
 * screen — shown only while flowMode is 'first' and no user is signed in
 * (see each classic game component's own header, and game-flow.tsx's
 * onGoToLogin prop, which is only ever passed a real callback under that
 * exact condition; omitted entirely otherwise). Navigates via the same
 * setPhase('login') the rest of the app already uses (game-flow.tsx#goToLogin)
 * — never router/browser history back — so it never disturbs whatever the
 * user was doing before landing on Assessment.
 */
export function LoginReturnLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:underline"
    >
      ← 로그인 화면으로 돌아가기
    </button>
  )
}
