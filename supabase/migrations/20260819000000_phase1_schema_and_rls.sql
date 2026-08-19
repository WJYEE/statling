-- =============================================================================
-- Statling — Phase 1: Database Schema + RLS
-- =============================================================================
-- Scope: schema + RLS only. No app code (storage/auth) is touched by this file.
-- No ranking tables/functions/policies are created — ranking is explicitly out
-- of scope for this phase (see report §14/§16 in the Phase 1 writeup).
--
-- Confirmed product policy baked into this schema:
--   - 1 user = 1 pet            -> pets.user_id is the table's PRIMARY KEY
--   - Statling name duplicates are ALLOWED -> no unique index on statling_name
--   - A local (guest) pet must never overwrite an existing server pet
--       -> enforced at the DB layer by guard_pet_identity_immutable() below,
--          independent of whatever Phase 2 client code ends up doing
--   - feedback stays anonymous and out of scope for this migration (no table
--     created here — see report)
--   - userNotes becomes a real per-user table (user_notes)
--   - onboarding/audio settings stay in localStorage (no tables here)
--
-- Idempotency: every statement below is safe to re-run (IF NOT EXISTS / DROP
-- ... IF EXISTS + CREATE), since this is expected to be pasted into the
-- Supabase SQL Editor by hand and may be re-run after a partial failure.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- Default grants: every table below is authenticated-only (no anon access).
grant usage on schema public to authenticated;


-- -----------------------------------------------------------------------------
-- 1. profiles — 1:1 shadow of auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  legacy_device_id  text,
  migrated_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  '1:1 shadow of auth.users. legacy_device_id/migrated_at exist purely to support the one-time localStorage migration (Phase 2) — migrated_at IS NULL means this account has never received a local->server upload.';
comment on column public.profiles.migrated_at is
  'Set once by the Phase 2 migration routine after a successful localStorage upload. NULL = never migrated (new signup with no legacy data, or not yet migrated).';

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately no INSERT/DELETE policy for the client: rows are created only
-- by the handle_new_user() trigger below (SECURITY DEFINER, bypasses RLS),
-- and are never deleted directly (cascades from auth.users deletion instead).

