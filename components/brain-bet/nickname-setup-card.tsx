'use client'

import { useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useAuth } from '@/lib/auth/auth-provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  NICKNAME_MAX_LENGTH,
  updateProfileNickname,
  updateProfileNicknameFromStatlingName,
  validateNickname,
  validateStatlingNameForReuse,
  type NicknameValidationError,
} from '@/lib/profile/nickname'

const VALIDATION_MESSAGE: Record<NicknameValidationError, string> = {
  empty: '이름을 입력해주세요.',
  too_short: '2자 이상 입력해주세요.',
  too_long: '12자 이하로 입력해주세요.',
  invalid_characters: '한글, 영문, 숫자만 사용할 수 있어요.',
}

interface NicknameSetupCardProps {
  /** The pet's own name (pets.statling_name via the already-loaded local profile) — offered as a one-tap shortcut, never assumed to already satisfy nickname rules (see handleUseStatlingName). */
  statlingName: string
  /** Fired once profiles.nickname is confirmed saved — never receives anything but the (already-validated) nickname value itself, never logged by this component. */
  onSaved: (nickname: string) => void
}

/**
 * Phase 3B-4 — small nickname setup card shown in place of the XP ranking
 * list when a logged-in user has no profiles.nickname yet. Reuses Phase
 * 3B-2's validateNickname()/updateProfileNickname() as-is — validation rules
 * themselves are never duplicated or re-implemented here.
 */
export function NicknameSetupCard({ statlingName, onSaved }: NicknameSetupCardProps) {
  const { user } = useAuth()
  const toastManager = Toast.useToastManager()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

/** Shared by both save paths below — only the validator/writer pair differs. */
  async function saveWith(
    rawValue: string,
    validate: (raw: string) => ReturnType<typeof validateNickname>,
    write: (client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, userId: string, raw: string) => ReturnType<typeof updateProfileNickname>,
  ) {
    if (!user || saving) return
    const validated = validate(rawValue)
    if (!validated.ok) {
      setError(VALIDATION_MESSAGE[validated.reason])
      return
    }
    const client = getSupabaseBrowserClient()
    if (!client) {
      toastManager.add({ title: '저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
      return
    }
    setSaving(true)
    setError(null)
    const result = await write(client, user.id, validated.value)
    setSaving(false)
    if (!result.ok) {
      toastManager.add({ title: '저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
      return
    }
    onSaved(validated.value)
  }

  /** Direct input — 2-12자 (validateNickname's normal floor, unchanged). */
  function save(rawValue: string) {
    return saveWith(rawValue, validateNickname, updateProfileNickname)
  }

  /**
   * "Statling 이름 그대로 사용할래요" — never assumes statlingName already
   * satisfies the DIRECT-input nickname rules (it was validated against a
   * completely different, unrelated naming flow with its own, more
   * permissive 1자 floor — lib/naming.ts). Uses
   * validateStatlingNameForReuse()/updateProfileNicknameFromStatlingName()
   * instead of the direct-input pair, so a 1-character Statling name (e.g.
   * "몽") is accepted here without loosening what a manually-typed nickname
   * requires. Still runs through the same inline-error UI as manual input —
   * an invalid Statling name (too long, bad characters) lands in the input
   * field with its own inline error instead of silently failing or crashing.
   */
  function handleUseStatlingName() {
    if (!statlingName || saving) return
    setInput(statlingName)
    void saveWith(statlingName, validateStatlingNameForReuse, updateProfileNicknameFromStatlingName)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card px-5 py-5 toy-border">
      <div>
        <p className="font-display text-base font-extrabold text-foreground">랭킹에서 사용할 이름을 정해주세요</p>
        <p className="mt-1 text-xs text-muted-foreground">이 이름은 다른 사용자에게 보여요.</p>
      </div>

      <input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          if (error) setError(null)
        }}
        placeholder="닉네임 입력"
        maxLength={NICKNAME_MAX_LENGTH}
        disabled={saving}
        className="w-full rounded-xl bg-background px-4 py-3 text-sm font-bold text-foreground toy-border outline-none disabled:opacity-70"
      />
      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      <ToyButton onClick={() => void save(input)} disabled={saving} className="w-full">
        {saving ? '저장 중...' : '저장하기'}
      </ToyButton>

      {statlingName && (
        <button
          type="button"
          onClick={handleUseStatlingName}
          disabled={saving}
          className="text-xs font-bold text-muted-foreground underline-offset-4 hover:underline disabled:opacity-70"
        >
          Statling 이름 &quot;{statlingName}&quot; 그대로 사용할래요
        </button>
      )}
    </div>
  )
}
