'use client'

import { Toast } from '@base-ui/react/toast'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * App-wide toast system, built on @base-ui/react's headless Toast primitive
 * (already a project dependency — no new library added) and styled to match
 * the existing "toy" design system (rounded-2xl, toy-border, toy-shadow).
 * Mounted once in app/layout.tsx; any client component calls
 * `Toast.useToastManager().add(...)` to show one (see reveal-screen.tsx's
 * share button for the first real usage).
 */
export function AppToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        {/*
          Phase 3F-1 QA fix, two parts:
          1) pointer-events-none here (Toast.Root below already opts back in
             with pointer-events-auto) so the empty space around/between
             toast cards never blocks clicks underneath the viewport's own
             full-width, high-z-index box.
          2) bottom-24 sm:bottom-28 (not bottom-4/6) — the same clearance
             every screen already reserves for NavRail via its content
             padding (see e.g. room-screen.tsx's pb-24 sm:pb-28). At
             bottom-4, a real toast card (not just the viewport box) visibly
             sat on top of NavRail's middle tabs on small viewports — e.g.
             the post-login "로그인했어요!" toast covered "내 스탯"/"랭킹"/
             "Statling" at 375x667 for its whole visible duration, a real
             tap-blocking overlap, not just an empty-space hit-test issue.
        */}
        <Toast.Viewport className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] mx-auto flex w-full max-w-sm flex-col items-stretch gap-2 px-4 sm:bottom-28">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const isError = toast.type === 'error'
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          'pointer-events-auto flex items-start gap-2 rounded-2xl bg-card px-4 py-3 text-left toy-border toy-shadow-lg',
          'transition-all duration-200 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0',
        )}
      >
        {isError ? (
          <XCircle size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <Toast.Title className="font-display text-sm font-extrabold text-foreground" />
          <Toast.Description className="mt-0.5 text-xs text-muted-foreground" />
        </div>
        <Toast.Close
          aria-label="닫기"
          className="shrink-0 rounded-full px-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          ✕
        </Toast.Close>
      </Toast.Root>
    )
  })
}