grant select, update on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Generic bookkeeping triggers
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_last_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 3. handle_new_user — auto-create a profiles row on signup
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, created_at, updated_at)
  values (new.id, now(), now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 4. pets — 1 user = 1 pet (confirmed product policy)
-- -----------------------------------------------------------------------------
create table if not exists public.pets (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  character_id    text not null,
  statling_name   text,                       -- null until the Naming screen; duplicates allowed by policy
  confirmed       boolean not null default false,
  top_stat        text not null,
  second_stat     text not null,
  initial_finals  jsonb not null,
  latest_finals   jsonb not null,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  constraint pets_top_second_stat_distinct check (top_stat <> second_stat)
);

comment on table public.pets is
  'One row per user (UNIQUE via PRIMARY KEY on user_id — matches the confirmed "1 user = 1 pet" policy). Identity fields become immutable once confirmed=true, see guard_pet_identity_immutable().';

alter table public.pets enable row level security;

drop policy if exists "pets_select_own" on public.pets;
create policy "pets_select_own" on public.pets
  for select
  using (auth.uid() = user_id);

drop policy if exists "pets_insert_own" on public.pets;
create policy "pets_insert_own" on public.pets
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "pets_update_own" on public.pets;
create policy "pets_update_own" on public.pets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: a pet is never client-deletable (data retention).

grant select, insert, update on public.pets to authenticated;

drop trigger if exists trg_pets_touch_updated_at on public.pets;
create trigger trg_pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

-- Enforces "a local pet must never overwrite a server pet that already exists
-- and is confirmed" at the DB layer, regardless of what Phase 2 client/merge
-- code does. Once OLD.confirmed = true, character_id/top_stat/second_stat/
-- initial_finals can never change again, and statling_name can be set exactly
-- once (from NULL) but never changed after that. latest_finals/updated_at
-- stay freely updatable (test replays keep updating growth data).
create or replace function public.guard_pet_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed is true then
    if new.character_id is distinct from old.character_id
       or new.top_stat is distinct from old.top_stat
       or new.second_stat is distinct from old.second_stat
       or new.initial_finals is distinct from old.initial_finals
       or (old.statling_name is not null and new.statling_name is distinct from old.statling_name)
    then
      raise exception
        'pets: identity fields are immutable once confirmed (user_id=%)', old.user_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pets_guard_identity on public.pets;
create trigger trg_pets_guard_identity
  before update on public.pets
  for each row execute function public.guard_pet_identity_immutable();


-- -----------------------------------------------------------------------------
-- 5. player_skill_records — best record per (user, game, difficulty)
-- -----------------------------------------------------------------------------
create table if not exists public.player_skill_records (
  user_id           uuid not null references auth.users (id) on delete cascade,
  game_id           text not null,
  difficulty        text not null check (difficulty in ('easy', 'normal', 'hard', 'extreme')),
  stat_category     text not null,
  normalized_score  double precision not null check (normalized_score >= 0 and normalized_score <= 100),
  raw               jsonb,
  metrics           jsonb,
  record_version    integer not null default 1,
  completion_id     text not null,
  completed_at      timestamptz not null,
  updated_at        timestamptz not null default now(),
  primary key (user_id, game_id, difficulty)
);

comment on table public.player_skill_records is
  'Best record per (user, game, difficulty) — up to 12 games x 4 difficulties = 48 rows/user. record_version is the ranking-season stamp; ranking reads are intentionally NOT built in this phase.';

alter table public.player_skill_records enable row level security;

drop policy if exists "player_skill_records_select_own" on public.player_skill_records;
create policy "player_skill_records_select_own" on public.player_skill_records
  for select
  using (auth.uid() = user_id);

drop policy if exists "player_skill_records_insert_own" on public.player_skill_records;
create policy "player_skill_records_insert_own" on public.player_skill_records
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "player_skill_records_update_own" on public.player_skill_records;
create policy "player_skill_records_update_own" on public.player_skill_records
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Deliberately no policy grants ANY cross-user SELECT — ranking is out of
-- scope for this phase (see task instructions). Do not add one here.

grant select, insert, update on public.player_skill_records to authenticated;

drop trigger if exists trg_player_skill_records_touch_updated_at on public.player_skill_records;
create trigger trg_player_skill_records_touch_updated_at
  before update on public.player_skill_records
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 6. xp_totals
-- -----------------------------------------------------------------------------
create table if not exists public.xp_totals (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  total_xp    integer not null default 0 check (total_xp >= 0),
  weekly_xp   integer not null default 0 check (weekly_xp >= 0),
  week_key    date not null default current_date,
  updated_at  timestamptz not null default now()
);

comment on column public.xp_totals.week_key is
  'UTC-Monday-anchored week key, unchanged from the current client logic. See report §"KST 정책 충돌 지점" — this is NOT KST-aligned and that mismatch is intentionally left as an open Phase 2 decision, not resolved by this schema.';

alter table public.xp_totals enable row level security;

drop policy if exists "xp_totals_select_own" on public.xp_totals;
create policy "xp_totals_select_own" on public.xp_totals
  for select
  using (auth.uid() = user_id);

drop policy if exists "xp_totals_insert_own" on public.xp_totals;
create policy "xp_totals_insert_own" on public.xp_totals
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "xp_totals_update_own" on public.xp_totals;
create policy "xp_totals_update_own" on public.xp_totals
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.xp_totals to authenticated;

drop trigger if exists trg_xp_totals_touch_updated_at on public.xp_totals;
create trigger trg_xp_totals_touch_updated_at
  before update on public.xp_totals
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 7. achievements — one row per unlocked tier
-- -----------------------------------------------------------------------------
create table if not exists public.achievements (
  user_id      uuid not null references auth.users (id) on delete cascade,
  tier_id      text not null,
  unlocked_at  timestamptz not null default now(),
  claimed_at   timestamptz,
  notified_at  timestamptz,
  primary key (user_id, tier_id),
  constraint achievements_claimed_after_unlocked check (claimed_at is null or claimed_at >= unlocked_at)
);

alter table public.achievements enable row level security;

drop policy if exists "achievements_select_own" on public.achievements;
create policy "achievements_select_own" on public.achievements
  for select
  using (auth.uid() = user_id);

drop policy if exists "achievements_insert_own" on public.achievements;
create policy "achievements_insert_own" on public.achievements
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "achievements_update_own" on public.achievements;
create policy "achievements_update_own" on public.achievements
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.achievements to authenticated;


-- -----------------------------------------------------------------------------
-- 8. daily_missions
-- -----------------------------------------------------------------------------
create table if not exists public.daily_missions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  date_key    date not null,
  mission_id  text not null,
  progress    integer not null default 0 check (progress >= 0),
  claimed_at  timestamptz,
  primary key (user_id, date_key, mission_id)
);

