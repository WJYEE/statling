-- =============================================================================
-- Statling — Phase 3B-5: real Overall Ranking backend RPCs.
-- =============================================================================
-- Scope: 2 new functions + their grants only. No table/column/RLS-policy
-- changes anywhere — profiles_select_own / player_skill_records_select_own /
-- pets_select_own (all `auth.uid() = <owner column>`, supabase/migrations/
-- 20260819000000_phase1_schema_and_rls.sql) are reused exactly as they
-- already are; a normal authenticated client still cannot SELECT another
-- user's profiles/player_skill_records/pets row directly through PostgREST,
-- only through these 2 curated functions.
--
-- -----------------------------------------------------------------------------
-- What "overall_score" actually is — read before changing anything below.
-- -----------------------------------------------------------------------------
-- Deliberately NOT a new, invented ranking metric. It replicates, in SQL, the
-- exact same "현재 스탯" value My Status already shows every player
-- (lib/game/player-skill-storage.ts#computeCurrentStats), averaged across
-- the 6 abilities:
--   1. For each (user, game), the REPRESENTATIVE record is whichever
--      Normal/Hard/Extreme row is at the HIGHEST DIFFICULTY TIER ATTEMPTED
--      (never the highest-scoring one, and Easy is always excluded) — spec
--      §18's rule, so a game played 50 times still counts exactly once and
--      grinding can't inflate a category.
--   2. A stat category's current value is the AVERAGE of its registered
--      games' representative normalized_score (0-100).
--   3. A stat category with zero Normal+ records yet falls back to
--      pets.initial_finals (the Intro diagnostic) for that stat — real data,
--      never a fake 0 — same fallback computeCurrentStats itself uses.
--   4. overall_score = the plain average of those 6 per-stat values.
-- Summing instead of averaging the 6 stats would produce an identical
-- ranking order (a constant ×6 scale on every user), so averaging was kept
-- purely because it stays on the same familiar 0-100 scale as every other
-- stat number the app already shows.
--
-- One deliberate difference from computeCurrentStats itself: representative
-- records are filtered to `record_version = 2` (CURRENT_RANKING_SEASON —
-- lib/ranking/ranking-season.ts), which computeCurrentStats does NOT apply
-- (My Status is a personal-history view, not a competitive one). The
-- existing mock lib/ranking/ranking-provider.ts#getOverallRanking already
-- applies this same season filter for exactly this reason — a leaderboard
-- comparing users against each other should not let a record set under old,
-- no-longer-comparable game rules win against one set under current rules.
-- This ranking RPC follows that same established ranking-fairness
-- precedent, not My Status's personal-history one.
--
-- -----------------------------------------------------------------------------
-- Security model
-- -----------------------------------------------------------------------------
-- Both functions are SECURITY DEFINER, the same deliberate, narrow exception
-- Phase 3B-3's get_xp_leaderboard_top/get_my_xp_rank already established (see
-- that migration's own "Security model" comment for the full INVOKER-vs-
-- DEFINER reasoning) — reading other users' pets.initial_finals/
-- player_skill_records/profiles.nickname needs it, RLS legitimately blocks a
-- plain authenticated caller otherwise. Hardening, identical to Phase 3B-3:
--   - `set search_path = public` + every table reference schema-qualified
--     (public.profiles / public.pets / public.player_skill_records) —
--     search_path-hijack protection, doubled up.
--   - no dynamic SQL anywhere (no EXECUTE/format()); p_limit is only ever
--     used as a plain integer through greatest()/least().
--   - `language plpgsql stable` — read-only.
--   - `revoke all ... from public` + explicit `revoke all ... from anon`,
--     then `grant execute ... to authenticated` only.
-- Output columns are hard-limited to rank/nickname/overall_score — no
-- user_id, no email, no auth metadata, no pet/statling details, no
-- individual game records, no activity counters, no timestamps.
--
-- Ranking participation (both functions): profiles.nickname is not null AND
-- btrim(nickname) <> '' (identical condition to Phase 3B-3's XP ranking —
-- one shared nickname gate, not a per-ranking-type flag) AND the user has a
-- confirmed pets row (pets.confirmed = true) — without one there is no
-- initial_finals baseline to fall back on, so there is nothing meaningful to
-- rank.
--
-- Ordering (both functions, identical): overall_score desc,
-- COALESCE(pets.confirmed_at, pets.created_at) asc, user_id asc. XP ranking's
-- tiebreak uses "earliest to reach this XP total" (xp_totals.updated_at) —
-- there is no equivalent single timestamp here (overall_score is an average
-- recomputed from up to 12 representative records that can each change
-- independently), so confirmed_at (immutable once set, always present via
-- the created_at fallback) was chosen as the safest deterministic secondary
-- key instead, in the same "earlier profile wins a tie" spirit.
--
-- Idempotency: `create or replace function` is safe to re-run.
--
-- Performance: no new index added. player_skill_records' own PRIMARY KEY is
-- (user_id, game_id, difficulty) — already exactly the access pattern the
-- representative-record window function scans/partitions by, so this query
-- is already index-backed without anything new. Current real participant
-- count is small (tens of accounts); revisit only if Supabase's own
-- slow-query view flags this once the user base grows meaningfully.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. get_overall_leaderboard_top — Top N (default/max 100) ranking-eligible
--    users by overall_score.
-- -----------------------------------------------------------------------------
create or replace function public.get_overall_leaderboard_top(p_limit integer default 100)
returns table(rank bigint, nickname text, overall_score double precision)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  if auth.uid() is null then
    raise exception 'get_overall_leaderboard_top: no authenticated user' using errcode = '28000';
  end if;

  return query
  with representative as (
    select user_id, stat_category, normalized_score
    from (
      select
        user_id,
        stat_category,
        normalized_score,
        row_number() over (
          partition by user_id, game_id
          order by case difficulty
            when 'extreme' then 4
            when 'hard' then 3
            when 'normal' then 2
            else 1
          end desc
        ) as tier_rank
      from public.player_skill_records
      where difficulty <> 'easy' and record_version = 2
    ) ranked_by_tier
    where tier_rank = 1
  ),
  stat_averages as (
    select user_id, stat_category, avg(normalized_score) as stat_avg
    from representative
    group by user_id, stat_category
  ),
  eligible as (
    select
      pr.id as user_id,
      pr.nickname,
      pt.initial_finals,
      coalesce(pt.confirmed_at, pt.created_at) as tie_break_at
    from public.profiles pr
    join public.pets pt on pt.user_id = pr.id and pt.confirmed = true
    where pr.nickname is not null and btrim(pr.nickname) <> ''
  ),
  stat_ids as (
    select unnest(array['reaction', 'memory', 'focus', 'judgment', 'spatial', 'reasoning']) as stat_id
  ),
  per_user_stat as (
    select
      e.user_id,
      e.nickname,
      e.tie_break_at,
      coalesce(sa.stat_avg, (e.initial_finals ->> si.stat_id)::double precision, 0) as stat_value
    from eligible e
    cross join stat_ids si
    left join stat_averages sa on sa.user_id = e.user_id and sa.stat_category = si.stat_id
  ),
  overall as (
    select user_id, nickname, tie_break_at, avg(stat_value) as overall_score
    from per_user_stat
    group by user_id, nickname, tie_break_at
  ),
  ranked as (
    select
      row_number() over (order by overall_score desc, tie_break_at asc, user_id asc) as rank,
      nickname,
      overall_score
    from overall
  )
  select ranked.rank, ranked.nickname, ranked.overall_score
  from ranked
  where ranked.rank <= v_limit;
