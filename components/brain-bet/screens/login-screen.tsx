'use client'

import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'

interface LoginScreenProps {
  /** Auth succeeded — game-flow.tsx decides Room vs a fresh Intro from there based on whatever local pet data already exists (login never changes that data itself). */
  onAuthenticated: () => void
  onBack: () => void
}

/**
 * Full-screen 로그인/회원가입 — reached only from Landing's "Statling 만나러
 * 가기" CTA, shown when this device has logged in before but is currently
 * signed out (see game-flow.tsx's isReturningLoggedOut). Not part of the
 * Intro run itself; a first-time visitor never sees this screen.
 */
export function LoginScreen({ onAuthenticated, onBack }: LoginScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10">
      <Logo size="sm" />

      <h1 className="mt-6 text-balance text-center font-display text-2xl font-extrabold leading-snug text-foreground">
        다시 만나서 반가워요!
        <br />
        로그인하고 이어서 만나보세요.
      </h1>

      <div className="mt-8 w-full">
        <AuthForm defaultMode="signin" onAuthenticated={onAuthenticated} />
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground"
      >
        <ArrowLeft size={16} strokeWidth={2.4} />
        나중에 할게요
      </button>
    </div>
  )
}