comment on column public.daily_missions.date_key is
  'The calendar date this progress belongs to, as computed by the CLIENT. Per the KST default policy, Phase 2 should compute this using Asia/Seoul rather than device-local time — see report §"KST 정책 충돌 지점". The column itself is timezone-agnostic (plain date).';

alter table public.daily_missions enable row level security;

drop policy if exists "daily_missions_select_own" on public.daily_missions;
create policy "daily_missions_select_own" on public.daily_missions
  for select
  using (auth.uid() = user_id);

drop policy if exists "daily_missions_insert_own" on public.daily_missions;
create policy "daily_missions_insert_own" on public.daily_missions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "daily_missions_update_own" on public.daily_missions;
create policy "daily_missions_update_own" on public.daily_missions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.daily_missions to authenticated;


-- -----------------------------------------------------------------------------
-- 9. attendance
-- -----------------------------------------------------------------------------
create table if not exists public.attendance (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  total_days       integer not null default 0 check (total_days >= 0),
  current_streak   integer not null default 0 check (current_streak >= 0),
  longest_streak   integer not null default 0 check (longest_streak >= 0),
  last_visit_date  date
);

comment on column public.attendance.last_visit_date is
  'Same client-timezone caveat as daily_missions.date_key — see report §"KST 정책 충돌 지점".';

alter table public.attendance enable row level security;

drop policy if exists "attendance_select_own" on public.attendance;
create policy "attendance_select_own" on public.attendance
  for select
  using (auth.uid() = user_id);

drop policy if exists "attendance_insert_own" on public.attendance;
create policy "attendance_insert_own" on public.attendance
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "attendance_update_own" on public.attendance;
create policy "attendance_update_own" on public.attendance
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.attendance to authenticated;


-- -----------------------------------------------------------------------------
-- 10. activity_counters
-- -----------------------------------------------------------------------------
create table if not exists public.activity_counters (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  total_games_played       integer not null default 0 check (total_games_played >= 0),
  total_personal_bests     integer not null default 0 check (total_personal_bests >= 0),
  free_play_completions    integer not null default 0 check (free_play_completions >= 0),
  total_interactions       integer not null default 0 check (total_interactions >= 0),
  feed_count               integer not null default 0 check (feed_count >= 0),
  shower_count             integer not null default 0 check (shower_count >= 0),
  clean_count              integer not null default 0 check (clean_count >= 0),
  play_count               integer not null default 0 check (play_count >= 0),
  pet_count                integer not null default 0 check (pet_count >= 0),
  talk_count               integer not null default 0 check (talk_count >= 0),
  share_count              integer not null default 0 check (share_count >= 0),
  room_decor_saved         boolean not null default false,
  statling_decor_saved     boolean not null default false,
  has_logged_in_ever       boolean not null default false,
  updated_at               timestamptz not null default now()
);

alter table public.activity_counters enable row level security;

drop policy if exists "activity_counters_select_own" on public.activity_counters;
create policy "activity_counters_select_own" on public.activity_counters
  for select
  using (auth.uid() = user_id);

