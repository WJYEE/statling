'use client'

import { Logo } from '@/components/brain-bet/logo'
import { ToyButton } from '@/components/brain-bet/toy-button'
import type { RestoreConflictInfo } from '@/lib/auth/auth-context'

interface RestoreConflictScreenProps {
  conflict: RestoreConflictInfo
  /** Adopts the server's Statling — overwrites this device's local state. */
  onUseServer: () => void
  /** Keeps this device's Statling as-is; the server's conflicting data is left untouched. */
  onKeepLocal: () => void
}

/**
 * Phase 2C-2 — Case C (lib/migration/restore-conflict.ts): this account's
 * server data and this device's local data both have a Statling, and
 * they're not the same one. Shown by game-flow.tsx instead of the normal
 * phase switch whenever useAuth().restoreConflict is non-null — neither
 * side's data is touched until one of the two buttons below is pressed.
 * Reuses the exact SaveScreen/NamingScreen layout convention (centered
 * column, Logo, ToyButton) rather than introducing new screen chrome.
 */
export function RestoreConflictScreen({ conflict, onUseServer, onKeepLocal }: RestoreConflictScreenProps) {
  const serverName = conflict.snapshot.pet?.statling_name?.trim() || '이름 없음'
  const localName = conflict.localPet.statlingName?.trim() || '이름 없음'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <Logo size="sm" />

      <h1 className="mt-8 text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
        두 개의 Statling을 찾았어요
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        이 계정에 저장된 Statling과 이 기기에 있는 Statling이 서로 달라요.
        <br />
        어느 쪽을 사용할지 선택해주세요.
      </p>

      <div className="mt-6 w-full space-y-3 text-left">
        <div className="rounded-2xl bg-card px-4 py-3 toy-border">
          <p className="text-xs font-bold text-muted-foreground">계정에 저장된 Statling</p>
          <p className="mt-1 font-display text-base font-extrabold text-foreground">{serverName}</p>
        </div>
        <div className="rounded-2xl bg-card px-4 py-3 toy-border">
          <p className="text-xs font-bold text-muted-foreground">이 기기의 Statling</p>
          <p className="mt-1 font-display text-base font-extrabold text-foreground">{localName}</p>
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col gap-3">
        <ToyButton className="w-full" onClick={onUseServer}>
          계정에 저장된 Statling 사용하기
        </ToyButton>
        <ToyButton variant="secondary" className="w-full" onClick={onKeepLocal}>
          이 기기의 Statling 유지하기
        </ToyButton>
      </div>
    </div>
  )
}
