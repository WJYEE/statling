'use client'

import { useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { Check, CheckCircle2, ChevronDown, MessageCircleHeart, Pencil } from 'lucide-react'
import { loadFeedbackRecord, upsertFeedbackRecord } from '@/lib/feedback/feedback-storage'
import {
  emptyFeedbackDraft,
  FAVORITE_PART_OPTIONS,
  IMPROVEMENT_AREA_OPTIONS,
  RETURN_INTENT_FOLLOW_UP_VALUES,
  RETURN_INTENT_OPTIONS,
  SATISFACTION_OPTIONS,
  type FeedbackDraft,
  type FeedbackRecord,
  type ReturnIntentValue,
  type SatisfactionValue,
} from '@/lib/feedback/feedback-types'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { cn } from '@/lib/utils'

interface RadioGroupProps<T extends string> {
  name: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
}

/** Google Form-style single-select — a rounded circle indicator per option, explicit conditional styling (no peer/sibling CSS tricks) since selection state is already known from `value`. */
function RadioGroup<T extends string>({ name, options, value, onChange }: RadioGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <label
            key={opt.value}
            className={cn(
              'flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 toy-border transition-colors',
              selected && 'bg-accent/40',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
                selected ? 'border-primary' : 'border-[color:var(--ink)]',
              )}
            >
              {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

interface CheckboxGroupProps<T extends string> {
  name: string
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
}

/** Same visual language as RadioGroup, but each option toggles independently — a rounded-square indicator instead of a circle, since more than one choice is allowed. */
function CheckboxGroup<T extends string>({ name, options, value, onChange }: CheckboxGroupProps<T>) {
  function toggle(optValue: T) {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue])
  }

  return (
    <div role="group" aria-label={name} className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value)
        return (
          <label
            key={opt.value}
            className={cn(
              'flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 toy-border transition-colors',
              selected && 'bg-accent/40',
            )}
          >
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => toggle(opt.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-md border-2',
                selected ? 'border-primary bg-primary' : 'border-[color:var(--ink)]',
              )}
            >
              {selected && <Check size={13} strokeWidth={3} className="text-primary-foreground" />}
            </span>
            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

const FIELD_LABEL_CLASS = 'text-sm font-bold text-foreground'

function draftFromRecord(record: FeedbackRecord): FeedbackDraft {
  return {
    satisfaction: record.satisfaction,
    favoritePart: record.favoritePart,
    favoritePartOtherText: record.favoritePartOtherText ?? '',
    improvementArea: record.improvementArea,
    improvementAreaOtherText: record.improvementAreaOtherText ?? '',
    improvementAreaDetail: record.improvementAreaDetail ?? '',
    returnIntent: record.returnIntent,
    returnIntentDetail: record.returnIntentDetail ?? '',
    comment: record.comment,
  }
}

interface FeedbackSectionProps {
  /** Stamped onto the saved record as statlingId/statlingName — see lib/feedback/feedback-storage.ts. Null before a Statling is hatched. */
  petProfile: PetProfile | null
  /** Outer top-margin override — defaults to the spacing this section used when it sat directly under the previous card (see MyPageScreen for the "의견 보내기" section's own header spacing). */
  className?: string
}

/**
 * "Statling, 어떠셨나요?" — a single-page satisfaction survey. Always exactly
 * one feedback per device: a new submission UPDATEs the existing record
 * rather than adding another (see lib/feedback/feedback-storage.ts's
 * upsertFeedbackRecord) — "내 의견 수정하기," not "다른 의견도 남기기." On
 * mount, an existing record (if any) pre-fills the form so editing reads as
 * "here's what you told us, change anything" rather than starting blank.
 * Q1/Q4 are required single-select radios, Q2/Q3 are required multi-select
 * checkboxes (at least one choice each); Q5 is an optional free-text
 * comment. Q2/Q3's "기타" option and Q3/Q4's follow-up elaboration prompts
 * are all conditional free-text that only appear once their trigger
 * selection is made, and are never required to submit. Submitting is
 * guarded by `isSubmitting` (blocks a double-click from writing two updates
 * in a row) and the form is replaced by a confirmation card right after a
 * successful submit.
 */
export function FeedbackSection({ petProfile, className = 'mt-6' }: FeedbackSectionProps) {
  const toastManager = Toast.useToastManager()
  const [existingRecord, setExistingRecord] = useState<FeedbackRecord | null>(() => loadFeedbackRecord())
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    const existing = loadFeedbackRecord()
    return existing ? draftFromRecord(existing) : emptyFeedbackDraft()
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  /** Collapsed by default — MyPage stays compact on first visit; tapping the header expands the form, tapping again collapses it. */
  const [isOpen, setIsOpen] = useState(false)

  const isEditingExisting = existingRecord !== null
  const missingRequired =
    !draft.satisfaction || draft.favoritePart.length === 0 || draft.improvementArea.length === 0 || !draft.returnIntent

  function updateField<K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (isSubmitting) return
    if (missingRequired) {
      setShowValidation(true)
      toastManager.add({ title: '필수 항목을 모두 선택해주세요.', type: 'error' })
      return
    }
    setIsSubmitting(true)
    try {
      const saved = upsertFeedbackRecord({
        satisfaction: draft.satisfaction as SatisfactionValue,
        favoritePart: draft.favoritePart,
        favoritePartOtherText: draft.favoritePartOtherText,
        improvementArea: draft.improvementArea,
        improvementAreaOtherText: draft.improvementAreaOtherText,
        improvementAreaDetail: draft.improvementAreaDetail,
        returnIntent: draft.returnIntent as ReturnIntentValue,
        returnIntentDetail: draft.returnIntentDetail,
        comment: draft.comment,
        statlingId: petProfile?.id ?? null,
        statlingName: petProfile?.name ?? null,
      })
      setExistingRecord(saved)
      setJustSubmitted(true)
      toastManager.add({ title: isEditingExisting ? '의견을 수정했어요!' : '소중한 의견 감사해요!', type: 'success' })
    } catch {
      toastManager.add({ title: '제출하지 못했어요. 다시 시도해주세요.', type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn(className, 'rounded-2xl bg-card px-4 py-5 toy-border')}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 text-left"
      >
        <MessageCircleHeart size={18} strokeWidth={2.4} className="shrink-0 text-primary" />
        <h2 className="flex-1 font-display text-base font-extrabold text-foreground">Statling, 어떠셨나요?</h2>
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          aria-hidden="true"
          className={cn('shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {/* grid-rows trick collapses/expands without measuring content height in JS — works regardless of which branch (form vs. submitted card) is rendered inside. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {justSubmitted ? (
            <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 size={28} strokeWidth={2.4} className="text-primary" />
              <p className="font-display text-sm font-extrabold text-foreground">
                소중한 의견 감사합니다. 다음 업데이트에 적극 반영하겠습니다!
              </p>
              <button
                type="button"
                onClick={() => {
                  setJustSubmitted(false)
                  setShowValidation(false)
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary underline underline-offset-2"
              >
                <Pencil size={12} strokeWidth={2.6} />
                내 의견 수정하기
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEditingExisting ? '보내주신 의견을 언제든 수정할 수 있어요.' : '더 나은 Statling을 만드는 데 큰 도움이 돼요.'}
              </p>

              <div className="mt-4 flex flex-col gap-5">
                <div>
                  <p className={FIELD_LABEL_CLASS}>1. 전체적으로 얼마나 만족했나요?</p>
                  <div className="mt-2">
                    <RadioGroup
                      name="satisfaction"
                      options={SATISFACTION_OPTIONS}
                      value={draft.satisfaction}
                      onChange={(v) => updateField('satisfaction', v)}
                    />
                  </div>
                </div>

                <div>
                  <p className={FIELD_LABEL_CLASS}>
                    2. 가장 만족한 부분은 무엇인가요? <span className="font-normal text-muted-foreground">(복수 선택 가능)</span>
                  </p>
                  <div className="mt-2">
                    <CheckboxGroup
                      name="favoritePart"
                      options={FAVORITE_PART_OPTIONS}
                      value={draft.favoritePart}
                      onChange={(v) => updateField('favoritePart', v)}
                    />
                  </div>
                  {draft.favoritePart.includes('other') && (
                    <input
                      type="text"
                      value={draft.favoritePartOtherText}
                      onChange={(e) => updateField('favoritePartOtherText', e.target.value)}
                      placeholder="어떤 부분이 좋았는지 알려주세요. (선택)"
                      maxLength={200}
                      className="mt-2 w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground toy-border placeholder:text-muted-foreground focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <p className={FIELD_LABEL_CLASS}>
                    3. 가장 아쉬웠던 부분은 무엇인가요? <span className="font-normal text-muted-foreground">(복수 선택 가능)</span>
                  </p>
                  <div className="mt-2">
                    <CheckboxGroup
                      name="improvementArea"
                      options={IMPROVEMENT_AREA_OPTIONS}
                      value={draft.improvementArea}
                      onChange={(v) => updateField('improvementArea', v)}
                    />
                  </div>
                  {draft.improvementArea.includes('other') && (
                    <input
                      type="text"
                      value={draft.improvementAreaOtherText}
                      onChange={(e) => updateField('improvementAreaOtherText', e.target.value)}
                      placeholder="어떤 부분이 아쉬웠는지 알려주세요. (선택)"
                      maxLength={200}
                      className="mt-2 w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground toy-border placeholder:text-muted-foreground focus:outline-none"
                    />
                  )}
                  {draft.improvementArea.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        조금만 더 자세히 알려주시면 서비스 개선에 큰 도움이 됩니다. (선택)
                      </p>
                      <textarea
                        value={draft.improvementAreaDetail}
                        onChange={(e) => updateField('improvementAreaDetail', e.target.value)}
                        rows={2}
                        maxLength={300}
                        className="mt-1.5 w-full resize-none rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground toy-border placeholder:text-muted-foreground focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className={FIELD_LABEL_CLASS}>4. 앞으로도 계속 사용하고 싶나요?</p>
                  <div className="mt-2">
                    <RadioGroup
                      name="returnIntent"
                      options={RETURN_INTENT_OPTIONS}
                      value={draft.returnIntent}
                      onChange={(v) => updateField('returnIntent', v)}
                    />
                  </div>
                  {draft.returnIntent && RETURN_INTENT_FOLLOW_UP_VALUES.includes(draft.returnIntent) && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        어떤 점이 개선되면 다시 사용할 것 같나요? (선택)
                      </p>
                      <textarea
                        value={draft.returnIntentDetail}
                        onChange={(e) => updateField('returnIntentDetail', e.target.value)}
                        rows={2}
                        maxLength={300}
                        className="mt-1.5 w-full resize-none rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground toy-border placeholder:text-muted-foreground focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className={FIELD_LABEL_CLASS}>
                    5. 추가로 하고 싶은 말 <span className="font-normal text-muted-foreground">(선택)</span>
                  </p>
                  <textarea
                    value={draft.comment}
                    onChange={(e) => updateField('comment', e.target.value)}
                    placeholder="자유롭게 의견을 남겨주세요."
                    rows={3}
                    maxLength={500}
                    className="mt-2 w-full resize-none rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground toy-border placeholder:text-muted-foreground focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">이름, 연락처 등 개인정보는 적지 않아주세요.</p>
                </div>

                {showValidation && missingRequired && (
                  <p className="text-xs font-bold text-destructive">1~4번 항목을 모두 선택해주세요.</p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={cn(
                    'rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground toy-border toy-shadow transition-opacity',
                    isSubmitting && 'opacity-60',
                  )}
                >
                  {isSubmitting ? '제출 중...' : isEditingExisting ? '의견 수정하기' : '의견 보내기'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