drop policy if exists "activity_counters_insert_own" on public.activity_counters;
create policy "activity_counters_insert_own" on public.activity_counters
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "activity_counters_update_own" on public.activity_counters;
create policy "activity_counters_update_own" on public.activity_counters
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.activity_counters to authenticated;

drop trigger if exists trg_activity_counters_touch_updated_at on public.activity_counters;
create trigger trg_activity_counters_touch_updated_at
  before update on public.activity_counters
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 11. pet_care_state
-- -----------------------------------------------------------------------------
create table if not exists public.pet_care_state (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  satiety                 integer not null default 70 check (satiety between 0 and 100),
  cleanliness             integer not null default 80 check (cleanliness between 0 and 100),
  affection               integer not null default 65 check (affection between 0 and 100),
  energy                  integer not null default 80 check (energy between 0 and 100),
  happiness               integer not null default 70 check (happiness between 0 and 100),
  intimacy_level          integer not null default 1 check (intimacy_level between 1 and 50),
  intimacy_exp            integer not null default 0 check (intimacy_exp >= 0),
  unlocked_reward_levels  integer[] not null default '{}',
  gift_ready_level        integer,
  cooldowns               jsonb not null default '{}'::jsonb,
  last_play_variant_id    text,
  last_updated_at         timestamptz not null default now()
);

comment on column public.pet_care_state.last_updated_at is
  'Ground truth timestamp that client-side decay math is computed from — auto-touched on every UPDATE, same semantic as the original localStorage field.';

alter table public.pet_care_state enable row level security;

drop policy if exists "pet_care_state_select_own" on public.pet_care_state;
create policy "pet_care_state_select_own" on public.pet_care_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "pet_care_state_insert_own" on public.pet_care_state;
create policy "pet_care_state_insert_own" on public.pet_care_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "pet_care_state_update_own" on public.pet_care_state;
create policy "pet_care_state_update_own" on public.pet_care_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.pet_care_state to authenticated;

drop trigger if exists trg_pet_care_state_touch_last_updated_at on public.pet_care_state;
create trigger trg_pet_care_state_touch_last_updated_at
  before update on public.pet_care_state
  for each row execute function public.touch_last_updated_at();


-- -----------------------------------------------------------------------------
-- 12. room_state
-- -----------------------------------------------------------------------------
create table if not exists public.room_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  background_id  text not null,
  updated_at     timestamptz not null default now()
);

alter table public.room_state enable row level security;

drop policy if exists "room_state_select_own" on public.room_state;
create policy "room_state_select_own" on public.room_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "room_state_insert_own" on public.room_state;
create policy "room_state_insert_own" on public.room_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "room_state_update_own" on public.room_state;
create policy "room_state_update_own" on public.room_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.room_state to authenticated;

drop trigger if exists trg_room_state_touch_updated_at on public.room_state;
create trigger trg_room_state_touch_updated_at
  before update on public.room_state
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 13. room_items — placed furniture (real 1:N child rows)
-- -----------------------------------------------------------------------------
create table if not exists public.room_items (
  instance_id  uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  asset_id     text not null,
  category     text not null,
  x            double precision not null,
  y            double precision not null,
  width        double precision not null,
  height       double precision not null,
  z_index      integer not null default 40,
  rotation     double precision not null default 0,
  flipped      boolean not null default false
);

alter table public.room_items enable row level security;

drop policy if exists "room_items_select_own" on public.room_items;
create policy "room_items_select_own" on public.room_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "room_items_insert_own" on public.room_items;
create policy "room_items_insert_own" on public.room_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "room_items_update_own" on public.room_items;
create policy "room_items_update_own" on public.room_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "room_items_delete_own" on public.room_items;
create policy "room_items_delete_own" on public.room_items
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.room_items to authenticated;

create index if not exists idx_room_items_user on public.room_items (user_id);


-- -----------------------------------------------------------------------------
-- 14. room_inventory — unlocked room-decoration ids (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.room_inventory (
  user_id      uuid not null references auth.users (id) on delete cascade,
  asset_id     text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, asset_id)
);

alter table public.room_inventory enable row level security;

