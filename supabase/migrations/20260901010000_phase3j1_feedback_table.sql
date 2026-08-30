-- =============================================================================
-- Statling — Phase 3J-1: server-backed My Page feedback (public.feedback).
-- =============================================================================
-- Scope: one new table only. lib/feedback/feedback-storage.ts previously had
-- no Supabase table to migrate into (see build-local-snapshot.ts's own
-- "Deliberately excluded" doc comment) and stored everything in
-- localStorage under `statling:feedback:<deviceId>`, unreadable by anyone but
-- that one browser. This closes that gap for signed-in users only — a guest
-- still keeps the pre-existing local-only behavior (RLS requires auth.uid(),
-- there is no anonymous write path here, by design).
--
-- Shape: PK = user_id (Group A "single row per user" pattern, same as
-- pet_care_state/room_state/xp_totals in 20260819000000) — exactly one
-- feedback row per account, INSERT-or-UPDATE via `upsert(..., {onConflict:
-- 'user_id'})`, mirroring FeedbackRecord's existing "always exactly one
-- record" contract (see feedback-types.ts's own doc comment) instead of a
-- growing list.
--
-- client_id carries the client-generated FeedbackRecord.id (originally
-- produced by generateSessionId() for the localStorage-only record) so an
-- existing local id survives a migration into this table unchanged — not a
-- uniqueness key, just continuity for the one caller that already reads it.
--
-- satisfaction/return_intent are restricted by CHECK to the same closed sets
-- lib/feedback/feedback-types.ts's SatisfactionValue/ReturnIntentValue
-- already enforce client-side (defense in depth, same convention as
-- profiles.gender in 20260901000000). favorite_part/improvement_area stay
-- plain text[] with no per-element CHECK, same as every other array column
-- in this schema (e.g. pet_care_state.unlocked_reward_levels) — validated
-- client-side only.
--
-- submitted_at is set once (at first insert) and never touched again by the
-- trigger below — the client is responsible for re-sending the ORIGINAL
-- submitted_at on every update (same "first submission time never changes"
-- contract as before), matching FeedbackRecord's existing
-- submittedAt/updatedAt split. updated_at is touched by the standard
-- touch_updated_at() trigger already used across this schema.
--
-- comment/*_other_text/*_detail are free-text — stored here, NEVER sent to
-- GA4/PostHog (see lib/feedback/feedback-storage.ts and
-- components/brain-bet/feedback-section.tsx).
-- =============================================================================

create table if not exists public.feedback (
  user_id                     uuid primary key references auth.users (id) on delete cascade,
  client_id                   text not null,
  satisfaction                text not null
    check (satisfaction in ('very-satisfied', 'satisfied', 'neutral', 'unsatisfied', 'very-unsatisfied')),
  favorite_part                text[] not null default '{}',
  favorite_part_other_text     text not null default '',
  improvement_area             text[] not null default '{}',
  improvement_area_other_text  text not null default '',
  improvement_area_detail      text not null default '',
  return_intent                text not null
    check (return_intent in ('definitely', 'sometimes', 'unsure', 'unlikely')),
  return_intent_detail         text not null default '',
  comment                      text not null default '',
  app_version                  text not null default '',
  device_type                  text not null default '',
  statling_id                  text,
  statling_name                text,
  submitted_at                 timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

comment on table public.feedback is
  'Phase 3J-1 — one row per account (PK user_id), upserted from My Page''s "Statling, 어떠셨나요?" form. comment/*_other_text/*_detail are free-text and must never be forwarded to GA4/PostHog (see feedback-section.tsx). Signed-in users only — guests keep the pre-existing localStorage-only record.';
comment on column public.feedback.client_id is
  'The client-generated FeedbackRecord.id (generateSessionId()) — carried through as-is, not a uniqueness key. Lets a pre-existing localStorage record keep its original id once migrated here.';
comment on column public.feedback.submitted_at is
  'Set once, at first submission — the client re-sends this same value on every later update. Not auto-touched (unlike updated_at below).';

alter table public.feedback enable row level security;

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select
  using (auth.uid() = user_id);

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "feedback_update_own" on public.feedback;
create policy "feedback_update_own" on public.feedback
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy — deliberately: nothing in the app deletes a feedback
-- record today, same as every other Group A table in this schema. No grant
-- to `anon` either — an unauthenticated request is refused by RLS with no
-- policy to match, exactly like the other user-owned tables here.
grant select, insert, update on public.feedback to authenticated;

drop trigger if exists trg_feedback_touch_updated_at on public.feedback;
create trigger trg_feedback_touch_updated_at
  before update on public.feedback
  for each row execute function public.touch_updated_at();
