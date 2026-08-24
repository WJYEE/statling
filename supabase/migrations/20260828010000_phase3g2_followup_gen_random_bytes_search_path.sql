-- =============================================================================
-- Statling — Phase 3G-2 Follow-up: fix gen_random_bytes search_path.
-- =============================================================================
-- Scope: 1 function redefinition only (get_or_create_my_friend_code). No
-- table/column/RLS/policy/grant change, no other function touched. Does NOT
-- edit the already-applied 20260828000000_phase3g2_friend_connection.sql —
-- that file is left exactly as it was applied; this is a pure follow-up.
--
-- -----------------------------------------------------------------------------
-- Bug found during live Security QA
-- -----------------------------------------------------------------------------
-- get_or_create_my_friend_code() failed on every call with:
--   "function gen_random_bytes(integer) does not exist" (SQLSTATE 42883)
--
-- Root cause: this project's Supabase instance installs pgcrypto's functions
-- into a separate `extensions` schema (Supabase's own default/documented
-- behavior for `create extension pgcrypto` on projects provisioned this way)
-- rather than `public`. `gen_random_uuid()` — already used throughout this
-- schema's other `uuid primary key default gen_random_uuid()` columns — is
-- unaffected by this because, on the Postgres version this project runs,
-- gen_random_uuid() is a core builtin (available since PG13), not a pgcrypto
-- function at all; it needed no extension schema in the first place.
-- gen_random_bytes() genuinely is pgcrypto-only, so this function's
-- `set search_path = public` (correct, deliberate hardening against
-- search_path hijacking — see the original migration's header) had the side
-- effect of also hiding pgcrypto's own functions from it.
--
-- Fix: add `extensions` to this one function's search_path
-- (`set search_path = public, extensions`) — the standard, Supabase-
-- documented resolution for a SECURITY DEFINER function that both needs a
-- locked-down search_path (hijack protection) and calls a pgcrypto function.
-- `public` still comes first, so this project's own public.* objects are
-- still resolved before anything else; `extensions` is appended purely to
-- make pgcrypto's functions reachable, not to widen what this function can
-- resolve to for anything it doesn't already explicitly schema-qualify
-- (every public.* reference in this function was already schema-qualified in
-- the original migration and remains so here — unchanged).
--
-- Idempotent: `create or replace function` is safe to re-run.
-- =============================================================================

create or replace function public.get_or_create_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'get_or_create_my_friend_code: no authenticated user' using errcode = '28000';
  end if;

  select p.friend_code into v_code from public.profiles p where p.id = v_uid;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := encode(gen_random_bytes(16), 'hex');

    begin
      update public.profiles
      set friend_code = v_code
      where id = v_uid and friend_code is null;

      if found then
        return v_code;
      end if;

      -- Someone else's concurrent call already set it — return that value.
      select p.friend_code into v_code from public.profiles p where p.id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
      -- v_code somehow still null (shouldn't happen) -> loop and retry.
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'get_or_create_my_friend_code: failed to generate a unique code after % attempts', v_attempt
          using errcode = 'P0001';
      end if;
      -- retry with a freshly generated token
    end;
  end loop;
end;
$$;

comment on function public.get_or_create_my_friend_code() is
  'Phase 3G-2 (Follow-up: search_path fixed to include extensions for gen_random_bytes) — SECURITY DEFINER. Returns the caller''s existing profiles.friend_code, or lazily generates+stores a new 128-bit random one on first call. Race-safe for concurrent calls by the same user; retries on the (astronomically unlikely) cross-user collision.';

-- Grants/revokes are unchanged from the original migration (still in effect,
-- CREATE OR REPLACE FUNCTION doesn't reset them) — repeated here only for
-- explicitness/idempotency, not because anything actually needs to change.
revoke all on function public.get_or_create_my_friend_code() from public;
revoke all on function public.get_or_create_my_friend_code() from anon;
grant execute on function public.get_or_create_my_friend_code() to authenticated;

-- =============================================================================
-- End of Phase 3G-2 Follow-up.
-- =============================================================================