end;
$$;

comment on function public.get_overall_leaderboard_top(integer) is
  'Phase 3B-5 — SECURITY DEFINER. Returns the top p_limit (clamped to [1,100]) ranking-eligible (profiles.nickname set, confirmed pet) users by overall_score (average of the 6 current-stat values computeCurrentStats already shows on My Status), ranked over the FULL eligible population before limiting. Never returns user_id/email/timestamps/any other column.';

revoke all on function public.get_overall_leaderboard_top(integer) from public;
revoke all on function public.get_overall_leaderboard_top(integer) from anon;
grant execute on function public.get_overall_leaderboard_top(integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. get_my_overall_rank — the calling user's own exact rank, whether or not
--    it's inside the Top 100.
-- -----------------------------------------------------------------------------
-- Deliberately never raises for "not signed in" / "no nickname yet" / "no
-- confirmed pet yet" — every one of those simply returns zero rows, matching
-- get_my_xp_rank's own "uniform no-row, never an exception" contract.
create or replace function public.get_my_overall_rank()
returns table(rank bigint, nickname text, overall_score double precision)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return; -- not signed in — zero rows, not an exception
  end if;

  return query
  with representative as (
    select user_id, stat_category, normalized_score
    from (
      select
        user_id,
        stat_category,
        normalized_score,
        row_number() over (
          partition by user_id, game_id
          order by case difficulty
            when 'extreme' then 4
            when 'hard' then 3
            when 'normal' then 2
            else 1
          end desc
        ) as tier_rank
      from public.player_skill_records
      where difficulty <> 'easy' and record_version = 2
    ) ranked_by_tier
    where tier_rank = 1
  ),
  stat_averages as (
    select user_id, stat_category, avg(normalized_score) as stat_avg
    from representative
    group by user_id, stat_category
  ),
  eligible as (
    select
      pr.id as user_id,
      pr.nickname,
      pt.initial_finals,
      coalesce(pt.confirmed_at, pt.created_at) as tie_break_at
    from public.profiles pr
    join public.pets pt on pt.user_id = pr.id and pt.confirmed = true
    where pr.nickname is not null and btrim(pr.nickname) <> ''
  ),
  stat_ids as (
    select unnest(array['reaction', 'memory', 'focus', 'judgment', 'spatial', 'reasoning']) as stat_id
  ),
  per_user_stat as (
    select
      e.user_id,
      e.nickname,
      e.tie_break_at,
      coalesce(sa.stat_avg, (e.initial_finals ->> si.stat_id)::double precision, 0) as stat_value
    from eligible e
    cross join stat_ids si
    left join stat_averages sa on sa.user_id = e.user_id and sa.stat_category = si.stat_id
  ),
  overall as (
    select user_id, nickname, tie_break_at, avg(stat_value) as overall_score
    from per_user_stat
    group by user_id, nickname, tie_break_at
  ),
  ranked as (
    select
      row_number() over (order by overall_score desc, tie_break_at asc, user_id asc) as rank,
      user_id,
      nickname,
      overall_score
    from overall
  )
  select ranked.rank, ranked.nickname, ranked.overall_score
  from ranked
  where ranked.user_id = v_uid;
end;
$$;

comment on function public.get_my_overall_rank() is
  'Phase 3B-5 — SECURITY DEFINER. Returns the caller''s own exact rank/nickname/overall_score using the identical ordering get_overall_leaderboard_top uses, whether or not the caller is inside the top 100. Zero rows (never an exception) when not signed in, nickname is unset, or no confirmed pet exists yet.';

revoke all on function public.get_my_overall_rank() from public;
revoke all on function public.get_my_overall_rank() from anon;
grant execute on function public.get_my_overall_rank() to authenticated;
