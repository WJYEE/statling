-- =============================================================================
-- Statling — Phase 3B-5 Follow-up: fix "column reference is ambiguous" bug.
-- =============================================================================
-- Scope: `create or replace function` on the exact same 2 functions
-- 20260825000000_phase3b5_overall_leaderboard_rpcs.sql created — no new
-- function, no new table/column/RLS/grant. That earlier migration is left
-- as-is (never rewritten) since it was already applied to remote; this is a
-- proper follow-up correction, the same pattern this project already uses
-- whenever an applied migration needs a fix (see the Phase 2D-6 Follow-up
-- migration for the same shape of change).
--
-- Bug: both functions declare `returns table(rank bigint, nickname text,
-- overall_score double precision)`, which implicitly creates 3 OUT
-- parameters (rank/nickname/overall_score) visible as plpgsql variables
-- through the entire function body. The original SQL's intermediate CTEs
-- (stat_averages/eligible/per_user_stat/overall/ranked) referenced bare,
-- unqualified `nickname`/`overall_score`/`rank` columns that share those
-- exact names — Postgres cannot tell whether such a reference means the OUT
-- parameter or the CTE column, and raises `42702 column reference "..." is
-- ambiguous`. This was caught by live QA (every call to either function
-- failed) before ever being reported as done — never worked in production.
--
-- Fix: every internal CTE now uses renamed working columns that cannot
-- collide with the 3 OUT parameter names (`nick` instead of `nickname`,
-- `score` instead of `overall_score`, `row_rank` instead of `rank`) — the
-- real output names (`rank`, `nickname`, `overall_score`) are only ever
-- produced once, as output aliases in each function's very last SELECT,
-- which is safe (an output alias defines a new column name, it is never
-- read back as a value inside the same query). No other logic changed:
-- same eligibility condition, same representative-record/season-filter
-- computation, same ordering/tiebreak, same SECURITY DEFINER/search_path/
-- grant structure as the original migration.
--
-- Idempotency: `create or replace function` is safe to re-run.
-- =============================================================================


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

  -- Every working column below is deliberately named to NEVER match this
  -- function's own OUT parameter names (rank/nickname/overall_score) — see
  -- this migration's header comment for why the original version broke.
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
      pr.nickname as nick,
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
      e.nick,
      e.tie_break_at,
      coalesce(sa.stat_avg, (e.initial_finals ->> si.stat_id)::double precision, 0) as stat_value
    from eligible e
    cross join stat_ids si
    left join stat_averages sa on sa.user_id = e.user_id and sa.stat_category = si.stat_id
  ),
  overall as (
    select user_id, nick, tie_break_at, avg(stat_value) as score
    from per_user_stat
    group by user_id, nick, tie_break_at
  ),
  ranked as (
    select
      row_number() over (order by score desc, tie_break_at asc, user_id asc) as row_rank,
      nick,
      score
    from overall
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.score as overall_score
  from ranked
  where ranked.row_rank <= v_limit;
end;
$$;

comment on function public.get_overall_leaderboard_top(integer) is
  'Phase 3B-5 (fixed by Follow-up) — SECURITY DEFINER. Returns the top p_limit (clamped to [1,100]) ranking-eligible (profiles.nickname set, confirmed pet) users by overall_score (average of the 6 current-stat values computeCurrentStats already shows on My Status), ranked over the FULL eligible population before limiting. Never returns user_id/email/timestamps/any other column.';

revoke all on function public.get_overall_leaderboard_top(integer) from public;
revoke all on function public.get_overall_leaderboard_top(integer) from anon;
grant execute on function public.get_overall_leaderboard_top(integer) to authenticated;


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
      pr.nickname as nick,
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
      e.nick,
      e.tie_break_at,
      coalesce(sa.stat_avg, (e.initial_finals ->> si.stat_id)::double precision, 0) as stat_value
    from eligible e
    cross join stat_ids si
    left join stat_averages sa on sa.user_id = e.user_id and sa.stat_category = si.stat_id
  ),
  overall as (
    select user_id, nick, tie_break_at, avg(stat_value) as score
    from per_user_stat
    group by user_id, nick, tie_break_at
  ),
  ranked as (
    select
      row_number() over (order by score desc, tie_break_at asc, user_id asc) as row_rank,
      user_id,
      nick,
      score
    from overall
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.score as overall_score
  from ranked
  where ranked.user_id = v_uid;
end;
$$;

comment on function public.get_my_overall_rank() is
  'Phase 3B-5 (fixed by Follow-up) — SECURITY DEFINER. Returns the caller''s own exact rank/nickname/overall_score using the identical ordering get_overall_leaderboard_top uses, whether or not the caller is inside the top 100. Zero rows (never an exception) when not signed in, nickname is unset, or no confirmed pet exists yet.';

revoke all on function public.get_my_overall_rank() from public;
revoke all on function public.get_my_overall_rank() from anon;
grant execute on function public.get_my_overall_rank() to authenticated;
