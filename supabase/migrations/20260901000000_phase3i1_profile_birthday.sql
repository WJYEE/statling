-- =============================================================================
-- Statling — Phase 3I-1: user birth_date / gender on profiles.
-- =============================================================================
-- Scope: 2 new nullable columns on public.profiles only. No new table, no new
-- RLS policy, no new grant, no new RPC. Same shape as Phase 3B-2's
-- profiles.nickname (see 20260823000000_phase3b2_profile_nickname.sql): the
-- EXISTING profiles_select_own / profiles_update_own policies and the
-- existing `grant select, update on public.profiles to authenticated` (both
-- from 20260819000000_phase1_schema_and_rls.sql) already cover reading/
-- writing these two extra columns — a client can already read/update its own
-- profiles row, nothing further is needed.
--
-- Both columns are optional, user-entered profile data, never populated from
-- anywhere else (no default, no backfill) — NULL means "not provided", which
-- is the expected, permanent state for any user who skips this question.
--
-- birth_date: plain `date` (no time-of-day, no timezone) — the client always
-- reads/writes it as a bare YYYY-MM-DD string (see lib/profile/birthday.ts),
-- so no UTC/local conversion can ever shift it by a day. Age is deliberately
-- never stored — it's always derived from birth_date on read, so it can't
-- silently go stale.
--
-- gender: plain `text` restricted to a fixed 4-value set by a CHECK
-- constraint (not a Postgres ENUM type — a CHECK is simpler to extend later
-- and matches how lib/pet-care/types.ts's CareActionId-style string unions
-- are already validated client-side elsewhere in this project).
--
-- Only one DB-level guard is added beyond "is it one of the allowed values":
-- birth_date can never be in the future. This mirrors pets_top_second_stat_distinct
-- (20260819000000) — a single boundary condition, not a validation engine —
-- deliberately NOT a DB-level "too old" check: what counts as an implausible
-- age is a soft UX judgment call, better suited to client-side validation
-- (lib/profile/birthday.ts), not a hard schema invariant.
--
-- Idempotent: `add column if not exists` + `drop constraint if exists` then
-- `add constraint` are both safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists gender text;

alter table public.profiles
  drop constraint if exists profiles_birth_date_not_future;
alter table public.profiles
  add constraint profiles_birth_date_not_future
  check (birth_date is null or birth_date <= current_date);

alter table public.profiles
  drop constraint if exists profiles_gender_allowed_values;
alter table public.profiles
  add constraint profiles_gender_allowed_values
  check (gender is null or gender in ('female', 'male', 'other', 'prefer_not_to_say'));

comment on column public.profiles.birth_date is
  'Phase 3I-1 — optional, user-entered date of birth. NULL = not provided (the default, permanent state for any user who skips it). Plain date (no time/timezone) so it can never drift by a day. Age is never stored — always derived from this on read. DB only guards against a future date; an implausibly old date is rejected client-side (lib/profile/birthday.ts), not here.';
comment on column public.profiles.gender is
  'Phase 3I-1 — optional, user-selected gender. NULL = not provided. Restricted by CHECK to exactly: female, male, other, prefer_not_to_say.';
