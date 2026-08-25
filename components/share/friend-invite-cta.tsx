'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Users } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useAuth } from '@/lib/auth/auth-provider'
import { createFriendship } from '@/lib/friends/friend-connection'
import { fetchFriendInvitePreview } from '@/lib/friends/friend-invite-preview'
import { setPendingFriendCode } from '@/lib/friends/pending-friend-code'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface FriendInviteCtaProps {
  /** The `?ref=` query param value — the caller only renders this component when one is present. */
  friendCode: string
}

type InviteState =
  | { kind: 'loading' }
  | { kind: 'unavailable' } // unknown/invalid code, or the preview fetch itself failed — render nothing rather than a broken CTA
  | { kind: 'ready'; nickname: string }
  | { kind: 'guestLogin'; nickname: string }
  | { kind: 'handedOff'; nickname: string } // guest just authenticated — game-flow.tsx's own pending-code effect finishes the connection from here
  | { kind: 'connecting'; nickname: string }
  | { kind: 'success'; nickname: string }
  | { kind: 'error'; nickname: string; message: string }

const FRIENDLY_ERROR: Record<string, string> = {
  'create_friendship: cannot friend yourself': '내가 만든 초대 링크예요.',
  'create_friendship: friend code not found': '이 초대 링크는 더 이상 유효하지 않아요.',
  'create_friendship: invalid friend code': '이 초대 링크는 더 이상 유효하지 않아요.',
}

function friendlyError(message: string): string {
  return FRIENDLY_ERROR[message] ?? '친구 연결에 실패했어요. 다시 시도해주세요.'
}

/**
 * Phase 3G-4 — the ONLY UI that ever calls create_friendship from the
 * receiving side of an invite link. Rendered by share-page-client.tsx only
 * when the URL carries a `ref` — see that file's own doc comment for why the
 * existing "내 도감에 기록하기" CTA and Dex registration above this
 * component are completely untouched regardless of whether this renders.
 *
 * Two distinct connection paths, kept deliberately separate so this
 * component never calls create_friendship twice for the same click:
 *  - Already logged in: handleConnect() below calls create_friendship
 *    directly, same page, no reload.
 *  - Guest: clicking the CTA only stashes the code (lib/friends/
 *    pending-friend-code.ts) and reveals the existing AuthForm inline —
 *    the actual create_friendship call happens once, later, in game-flow.tsx's
 *    own pending-code effect (the one place that works for BOTH the
 *    email/password path AND a Google OAuth hard redirect, which leaves this
 *    whole page behind — see that effect's own doc comment). This component
 *    hands off rather than racing that effect with a second call.
 */
export function FriendInviteCta({ friendCode }: FriendInviteCtaProps) {
  const { user } = useAuth()
  const toastManager = Toast.useToastManager()
  const [state, setState] = useState<InviteState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'unavailable' })
      return
    }
    fetchFriendInvitePreview(client, friendCode).then((result) => {
      if (cancelled) return
      if (!result.ok || !result.nickname) {
        setState({ kind: 'unavailable' })
        return
      }
      setState({ kind: 'ready', nickname: result.nickname })
    })
    return () => {
      cancelled = true
    }
  }, [friendCode])

  async function handleConnect() {
    if (state.kind !== 'ready' && state.kind !== 'error') return
    const nickname = state.nickname

    if (!user) {
      setPendingFriendCode(friendCode)
      setState({ kind: 'guestLogin', nickname })
      return
    }

    setState({ kind: 'connecting', nickname })
    const client = getSupabaseBrowserClient()
    if (!client) {
      setState({ kind: 'error', nickname, message: '친구 연결에 실패했어요. 다시 시도해주세요.' })
      return
    }
    const result = await createFriendship(client, friendCode)
    if (!result.ok) {
      setState({ kind: 'error', nickname, message: friendlyError(result.error) })
      return
    }
    toastManager.add({ title: result.nickname ? `${result.nickname}님과 친구가 되었어요!` : '친구가 되었어요!', type: 'success' })
    setState({ kind: 'success', nickname })
  }

  if (state.kind === 'loading' || state.kind === 'unavailable') return null

  return (
    <div className="mt-4 w-full rounded-2xl bg-card px-5 py-4 toy-border">
      {state.kind === 'success' ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-sm font-bold text-secondary-foreground">
            <Check size={18} strokeWidth={2.6} />
            {state.nickname}님과 친구가 되었어요!
          </div>
          <Link href="/" className="text-xs font-bold text-primary underline-offset-2 hover:underline">
            내 Statling에서 친구 랭킹 보기
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Users size={18} strokeWidth={2.4} className="shrink-0 text-muted-foreground" />
            <p className="text-sm font-bold text-foreground">
              {user
                ? `${state.nickname}님과 친구가 되어 기록을 비교할까요?`
                : `로그인하면 ${state.nickname}님과 친구가 되어 기록을 비교할 수 있어요.`}
            </p>
          </div>

          {state.kind === 'error' && <p className="mt-2 text-xs font-semibold text-destructive">{state.message}</p>}

          {state.kind === 'guestLogin' ? (
            <AuthForm
              className="mt-3"
              defaultMode="signin"
              onAuthenticated={() => setState({ kind: 'handedOff', nickname: state.nickname })}
            />
          ) : state.kind === 'handedOff' ? (
            <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">로그인 완료! 잠시 후 친구가 연결돼요.</p>
          ) : (
            <ToyButton variant="secondary" className="mt-3 w-full" onClick={handleConnect} disabled={state.kind === 'connecting'}>
              {state.kind === 'connecting' ? '연결하는 중...' : '친구로 추가하고 기록 비교하기'}
            </ToyButton>
          )}
        </>
      )}
    </div>
  )
}
