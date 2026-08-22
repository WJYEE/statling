-- =============================================================================
-- Statling — Phase 2D-6 Follow-up: account-level sync freshness marker.
-- =============================================================================
-- Scope: 1 new nullable column on public.profiles only. No new table, no new
-- RLS policy, no new grant, no trigger, no RPC/function. The column is
-- covered end to end by the EXISTING profiles_select_own / profiles_update_own
-- policies and the existing `grant select, update on public.profiles to
-- authenticated` (all from supabase/migrations/20260819000000_phase1_schema_
-- and_rls.sql) — a client can already read/update its own profiles row, so
-- reading/writing this one extra column needs nothing further.
--
-- Purpose: lib/migration/session-sync.ts's Case B branch (same confirmed
-- Statling identity on both local and server) currently trusts local
-- unconditionally, which Phase 2D-6's own multi-device QA proved can let a
-- stale device silently regress a genuinely newer value another device
-- already pushed (see the Phase 2D-6 Follow-up report). This column gives
-- Case B a coarse, conservative way to tell "server is newer" apart from
-- "local is newer" apart from "genuinely in sync" — see
-- restore-conflict.ts#compareSyncFreshness for the comparison itself, kept
-- deliberately simple (single flat timestamp, tolerance window, no vector
-- clock / per-domain revision).
--
-- Idempotent: `add column if not exists` is safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists sync_updated_at timestamptz;

comment on column public.profiles.sync_updated_at is
  'Phase 2D-6 Follow-up freshness marker — the last moment this account''s server data was confirmed to fully reflect a known-complete local snapshot (a successful Phase 2B migration, or a Phase 2D-6 Follow-up session-start catch-up sync). NOT a generic "row touched" timestamp (unlike profiles.updated_at, which the existing trg_profiles_touch_updated_at trigger bumps on ANY update to this row) — only ever set explicitly by migration-orchestrator.ts and lib/migration/session-catchup.ts, both after every one of the 18 domain tables in that batch has written successfully. NULL = no freshness marker yet (a legacy account that migrated before this column existed, or one that has never migrated) — lib/migration/restore-conflict.ts#compareSyncFreshness treats a missing marker on either side as "in sync" (trust local, the same no-op this system has always defaulted to), never as license to overwrite anything.';
