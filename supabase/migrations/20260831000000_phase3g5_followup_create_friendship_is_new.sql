-- =============================================================================
-- Statling — Phase 3G-5 Follow-up: create_friendship reports whether the
-- connection was actually new.
-- =============================================================================
-- Scope: 1 function redefinition only (create_friendship). No table/column/
-- RLS/grant change, no other function touched. Does NOT edit the
-- already-applied 20260828000000_phase3g2_friend_connection.sql — that file
-- is left exactly as it was applied; this is a pure follow-up, same pattern
-- as the Phase 3G-2 Follow-up (search_path) and Phase 3B-5 Follow-up
-- (ambiguous column) migrations before it.
--
-- -----------------------------------------------------------------------------
-- Why — investigated first, not assumed
-- -----------------------------------------------------------------------------
-- Phase 3G-5 needs a `friend_connected` analytics event that fires once per
-- GENUINE new connection, never on an idempotent re-accept of an
-- already-existing friendship (the task's own explicit requirement). The
-- original create_friendship always `return query select true, v_target_nickname`
-- regardless of whether `insert ... on conflict do nothing` actually inserted
-- a row or silently no-op'd on an existing one — verified by reading the
-- applied migration directly, not assumed. There is no way to tell "new" from
-- "already connected" from that response, so client-side analytics code
-- cannot make this distinction on its own without this backend change.
--
-- Fix: add one boolean output column, `is_new_connection`, populated via
-- `get diagnostics ... = row_count` immediately after the INSERT — standard,
-- core PostgreSQL/plpgsql behavior (ROW_COUNT is 1 when the INSERT actually
-- added a row, 0 when ON CONFLICT DO NOTHING skipped it), not a new database
-- object, not a new column on any table. `connected`/`nickname` keep their
-- exact original meaning and values — this is purely additive.
--
-- -----------------------------------------------------------------------------
-- DROP + CREATE, not CREATE OR REPLACE — confirmed against a real apply
-- attempt, not assumed
-- -----------------------------------------------------------------------------
-- `create or replace function` cannot change a function's OUT-parameter list
-- (`returns table(...)` defines exactly that), only its body — this is
-- standard, documented PostgreSQL behavior, not specific to this schema.
-- Confirmed by a real apply attempt against this project's production
-- database, which failed with `42P13: cannot change return type of existing
-- function`. So this migration DROPs the old 2-column create_friendship and
-- CREATEs the 3-column version in its place, in one statement block.
-- Verified safe to drop: create_friendship is called only via PostgREST RPC
-- from the client (lib/friends/friend-connection.ts) — never referenced by
-- any view/trigger/other function in this schema (RPC calls aren't a
-- pg_depend relationship at all; PostgREST resolves them by name/arg-types
-- at runtime, not through a SQL-level dependency), so there is nothing for
-- DROP to cascade into. `revoke`/`grant` are reissued below since dropping a
-- function drops its privilege grants along with it.
--
-- Idempotency: this whole block (DROP, if it exists, + CREATE) is safe to
-- re-run — `drop function if exists` tolerates a from-scratch database where
-- this function was never created at all.
-- =============================================================================

drop function if exists public.create_friendship(text);

create function public.create_friendship(p_friend_code text)
returns table(connected boolean, nickname text, is_new_connection boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_code            text;
  v_target          uuid;
  v_target_nickname text;
  v_a               uuid;
  v_b               uuid;
  v_row_count       integer;
begin
  if v_uid is null then
    raise exception 'create_friendship: no authenticated user' using errcode = '28000';
  end if;

  v_code := btrim(coalesce(p_friend_code, ''));
  if v_code = '' then
    raise exception 'create_friendship: invalid friend code' using errcode = 'P0001';
  end if;

  select p.id, p.nickname into v_target, v_target_nickname
  from public.profiles p
  where p.friend_code = v_code;

  if v_target is null then
    raise exception 'create_friendship: friend code not found' using errcode = 'P0001';
  end if;

  if v_target = v_uid then
    raise exception 'create_friendship: cannot friend yourself' using errcode = 'P0001';
  end if;

  if v_uid < v_target then
    v_a := v_uid;
    v_b := v_target;
  else
    v_a := v_target;
    v_b := v_uid;
  end if;

  insert into public.friendships (user_id_a, user_id_b)
  values (v_a, v_b)
  on conflict (user_id_a, user_id_b) do nothing;

  get diagnostics v_row_count = row_count;

  return query select true, v_target_nickname, (v_row_count > 0);
end;
$$;

comment on function public.create_friendship(text) is
  'Phase 3G-2 (Follow-up: reports is_new_connection) — SECURITY DEFINER. Resolves p_friend_code to its owning account, rejects an unknown code or a self-friend attempt, then inserts the canonicalized (user_id_a < user_id_b) friendships row (idempotent — already-friends is a no-op success, is_new_connection: false). Returns only connected/nickname/is_new_connection; the other party''s raw user_id is never part of the output.';

-- Grants must be reissued here — DROP FUNCTION removes any privilege grants
-- on the dropped object along with it (unlike CREATE OR REPLACE, which
-- preserves them). Same values as the original migration.
revoke all on function public.create_friendship(text) from public;
revoke all on function public.create_friendship(text) from anon;
grant execute on function public.create_friendship(text) to authenticated;

-- =============================================================================
-- End of Phase 3G-5 Follow-up.
-- =============================================================================