drop policy if exists "room_inventory_select_own" on public.room_inventory;
create policy "room_inventory_select_own" on public.room_inventory
  for select
  using (auth.uid() = user_id);

drop policy if exists "room_inventory_insert_own" on public.room_inventory;
create policy "room_inventory_insert_own" on public.room_inventory
  for insert
  with check (auth.uid() = user_id);

-- No UPDATE/DELETE policy: append-only, never removed — matches
-- grantRoomReward's idempotent-insert-only semantics.

grant select, insert on public.room_inventory to authenticated;


-- -----------------------------------------------------------------------------
-- 15. room_care_state — room cleanliness (distinct from the pet's own stat)
-- -----------------------------------------------------------------------------
create table if not exists public.room_care_state (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  cleanliness      integer not null default 81 check (cleanliness between 0 and 100),
  last_cleaned_at  timestamptz not null default now()
);

alter table public.room_care_state enable row level security;

drop policy if exists "room_care_state_select_own" on public.room_care_state;
create policy "room_care_state_select_own" on public.room_care_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "room_care_state_insert_own" on public.room_care_state;
create policy "room_care_state_insert_own" on public.room_care_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "room_care_state_update_own" on public.room_care_state;
create policy "room_care_state_update_own" on public.room_care_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.room_care_state to authenticated;


-- -----------------------------------------------------------------------------
-- 16. deco_placement_items — stickers placed on the Statling (1:N child rows)
-- -----------------------------------------------------------------------------
create table if not exists public.deco_placement_items (
  instance_id  uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_id      text not null,
  anchor       text not null,
  offset_x     double precision not null,
  offset_y     double precision not null,
  width        double precision not null,
  height       double precision not null,
  scale        double precision not null default 1,
  rotation     double precision not null default 0,
  layer        text not null check (layer in ('behind', 'front')),
  flipped      boolean not null default false
);

alter table public.deco_placement_items enable row level security;

drop policy if exists "deco_placement_items_select_own" on public.deco_placement_items;
create policy "deco_placement_items_select_own" on public.deco_placement_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "deco_placement_items_insert_own" on public.deco_placement_items;
create policy "deco_placement_items_insert_own" on public.deco_placement_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "deco_placement_items_update_own" on public.deco_placement_items;
create policy "deco_placement_items_update_own" on public.deco_placement_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "deco_placement_items_delete_own" on public.deco_placement_items;
create policy "deco_placement_items_delete_own" on public.deco_placement_items
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.deco_placement_items to authenticated;

create index if not exists idx_deco_placement_items_user on public.deco_placement_items (user_id);


-- -----------------------------------------------------------------------------
-- 17. deco_inventory — unlocked Statling-decoration ids (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.deco_inventory (
  user_id      uuid not null references auth.users (id) on delete cascade,
  asset_id     text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, asset_id)
);

alter table public.deco_inventory enable row level security;

drop policy if exists "deco_inventory_select_own" on public.deco_inventory;
create policy "deco_inventory_select_own" on public.deco_inventory
  for select
  using (auth.uid() = user_id);

drop policy if exists "deco_inventory_insert_own" on public.deco_inventory;
create policy "deco_inventory_insert_own" on public.deco_inventory
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.deco_inventory to authenticated;


-- -----------------------------------------------------------------------------
-- 18. pet_memory
-- -----------------------------------------------------------------------------
create table if not exists public.pet_memory (
  user_id                          uuid primary key references auth.users (id) on delete cascade,
  first_met_at                     timestamptz not null default now(),
  last_visited_at                  timestamptz not null default now(),
  total_visits                     integer not null default 0 check (total_visits >= 0),
  consecutive_visit_days           integer not null default 0 check (consecutive_visit_days >= 0),
  longest_visit_streak             integer not null default 0 check (longest_visit_streak >= 0),
  last_visit_date                  date,
  care_action_counts               jsonb not null default '{}'::jsonb,
  favorite_care_action             text,
  recent_care_actions              text[] not null default '{}',
  recent_initiated_dialogue_ids    text[] not null default '{}',
  recent_game_ids                  text[] not null default '{}',
  recent_game_stats                text[] not null default '{}',
  most_played_stat                 text,
  game_play_counts_by_stat         jsonb not null default '{}'::jsonb,
  last_autonomous_action_at        timestamptz,
  last_initiated_dialogue_at       timestamptz,
  last_state_request_dialogue_at   timestamptz,
  last_welcome_dialogue_at         timestamptz,
  last_game_reaction_at            timestamptz,
  last_memory_comment_date         date,
  autonomy_bonus_today             jsonb not null default '{}'::jsonb,
  pending_game_reaction            jsonb
);

comment on column public.pet_memory.last_visit_date is
  'Same client-timezone caveat as daily_missions.date_key — see report §"KST 정책 충돌 지점".';

alter table public.pet_memory enable row level security;

drop policy if exists "pet_memory_select_own" on public.pet_memory;
create policy "pet_memory_select_own" on public.pet_memory
  for select
  using (auth.uid() = user_id);

drop policy if exists "pet_memory_insert_own" on public.pet_memory;
create policy "pet_memory_insert_own" on public.pet_memory
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "pet_memory_update_own" on public.pet_memory;
create policy "pet_memory_update_own" on public.pet_memory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.pet_memory to authenticated;


-- -----------------------------------------------------------------------------
-- 19. dialogue_memory
-- -----------------------------------------------------------------------------
create table if not exists public.dialogue_memory (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  answers               jsonb not null default '{}'::jsonb,
  answered_question_ids text[] not null default '{}'
);

alter table public.dialogue_memory enable row level security;

drop policy if exists "dialogue_memory_select_own" on public.dialogue_memory;
create policy "dialogue_memory_select_own" on public.dialogue_memory
  for select
  using (auth.uid() = user_id);

drop policy if exists "dialogue_memory_insert_own" on public.dialogue_memory;
create policy "dialogue_memory_insert_own" on public.dialogue_memory
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "dialogue_memory_update_own" on public.dialogue_memory;
create policy "dialogue_memory_update_own" on public.dialogue_memory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.dialogue_memory to authenticated;


-- -----------------------------------------------------------------------------
-- 20. user_notes — now a real account-synced table (confirmed policy change)
-- -----------------------------------------------------------------------------
create table if not exists public.user_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  text        text not null check (char_length(text) > 0),
  created_at  timestamptz not null default now()
);

