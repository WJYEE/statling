-- =============================================================================
-- Statling — Phase 3B-7: real Per-Game Ranking backend RPCs.
-- =============================================================================
-- Scope: 2 new functions + their grants only. No table/column/RLS-policy
-- changes anywhere — player_skill_records_select_own / profiles_select_own
-- (both `auth.uid() = <owner column>`, supabase/migrations/20260819000000_
-- phase1_schema_and_rls.sql) are reused exactly as they already are; a
-- normal authenticated client still cannot SELECT another user's
-- player_skill_records/profiles row directly through PostgREST, only
-- through these 2 curated functions.
--
-- -----------------------------------------------------------------------------
-- What this ranks by — read before changing anything below.
-- -----------------------------------------------------------------------------
-- NOT normalizedScore (that's the Stat/Overall-ranking value — Phase 3B-5).
-- Per-game ranking uses each game's own real raw metric, exactly as already
-- defined client-side in lib/ranking/game-ranking-metrics.config.ts's
-- GAME_RANKING_METRICS (e.g. reaction-classic ranks by medianReactionMs ms,
-- ascending; memory-classic ranks by weightedAccuracy, descending). The CASE
-- statement below is a direct SQL transcription of that exact config — same
-- metric keys (read from player_skill_records.metrics, the same flat bag
-- MiniGamePerformanceRecord.metrics already populates), same directions, same
-- per-difficulty override for reaction-dodge-run (Hard ranks by
-- obstaclesDodged desc, Extreme by survivedMs desc — the two tiers measure
-- different things for that one game). No new scoring formula invented.
--
-- Per-user "best record": player_skill_records' PRIMARY KEY is already
-- (user_id, game_id, difficulty) — the client only ever keeps one row per
-- combo, replacing it via lib/game/player-skill-storage.ts#recordMiniGameCompletion's
-- own isBetterByGameScore (normalizedScore-based) check. This RPC does not
-- re-derive "best by raw metric" with a new aggregation — it reads that one
-- stored row's raw metric value as-is, reusing the existing best-record
-- semantics exactly as instructed.
--
-- -----------------------------------------------------------------------------
-- Security model
-- -----------------------------------------------------------------------------
-- Both functions are SECURITY DEFINER, the same deliberate, narrow exception
-- Phase 3B-3/3B-5 already established — reading other users'
-- player_skill_records/profiles.nickname needs it, RLS legitimately blocks a
-- plain authenticated caller otherwise. Hardening, identical to Phase 3B-3/
-- 3B-5: `set search_path = public` + every table reference schema-qualified,
-- no dynamic SQL (p_game_id/p_difficulty are only ever compared with `=`/`in`,
-- never concatenated into SQL text), `language plpgsql stable`, `revoke all
-- ... from public` + explicit `revoke all ... from anon`, then `grant
-- execute ... to authenticated` only. Output columns are hard-limited to
-- rank/nickname/record_value/tiebreak_value — no user_id, no email, no auth
-- metadata, no full raw_record JSON, no other pet/activity/mission data, no
-- timestamps. game_id/difficulty are never returned (the caller already
-- knows them — they're the parameters that picked this leaderboard).
--
-- p_difficulty is restricted to 'hard'/'extreme' (checked with a plain `not
-- in`, no dynamic SQL) — Easy/Normal or any other string safely returns zero
-- rows, never an exception, from get_game_leaderboard_top; get_my_game_rank
-- never raises for ANY input shape at all (see its own comment). An
-- unregistered p_game_id (not one of the 12 keys below) also safely returns
-- zero rows rather than erroring.
--
-- Ranking participation (both functions): profiles.nickname is not null AND
-- btrim(nickname) <> '' (identical condition to Phase 3B-3/3B-5 — one shared
-- nickname gate) AND the user has a player_skill_records row for exactly
-- this (game_id, difficulty) AND that row's record_version = 2
-- (CURRENT_RANKING_SEASON — lib/ranking/ranking-season.ts, same value the
-- existing mock lib/ranking/ranking-provider.ts#getGameRanking already
-- filters by). A user who never played this exact game at this exact tier
-- (or only has a stale pre-season record) simply doesn't appear.
--
-- Ordering (both functions, identical): the game's own primary metric in its
-- correct direction, then completed_at asc, then user_id asc. Implemented as
-- `order by (case when v_direction = 'asc' then metric_val else -metric_val
-- end) asc, ...` — negating a 'desc' metric lets one fixed ASC ordering
-- serve both directions without dynamic SQL. Hard and Extreme are always
-- fully separate queries (p_difficulty is a hard equality filter, never
-- merged), and a different game_id is a completely different query — records
-- can never cross between games or tiers.
--
-- Idempotency: `create or replace function` is safe to re-run.
--
-- Performance: no new index added. player_skill_records' own PRIMARY KEY
-- (user_id, game_id, difficulty) already covers `where game_id = ... and
-- difficulty = ...` efficiently (a range scan on the PK's leading columns
-- once user_id is not fixed... in practice, for this query shape, an index
-- on (game_id, difficulty) would help more once row counts grow, but with
-- today's small real user count (dozens) a full scan of this small table is
-- still trivial. Revisit only if Supabase's own slow-query view flags it.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. get_game_leaderboard_top — Top N (default/max 100) ranking-eligible
--    users for one game_id + difficulty.
-- -----------------------------------------------------------------------------
create or replace function public.get_game_leaderboard_top(
  p_game_id text,
  p_difficulty text,
  p_limit integer default 100
)
returns table(rank bigint, nickname text, record_value double precision, tiebreak_value double precision)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
  v_metric_key text;
  v_direction text;
  v_tiebreak_key text;
begin
  if auth.uid() is null then
    raise exception 'get_game_leaderboard_top: no authenticated user' using errcode = '28000';
  end if;

  if p_difficulty is null or p_difficulty not in ('hard', 'extreme') then
    return;
  end if;

  -- Direct SQL transcription of lib/ranking/game-ranking-metrics.config.ts's
  -- GAME_RANKING_METRICS — see this migration's header comment.
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
  with eligible as (
    select
      psr.user_id,
      pr.nickname as nick,
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
  ),
  ranked as (
    select
      row_number() over (
        order by
          (case when v_direction = 'asc' then metric_val else -metric_val end) asc,
          completed_at asc,
          user_id asc
      ) as row_rank,
      nick,
      metric_val,
      tiebreak_val
    from eligible
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.metric_val as record_value, ranked.tiebreak_val as tiebreak_value
  from ranked
  where ranked.row_rank <= v_limit;
end;
$$;

comment on function public.get_game_leaderboard_top(text, text, integer) is
  'Phase 3B-7 — SECURITY DEFINER. Returns the top p_limit (clamped to [1,100]) ranking-eligible (profiles.nickname set, has a current-season record at this exact game+difficulty) users for one game_id+difficulty, ranked by that game''s own real raw metric (never normalizedScore) in its correct direction. Never returns user_id/email/timestamps/full raw_record/any other column.';

revoke all on function public.get_game_leaderboard_top(text, text, integer) from public;
revoke all on function public.get_game_leaderboard_top(text, text, integer) from anon;
grant execute on function public.get_game_leaderboard_top(text, text, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. get_my_game_rank — the calling user's own exact rank for one
--    game_id + difficulty, whether or not it's inside the Top 100.
-- -----------------------------------------------------------------------------
-- Deliberately never raises for ANY input — not signed in, no nickname yet,
-- never played this exact game+difficulty, a stale-season record only, or
-- even an invalid game_id/difficulty — every one of those simply returns
-- zero rows, matching get_my_xp_rank/get_my_overall_rank's own "uniform
-- no-row, never an exception" contract.
create or replace function public.get_my_game_rank(
  p_game_id text,
  p_difficulty text
)
returns table(rank bigint, nickname text, record_value double precision, tiebreak_value double precision)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_metric_key text;
  v_direction text;
  v_tiebreak_key text;
begin
  if v_uid is null then
    return; -- not signed in — zero rows, not an exception
  end if;

  if p_difficulty is null or p_difficulty not in ('hard', 'extreme') then
    return;
  end if;

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
  with eligible as (
    select
      psr.user_id,
      pr.nickname as nick,
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
  ),
  ranked as (
    select
      row_number() over (
        order by
          (case when v_direction = 'asc' then metric_val else -metric_val end) asc,
          completed_at asc,
          user_id asc
      ) as row_rank,
      user_id,
      nick,
      metric_val,
      tiebreak_val
    from eligible
  )
  select ranked.row_rank as rank, ranked.nick as nickname, ranked.metric_val as record_value, ranked.tiebreak_val as tiebreak_value
  from ranked
  where ranked.user_id = v_uid;
end;
$$;

comment on function public.get_my_game_rank(text, text) is
  'Phase 3B-7 — SECURITY DEFINER. Returns the caller''s own exact rank/nickname/record_value/tiebreak_value for one game_id+difficulty using the identical ordering get_game_leaderboard_top uses, whether or not the caller is inside the top 100. Zero rows (never an exception) for any invalid input, not signed in, nickname unset, or no current-season record at this game+difficulty.';

revoke all on function public.get_my_game_rank(text, text) from public;
revoke all on function public.get_my_game_rank(text, text) from anon;
grant execute on function public.get_my_game_rank(text, text) to authenticated;
