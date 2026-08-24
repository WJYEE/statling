-- =============================================================================
-- Statling — Phase 3G-3: Friend Ranking backend RPCs.
-- =============================================================================
-- Scope: 3 new SECURITY DEFINER RPCs (get_friend_overall_ranking,
-- get_friend_xp_ranking, get_friend_game_ranking) + their grants only. No
-- table/column/RLS-policy change anywhere. Does not touch
-- get_overall_leaderboard_top / get_my_overall_rank / get_xp_leaderboard_top
-- / get_my_xp_rank / get_game_leaderboard_top / get_my_game_rank (Phase
-- 3B-3/3B-5/3B-7) or the Phase 3G-2 friend-connection functions/table at
-- all — every one of those keeps working exactly as before.
--
-- -----------------------------------------------------------------------------
-- What this is — read before changing anything below
-- -----------------------------------------------------------------------------
-- NOT a new scoring system. Each function below is the SAME formula,
-- eligibility condition, and ordering/tie-break as its corresponding global
-- ranking RPC (get_overall_leaderboard_top / get_xp_leaderboard_top /
-- get_game_leaderboard_top — all from Phase 3B), copied verbatim, with
-- exactly one thing added: a `scope` CTE that restricts the population to
-- "auth.uid() + everyone auth.uid() has a friendships row with" instead of
-- "everyone ranking-eligible." See the Phase 3G-3 report for the line-by-line
-- comparison against each source RPC.
--
-- Unlike the global Top-100 RPCs, there is deliberately no separate
-- "top N" + "my rank" pair here and no p_limit — a friend population is
-- always small (bounded by how many friendships one account has), so one
-- function per ranking type returns the caller + every friend, already fully
-- ranked among just that set, in one call.
--
-- -----------------------------------------------------------------------------
-- Friend scope — derived, never parameterized (read this before changing
-- anything below)
-- -----------------------------------------------------------------------------
-- Every function below computes its own `scope` CTE strictly from
-- `auth.uid()` joined against public.friendships — none of them accept a
-- friend_code, a user id, or any kind of "who to include" parameter.
-- get_friend_game_ranking's only parameters (p_game_id/p_difficulty) select
-- WHICH leaderboard, never WHO appears in it. This is a deliberate security
-- property, not an oversight: user A knowing user C's friend_code (e.g. C
-- posted their own invite link somewhere A saw it, without ever becoming
-- A's friend) must never let A see C's ranking data through these
-- functions — and it can't, because C simply never appears in A's own
-- `scope` CTE unless a friendships row between A and C actually exists.
--
-- -----------------------------------------------------------------------------
-- friend_code in the output — re-verified, not just carried over
-- -----------------------------------------------------------------------------
-- Every row returned by these 3 functions (aside from possibly the caller's
-- own) describes someone the caller is ALREADY a confirmed mutual friend of
-- — guaranteed by the scope CTE above. Returning that person's friend_code
-- here is not a new exposure: it is the same code that person already chose
-- to share with the caller in order to become friends in the first place
-- (Phase 3G-2's create_friendship flow). It exists in this output purely so
-- a future minimal "친구 삭제" action (Phase 3G-4) can identify who to call
-- remove_friendship(p_friend_code) on without this project ever needing to
-- return a raw user_id anywhere. No other profiles column (email, auth
-- metadata, pets/activity/mission data, timestamps) is exposed by any
-- function below — output columns are hard-limited to exactly
-- rank/nickname/friend_code/<the ranking's own metric column(s)>/is_me.
--
-- `is_me` (a plain boolean, `<scope row's user_id> = auth.uid()`) is safe to
-- return here specifically because it is computed only against the caller's
-- own id, never against or alongside another party's raw id — unlike the
-- global ranking RPCs (which cannot safely support "isMe" at all, since
-- duplicate nicknames make client-side nickname-matching unsafe — see
-- xp-leaderboard.ts's own doc comment), a friend-scoped result set is small
-- and every row's identity is already known to the caller by nickname/
-- friend_code, so this one boolean is the only "which row is me" signal
-- needed and leaks nothing beyond that.
--
-- -----------------------------------------------------------------------------
-- OUT-parameter name collision — avoided by construction (see the Phase
-- 3B-5 Follow-up migration for why this matters)
-- -----------------------------------------------------------------------------
-- `returns table(rank, nickname, friend_code, ...)` implicitly creates OUT
-- parameters with those exact names, visible as plpgsql variables through
-- the whole function body — Phase 3B-5's original get_overall_leaderboard_top
-- broke in production (42702 "column reference is ambiguous") the first time
-- an internal CTE used a bare `nickname`/`overall_score`/`rank` column that
-- collided with one. Every function below was written avoiding that from the
-- start: internal CTEs use renamed working columns (nick/code/score/xp/
-- metric_val/tiebreak_val/row_rank/me_flag) that can never collide with this
-- function's own OUT parameter names; the real output names are only ever
-- produced once, as output aliases in each function's very last SELECT.
--
-- -----------------------------------------------------------------------------
-- Security model — identical hardening to every prior ranking/friend RPC
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER (reading other users' xp_totals/player_skill_records/
-- pets/profiles.nickname/profiles.friend_code needs it, RLS legitimately
-- blocks a plain authenticated caller otherwise), `set search_path = public`,
-- every table reference schema-qualified, no dynamic SQL anywhere
-- (p_game_id/p_difficulty are only ever compared with `=`/`in`/`case`, never
-- concatenated into SQL text), `language plpgsql stable` (read-only),
-- `revoke all ... from public` + explicit `revoke all ... from anon`, then
-- `grant execute ... to authenticated` only.
--
-- Idempotency: `create or replace function` is safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. get_friend_overall_ranking — same formula as get_overall_leaderboard_top
--    (Phase 3B-5 / Follow-up), scoped to caller + friends.
-- -----------------------------------------------------------------------------
create or replace function public.get_friend_overall_ranking()
returns table(rank bigint, nickname text, friend_code text, overall_score double precision, is_me boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  with scope as (
    select v_uid as uid
    union
    select case when f.user_id_a = v_uid then f.user_id_b else f.user_id_a end
    from public.friendships f
    where f.user_id_a = v_uid or f.user_id_b = v_uid
  ),
  representative as (
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
        and user_id in (select uid from scope)
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
      pr.id as uid,
      pr.nickname as nick,
      pr.friend_code as code,
      pt.initial_finals,
      coalesce(pt.confirmed_at, pt.created_at) as tie_break_at
    from public.profiles pr
    join public.pets pt on pt.user_id = pr.id and pt.confirmed = true
    where pr.nickname is not null and btrim(pr.nickname) <> ''
      and pr.id in (select uid from scope)
  ),
  stat_ids as (
    select unnest(array['reaction', 'memory', 'focus', 'judgment', 'spatial', 'reasoning']) as stat_id
  ),
  per_user_stat as (
    select
      e.uid,
      e.nick,
      e.code,
      e.tie_break_at,
      coalesce(sa.stat_avg, (e.initial_finals ->> si.stat_id)::double precision, 0) as stat_value
    from eligible e
    cross join stat_ids si
    left join stat_averages sa on sa.user_id = e.uid and sa.stat_category = si.stat_id
  ),
  overall as (
    select uid, nick, code, tie_break_at, avg(stat_value) as score
    from per_user_stat
    group by uid, nick, code, tie_break_at
  ),
  ranked as (
    select
      row_number() over (order by score desc, tie_break_at asc, uid asc) as row_rank,
      nick,
      code,
      score,
      (uid = v_uid) as me_flag
    from overall
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.code as friend_code, ranked.score as overall_score, ranked.me_flag as is_me
  from ranked
  order by ranked.row_rank;
end;
$$;

comment on function public.get_friend_overall_ranking() is
  'Phase 3G-3 — SECURITY DEFINER. Same formula/eligibility/tie-break as get_overall_leaderboard_top, scoped to the caller + their confirmed friendships only (never parameterized). Never returns a raw user_id.';

revoke all on function public.get_friend_overall_ranking() from public;
revoke all on function public.get_friend_overall_ranking() from anon;
grant execute on function public.get_friend_overall_ranking() to authenticated;


-- -----------------------------------------------------------------------------
-- 2. get_friend_xp_ranking — same formula as get_xp_leaderboard_top
--    (Phase 3B-3), scoped to caller + friends.
-- -----------------------------------------------------------------------------
create or replace function public.get_friend_xp_ranking()
returns table(rank bigint, nickname text, friend_code text, total_xp integer, is_me boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  with scope as (
    select v_uid as uid
    union
    select case when f.user_id_a = v_uid then f.user_id_b else f.user_id_a end
    from public.friendships f
    where f.user_id_a = v_uid or f.user_id_b = v_uid
  ),
  ranked as (
    select
      row_number() over (order by x.total_xp desc, x.updated_at asc, x.user_id asc) as row_rank,
      p.nickname as nick,
      p.friend_code as code,
      x.total_xp as xp,
      (x.user_id = v_uid) as me_flag
    from public.xp_totals x
    join public.profiles p on p.id = x.user_id
    where p.nickname is not null and btrim(p.nickname) <> ''
      and x.user_id in (select uid from scope)
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.code as friend_code, ranked.xp as total_xp, ranked.me_flag as is_me
  from ranked
  order by ranked.row_rank;
end;
$$;

comment on function public.get_friend_xp_ranking() is
  'Phase 3G-3 — SECURITY DEFINER. Same formula/eligibility/tie-break as get_xp_leaderboard_top, scoped to the caller + their confirmed friendships only (never parameterized). Never returns a raw user_id.';

revoke all on function public.get_friend_xp_ranking() from public;
revoke all on function public.get_friend_xp_ranking() from anon;
grant execute on function public.get_friend_xp_ranking() to authenticated;


-- -----------------------------------------------------------------------------
-- 3. get_friend_game_ranking — same formula as get_game_leaderboard_top
--    (Phase 3B-7), scoped to caller + friends. p_game_id/p_difficulty select
--    WHICH leaderboard, never WHO appears in it (see this migration's own
--    "Friend scope" header section).
-- -----------------------------------------------------------------------------
create or replace function public.get_friend_game_ranking(
  p_game_id text,
  p_difficulty text
)
returns table(rank bigint, nickname text, friend_code text, record_value double precision, tiebreak_value double precision, is_me boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_metric_key   text;
  v_direction    text;
  v_tiebreak_key text;
begin
  if v_uid is null then
    return;
  end if;

  if p_difficulty is null or p_difficulty not in ('hard', 'extreme') then
    return;
  end if;

  -- Identical CASE/eligibility transcription to get_game_leaderboard_top
  -- (Phase 3B-7) — see that migration's own header for why these exact
  -- metric/direction/tiebreak values, never re-derived here.
  case p_game_id
    when 'reaction-classic' then
      v_metric_key := 'medianReactionMs'; v_direction := 'asc'; v_tiebreak_key := 'consistency';
    when 'reaction-dodge-run' then
      if p_difficulty = 'hard' then
        v_metric_key := 'obstaclesDodged'; v_direction := 'desc'; v_tiebreak_key := 'collisions';
      else
        v_metric_key := 'survivedMs'; v_direction := 'desc'; v_tiebreak_key := 'obstaclesDodged';
      end if;
    when 'memory-classic' then
      v_metric_key := 'weightedAccuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageAdjustedResponseTimeMs';
    when 'memory-story-recall' then
      v_metric_key := 'accuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    when 'focus-classic' then
      v_metric_key := 'weightedAccuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    when 'focus-color-target' then
      v_metric_key := 'accuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageReactionTimeMs';
    when 'judgment-classic' then
      v_metric_key := 'overallAccuracy'; v_direction := 'desc'; v_tiebreak_key := 'switchAccuracy';
    when 'decision-best-choice' then
      v_metric_key := 'accuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    when 'spatial-classic' then
      v_metric_key := 'difficultyWeightedAccuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    when 'spatial-fit-puzzle' then
      v_metric_key := 'totalCompletionMs'; v_direction := 'asc'; v_tiebreak_key := 'misplacements';
    when 'reasoning-classic' then
      v_metric_key := 'difficultyWeightedAccuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    when 'reasoning-number-pattern' then
      v_metric_key := 'accuracy'; v_direction := 'desc'; v_tiebreak_key := 'averageResponseTimeMs';
    else
      return; -- unregistered game_id -> empty, not an error
  end case;

  return query
  with scope as (
    select v_uid as uid
    union
    select case when f.user_id_a = v_uid then f.user_id_b else f.user_id_a end
    from public.friendships f
    where f.user_id_a = v_uid or f.user_id_b = v_uid
  ),
  eligible as (
    select
      psr.user_id as uid,
      pr.nickname as nick,
      pr.friend_code as code,
      (psr.metrics ->> v_metric_key)::double precision as metric_val,
      case when psr.metrics ? v_tiebreak_key then (psr.metrics ->> v_tiebreak_key)::double precision end as tiebreak_val,
      psr.completed_at
    from public.player_skill_records psr
    join public.profiles pr on pr.id = psr.user_id
    where psr.game_id = p_game_id
      and psr.difficulty = p_difficulty
      and psr.record_version = 2
      and psr.metrics is not null
      and psr.metrics ? v_metric_key
      and pr.nickname is not null and btrim(pr.nickname) <> ''
      and psr.user_id in (select uid from scope)
  ),
  ranked as (
    select
      row_number() over (
        order by
          (case when v_direction = 'asc' then metric_val else -metric_val end) asc,
          completed_at asc,
          uid asc
      ) as row_rank,
      nick,
      code,
      metric_val,
      tiebreak_val,
      (uid = v_uid) as me_flag
    from eligible
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.code as friend_code, ranked.metric_val as record_value, ranked.tiebreak_val as tiebreak_value, ranked.me_flag as is_me
  from ranked
  order by ranked.row_rank;
end;
$$;

comment on function public.get_friend_game_ranking(text, text) is
  'Phase 3G-3 — SECURITY DEFINER. Same raw-metric formula/direction/eligibility/tie-break as get_game_leaderboard_top for one game_id+difficulty (hard/extreme only), scoped to the caller + their confirmed friendships only (never parameterized by who to include). Never returns a raw user_id.';

revoke all on function public.get_friend_game_ranking(text, text) from public;
revoke all on function public.get_friend_game_ranking(text, text) from anon;
grant execute on function public.get_friend_game_ranking(text, text) to authenticated;

-- =============================================================================
-- End of Phase 3G-3. No Ranking UI ships in this migration — see the Phase
-- 3G-3 report for the [전체|친구] scope-selector UI, which is a code-only
-- (no schema) change shipped alongside this migration.
-- =============================================================================