alter table public.user_notes enable row level security;

drop policy if exists "user_notes_select_own" on public.user_notes;
create policy "user_notes_select_own" on public.user_notes
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_notes_insert_own" on public.user_notes;
create policy "user_notes_insert_own" on public.user_notes
  for insert
  with check (auth.uid() = user_id);

-- DELETE (not UPDATE) is intentionally allowed here, unlike every other
-- table: notes are immutable once written (no edit feature in the app), but
-- the client needs to be able to drop the oldest note once it exceeds
-- MAX_USER_NOTES (client-side FIFO trim, same as today's localStorage
-- behavior) — that requires a real DELETE, not an UPDATE.
drop policy if exists "user_notes_delete_own" on public.user_notes;
create policy "user_notes_delete_own" on public.user_notes
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.user_notes to authenticated;

create index if not exists idx_user_notes_user_created on public.user_notes (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 21. dex_entries — met-pet collection (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.dex_entries (
  user_id       uuid not null references auth.users (id) on delete cascade,
  character_id  text not null,
  met_at        timestamptz not null default now(),
  primary key (user_id, character_id)
);

alter table public.dex_entries enable row level security;

drop policy if exists "dex_entries_select_own" on public.dex_entries;
create policy "dex_entries_select_own" on public.dex_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists "dex_entries_insert_own" on public.dex_entries;
create policy "dex_entries_insert_own" on public.dex_entries
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.dex_entries to authenticated;

-- =============================================================================
-- End of Phase 1 schema + RLS. See supabase/verify_phase1.sql to check this
-- applied correctly, and the Phase 1 report for the pre-Phase-2 checklist.
-- =============================================================================
