-- =============================================================================
-- Statling — Phase 3B-3: real XP leaderboard backend RPCs.
-- =============================================================================
-- Scope: 2 new functions + their grants only. No table/column/RLS-policy
-- changes anywhere — xp_totals_select_own / profiles_select_own (both
-- `auth.uid() = <owner column>`, supabase/migrations/20260819000000_phase1_
-- schema_and_rls.sql) are reused exactly as they already are; a normal
-- authenticated client still cannot SELECT another user's xp_totals/profiles
-- row directly through PostgREST, only through these 2 curated functions.
--
-- -----------------------------------------------------------------------------
-- Security model — read before changing anything below.
-- -----------------------------------------------------------------------------
-- Both functions are SECURITY DEFINER — the one deliberate exception to this
-- project's SECURITY INVOKER default (see supabase/migrations/
-- 20260820000000_phase2b_replace_rpcs.sql's own "Security model" comment for
-- why INVOKER was chosen there). INVOKER cannot work here: ranking must read
-- OTHER users' xp_totals.total_xp and profiles.nickname, and RLS legitimately
-- blocks that for a plain authenticated caller. DEFINER is the narrowest way
-- to grant exactly that one cross-user read, entirely inside a function whose
-- OUTPUT columns are hard-limited to rank/nickname/total_xp — email, auth
-- metadata, pet data, game records, activity counters, timestamps, and the
-- other user's raw user_id are never part of the return shape, so there is
-- no column a bug here could accidentally leak beyond what's declared.
--
-- Hardening applied to both functions (checked against the actual grants/
-- policies below, not assumed):
--   - `set search_path = public` — prevents a search_path-hijack attack (a
--     malicious same-named object in another schema shadowing public.xp_totals
--     /public.profiles) from ever being reachable, since DEFINER functions
--     run with the function OWNER's privileges, not the caller's.
--   - every table reference is written schema-qualified (`public.xp_totals`,
--     `public.profiles`) as well, so correctness never depends on
--     search_path alone.
--   - no dynamic SQL anywhere (no EXECUTE/format()) — p_limit is used only
--     as a plain integer through greatest()/least(), never concatenated into
--     a SQL string, so there is no injection surface at all.
--   - `language plpgsql stable` — read-only, no writes, safe for the planner
--     to treat as not modifying the database.
--   - `revoke all ... from public` + explicit `revoke all ... from anon`,
--     then `grant execute ... to authenticated` only — Postgres grants
--     EXECUTE to PUBLIC by default on function creation, so the explicit
--     revoke is required, not optional; anon is revoked a second time
--     explicitly (technically redundant once PUBLIC is revoked, since anon
--     never had its own separate grant) purely so the intent — no anonymous
--     access to this leaderboard yet — is unambiguous on read.
--
-- Ranking participation (both functions): profiles.nickname is not null AND
-- btrim(nickname) <> '' — a user who has never set a nickname (Phase 3B-2)
-- simply never appears in either function's output, no separate opt-in flag.
--
-- Ordering (both functions, identical, so Top 100 and "my rank" can never
-- disagree about anyone's position): total_xp desc, updated_at asc (earlier
-- arrival at a tied XP total ranks higher), user_id asc (final fully
-- deterministic tiebreak). row_number() is computed over the FULL eligible
-- population first, in a subquery — never after a LIMIT — so a Top 100 row's
-- `rank` is always its true rank among every participant, not just among the
-- first 100 read.
--
-- Idempotency: `create or replace function` is safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. get_xp_leaderboard_top — Top N (default/max 100) ranking-eligible users.
-- -----------------------------------------------------------------------------
-- p_limit is clamped server-side to [1, 100] regardless of what the client
-- sends (a null, a 0/negative value, or 100000 are all safe) — a caller can
-- never force more than 100 rows out of this function.
create or replace function public.get_xp_leaderboard_top(p_limit integer default 100)
returns table(rank bigint, nickname text, total_xp integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  if auth.uid() is null then
    raise exception 'get_xp_leaderboard_top: no authenticated user' using errcode = '28000';
  end if;

  return query
  select ranked.rank, ranked.nickname, ranked.total_xp
  from (
    select
      row_number() over (
        order by x.total_xp desc, x.updated_at asc, x.user_id asc
      ) as rank,
      p.nickname,
      x.total_xp
    from public.xp_totals x
    join public.profiles p on p.id = x.user_id
    where p.nickname is not null and btrim(p.nickname) <> ''
  ) ranked
  where ranked.rank <= v_limit;
end;
$$;

comment on function public.get_xp_leaderboard_top(integer) is
  'Phase 3B-3 — SECURITY DEFINER. Returns the top p_limit (clamped to [1,100]) ranking-eligible (profiles.nickname set) users by total_xp, ranked over the FULL eligible population before limiting. Never returns user_id/email/timestamps/any other column.';

revoke all on function public.get_xp_leaderboard_top(integer) from public;
revoke all on function public.get_xp_leaderboard_top(integer) from anon;
grant execute on function public.get_xp_leaderboard_top(integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. get_my_xp_rank — the calling user's own exact rank, whether or not it's
--    inside the Top 100.
-- -----------------------------------------------------------------------------
-- Deliberately never raises for "not signed in" / "no nickname yet" / "no
-- xp_totals row yet" — every one of those simply returns zero rows, so the
-- client can treat "no row back" as one uniform, unexceptional case rather
-- than parsing 3 different error conditions.
create or replace function public.get_my_xp_rank()
returns table(rank bigint, nickname text, total_xp integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return; -- not signed in — zero rows, not an exception (see doc comment above)
  end if;

  return query
  select ranked.rank, ranked.nickname, ranked.total_xp
  from (
    select
      row_number() over (
        order by x.total_xp desc, x.updated_at asc, x.user_id asc
      ) as rank,
      x.user_id,
      p.nickname,
      x.total_xp
    from public.xp_totals x
    join public.profiles p on p.id = x.user_id
    where p.nickname is not null and btrim(p.nickname) <> ''
  ) ranked
  where ranked.user_id = v_uid;
  -- No matching row (no nickname yet, or no xp_totals row yet) -> the query
  -- above naturally returns zero rows; still not an exception.
end;
$$;

comment on function public.get_my_xp_rank() is
  'Phase 3B-3 — SECURITY DEFINER. Returns the caller''s own exact rank/nickname/total_xp using the identical ordering get_xp_leaderboard_top uses, whether or not the caller is inside the top 100. Zero rows (never an exception) when not signed in, nickname is unset, or no xp_totals row exists yet.';

revoke all on function public.get_my_xp_rank() from public;
revoke all on function public.get_my_xp_rank() from anon;
grant execute on function public.get_my_xp_rank() to authenticated;
