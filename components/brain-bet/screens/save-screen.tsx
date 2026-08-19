'use client'

import { Logo } from '@/components/brain-bet/logo'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { useAuth } from '@/lib/auth/auth-provider'

interface SaveScreenProps {
  onContinue: () => void
  onSkip: () => void
}

/**
 * Post-hatch save/login prompt (GAME_SPEC.MD §16.1). Login is never forced —
 * "나중에 하기" always advances the flow the same way `onContinue` does.
 */
export function SaveScreen({ onContinue, onSkip }: SaveScreenProps) {
  const { isConfigured } = useAuth()

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <Logo size="sm" />
      <h1 className="mt-8 text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
        이 친구를 잃어버리지 않도록
        <br />
        저장해둘까요?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        로그인하면 다음에도 Statling을 이어서 만날 수 있어요.
      </p>

      <div className="mt-8 w-full">
        {isConfigured ? (
          <AuthForm defaultMode="signup" onAuthenticated={onContinue} />
        ) : (
          <p className="rounded-2xl bg-card px-4 py-3 text-xs font-semibold text-muted-foreground toy-border">
            로그인 기능이 아직 준비되지 않았어요. &quot;나중에 하기&quot;로 계속 진행할 수 있어요.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-6 text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
      >
        나중에 하기
      </button>
    </div>
  )
}
