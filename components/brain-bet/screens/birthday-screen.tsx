'use client'

import { useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { Logo } from '@/components/brain-bet/logo'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { toLocalDateKey } from '@/lib/pet-care/visit-context'
import { cn } from '@/lib/utils'
import { GENDER_OPTIONS, validateBirthDate, updateProfileBirthday, type Gender, type BirthDateValidationError } from '@/lib/profile/birthday'
import { useAuth } from '@/lib/auth/auth-provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const GENDER_LABEL: Record<Gender, string> = {
  female: '여성',
  male: '남성',
  other: '기타',
  prefer_not_to_say: '응답하지 않음',
}

const VALIDATION_MESSAGE: Record<BirthDateValidationError, string> = {
  invalid_format: '올바른 날짜를 입력해주세요.',
  future_date: '아직 오지 않은 날짜예요.',
  too_old: '입력한 날짜를 다시 확인해주세요.',
}

interface BirthdayScreenProps {
  /** The pet's own given name (Naming just confirmed this) — used only for the header line, e.g. "몽이의 생일이에요!". */
  statlingName: string
  /** pets.confirmedAt (StoredPetProfile) — the moment "이 Statling과 함께하기" was clicked, this Phase's chosen Statling-birthday source of truth (see the Phase 3I-1 report for why: it's the actual confirm/birth moment, already persisted and synced, no new column needed). Falls back to "now" only if somehow missing, which should never happen for a pet that just went through Naming. */
  confirmedAtIso: string | undefined
  onContinue: () => void
}

/**
 * Phase 3I-1 — one-time "Statling's birthday + a little bit about you" beat,
 * inserted between Naming and Room (see game-flow.tsx's naming onConfirm,
 * which now targets this phase instead of 'room' directly). Reachable ONLY
 * from that one call site, which itself only runs the very first time a
 * brand-new pet is named (see game-flow.tsx's bootReady restore effect: a
 * returning user with `stored.confirmed && stored.statlingName` already set
 * goes straight to 'room' and never touches 'naming', so this screen is
 * never re-offered to an existing user by construction — no separate
 * "already seen onboarding" flag needed).
 *
 * birth_date/gender are shown ONLY when a real account exists (`user` from
 * useAuth()) — there's no local mirror for either field (see
 * lib/profile/birthday.ts's own doc comment), so a guest who skipped
 * SaveScreen's login step has nowhere to save them; showing input fields
 * that would silently fail to persist would be worse than not offering them
 * at all. A guest still gets the Statling-birthday moment itself, just
 * without the profile question underneath.
 */
export function BirthdayScreen({ statlingName, confirmedAtIso, onContinue }: BirthdayScreenProps) {
  const { user } = useAuth()
  const toastManager = Toast.useToastManager()
  const [birthDateInput, setBirthDateInput] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirmedAt = confirmedAtIso ? new Date(confirmedAtIso) : new Date()
  const birthdayLabel = toLocalDateKey(confirmedAt).replace(/-/g, '.')
  const todayKey = toLocalDateKey(new Date())

  async function handleContinue() {
    if (saving) return

    // Not signed in: nothing to save (see this component's own doc comment)
    // — the birthday moment above still applies, just move on.
    if (!user) {
      onContinue()
      return
    }

    let validatedBirthDate: string | null = null
    if (birthDateInput.trim() !== '') {
      const validated = validateBirthDate(birthDateInput)
      if (!validated.ok) {
        setError(VALIDATION_MESSAGE[validated.reason])
        return
      }
      validatedBirthDate = validated.value
    }

    // Both fields blank: nothing to write, no need to touch the network.
    if (validatedBirthDate === null && gender === null) {
      onContinue()
      return
    }

    setError(null)
    setSaving(true)
    const client = getSupabaseBrowserClient()
    if (client) {
      const result = await updateProfileBirthday(client, user.id, { birthDate: validatedBirthDate, gender })
      if (!result.ok) {
        toastManager.add({ title: '저장하지 못했어요. 다시 시도해주세요.', type: 'error' })
      }
    }
    setSaving(false)
    // Never blocks on a save failure — both fields are optional by design,
    // so losing this one write is not worth trapping the user here.
    onContinue()
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-10 text-center">
      <Logo size="sm" />

      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="text-4xl" aria-hidden="true">
          🎂
        </span>
        <p className="font-display text-sm font-extrabold text-primary">{birthdayLabel}</p>
        <h1 className="text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
          {statlingName}의 생일이에요!
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          오늘 처음 만난 날을 기억해둘게요.
          <br />
          우리 서로에 대해서도 조금 더 알아볼까요?
        </p>
      </div>

      {user && (
        <div className="mt-8 flex w-full flex-col gap-6">
          <div className="text-left">
            <p className="font-display text-sm font-extrabold text-foreground">내 생년월일</p>
            <input
              type="date"
              value={birthDateInput}
              max={todayKey}
              onChange={(e) => {
                setBirthDateInput(e.target.value)
                if (error) setError(null)
              }}
              disabled={saving}
              className="mt-2 w-full rounded-2xl bg-card px-4 py-3.5 text-center font-display text-base font-extrabold text-foreground toy-border outline-none disabled:opacity-70"
            />
            <p className={cn('mt-2 text-xs font-semibold', error ? 'text-destructive' : 'text-muted-foreground')}>
              {error ?? '생일이 되면 Statling이 축하해줄게요!'}
            </p>
          </div>

          <div className="text-left">
            <p className="font-display text-sm font-extrabold text-foreground">성별</p>
            <div role="group" aria-label="성별" className="mt-2 grid grid-cols-4 gap-1.5 rounded-xl bg-muted p-1">
              {GENDER_OPTIONS.map((option) => {
                const isActive = gender === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isActive}
                    disabled={saving}
                    onClick={() => setGender(isActive ? null : option)}
                    className={cn(
                      'rounded-lg px-1 py-2 text-[11px] font-bold transition-colors disabled:opacity-70',
                      isActive ? 'bg-card text-foreground toy-shadow-sm' : 'text-muted-foreground',
                    )}
                  >
                    {GENDER_LABEL[option]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <ToyButton className="mt-8 w-full" disabled={saving} data-sfx="confirm" onClick={() => void handleContinue()}>
        {saving ? '저장 중...' : '함께 시작하기'}
      </ToyButton>
    </div>
  )
}
