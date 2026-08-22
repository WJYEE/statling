-- =============================================================================
-- Statling — Phase 3B-2: account-level ranking nickname.
-- =============================================================================
-- Scope: 1 new nullable column on public.profiles only. No new table, no new
-- RLS policy, no new grant, no trigger, no RPC/function, no unique constraint,
-- no default, no DB-level format/length check. The column is covered end to
-- end by the EXISTING profiles_select_own / profiles_update_own policies and
-- the existing `grant select, update on public.profiles to authenticated`
-- (all from supabase/migrations/20260819000000_phase1_schema_and_rls.sql) —
-- a client can already read/update its own profiles row, so reading/writing
-- this one extra column needs nothing further.
--
-- Purpose: the ranking system (Phase 3B) needs a public-facing display name
-- independent of pets.statling_name (the pet's own name, immutable once set
-- — see guard_pet_identity_immutable() — and never meant to double as an
-- account handle). NULL = no nickname chosen yet; this migration does not
-- populate it from anywhere (no statling_name copy, no auth metadata read —
-- see the Phase 3B-1 report for why neither exists as a reusable source).
-- Duplicate nicknames across different user_ids are an accepted product
-- decision (see Phase 3B-1 report §7), so deliberately no unique index
-- either.
--
-- Length/character validation (2-12 chars, 한글/영문/숫자 only) is enforced
-- client-side by lib/profile/nickname.ts's validateNickname(), not here —
-- a DB-level check constraint was considered and deliberately left out for
-- this phase, matching the task's "DB 레벨 validation을 과하게 추가하지
-- 마세요" instruction; RLS already fully owns who can write which row.
--
-- Idempotent: `add column if not exists` is safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists nickname text;

comment on column public.profiles.nickname is
  'Phase 3B-2 — public ranking display name, independent of pets.statling_name (the pet''s own, separately-immutable name). NULL = not chosen yet. No unique constraint (duplicate nicknames across different user_ids are allowed by product decision). Length/character validation lives in lib/profile/nickname.ts, not the database.';
