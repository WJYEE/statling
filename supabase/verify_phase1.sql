-- =============================================================================
-- Statling — Phase 1 verification queries
-- Run these in the Supabase SQL Editor AFTER applying
-- migrations/20260819000000_phase1_schema_and_rls.sql.
-- Read-only where possible; Part B needs one real auth.users row (see notes).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A1. All 19 tables exist
-- -----------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'pets', 'player_skill_records', 'xp_totals', 'achievements',
    'daily_missions', 'attendance', 'activity_counters', 'pet_care_state',
    'room_state', 'room_items', 'room_inventory', 'room_care_state',
    'deco_placement_items', 'deco_inventory', 'pet_memory', 'dialogue_memory',
    'user_notes', 'dex_entries'
  )
order by table_name;
-- Expect: 19 rows.


-- -----------------------------------------------------------------------------
-- A2. RLS is enabled on every one of them (and none are FORCE'd)
-- -----------------------------------------------------------------------------
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and relname in (
    'profiles', 'pets', 'player_skill_records', 'xp_totals', 'achievements',
    'daily_missions', 'attendance', 'activity_counters', 'pet_care_state',
    'room_state', 'room_items', 'room_inventory', 'room_care_state',
    'deco_placement_items', 'deco_inventory', 'pet_memory', 'dialogue_memory',
    'user_notes', 'dex_entries'
  )
order by relname;
-- Expect: rls_enabled = true on all 19 rows, rls_forced = false on all (table
-- owner / service_role should still bypass RLS for admin work).


-- -----------------------------------------------------------------------------
-- A3. Policy inventory — counts should match the migration file's intent
-- -----------------------------------------------------------------------------
select tablename, cmd, count(*) as policy_count, array_agg(policyname order by policyname) as policy_names
from pg_policies
where schemaname = 'public'
group by tablename, cmd
order by tablename, cmd;
-- Expect per table:
--   select/insert/update tables (most of them): 1 policy each for select/insert/update, 0 for delete
--   room_items, deco_placement_items, user_notes: also 1 delete policy
--   room_inventory, deco_inventory, dex_entries: only select + insert (no update/delete)
--   profiles: only select + update (no insert/delete)
--
-- Explicitly confirm NO cross-user read policy exists on player_skill_records:
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'player_skill_records';
-- Expect exactly 3 rows (select/insert/update), each qual containing
-- "auth.uid() = user_id" — never "true" and never referencing other users.


-- -----------------------------------------------------------------------------
-- A4. Foreign keys all point at auth.users(id) with ON DELETE CASCADE
-- -----------------------------------------------------------------------------
select
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as ref_schema,
  ccu.table_name as ref_table,
  ccu.column_name as ref_column,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by tc.table_name;
-- Expect: every row has ref_schema='auth', ref_table='users', ref_column='id',
-- delete_rule='CASCADE'. profiles.id, pets.user_id, and every other *.user_id
-- FK should all appear here.


-- -----------------------------------------------------------------------------
-- A5. Primary keys match the design (spot-check the composite ones)
-- -----------------------------------------------------------------------------
select tc.table_name, string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as pk_columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
group by tc.table_name
order by tc.table_name;
-- Expect e.g.:
--   pets                  -> user_id
--   player_skill_records  -> user_id, game_id, difficulty
--   achievements          -> user_id, tier_id
--   daily_missions        -> user_id, date_key, mission_id
--   room_items            -> instance_id
--   room_inventory        -> user_id, asset_id
--   deco_placement_items  -> instance_id
--   deco_inventory        -> user_id, asset_id
--   dex_entries           -> user_id, character_id
--   user_notes            -> id


-- -----------------------------------------------------------------------------
-- A6. Indexes created beyond the PK-backed ones
-- -----------------------------------------------------------------------------
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_room_items_user', 'idx_deco_placement_items_user', 'idx_user_notes_user_created')
order by tablename;
-- Expect all 3 present.


-- -----------------------------------------------------------------------------
-- A7. Functions and triggers exist
-- -----------------------------------------------------------------------------
select proname, prosecdef as is_security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('handle_new_user', 'touch_updated_at', 'touch_last_updated_at', 'guard_pet_identity_immutable')
order by proname;
-- Expect 4 rows; handle_new_user.is_security_definer = true, the other three = false.

select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema in ('auth', 'public')
  and trigger_name in (
    'on_auth_user_created', 'trg_pets_guard_identity', 'trg_pets_touch_updated_at',
    'trg_profiles_touch_updated_at', 'trg_player_skill_records_touch_updated_at',
    'trg_xp_totals_touch_updated_at', 'trg_activity_counters_touch_updated_at',
    'trg_pet_care_state_touch_last_updated_at', 'trg_room_state_touch_updated_at'
  )
order by event_object_table, trigger_name;
-- Expect on_auth_user_created on auth.users (AFTER INSERT); the rest on their
-- respective public tables (BEFORE UPDATE).


-- =============================================================================
-- B. Functional checks — require one real auth.users row
--
-- Do NOT hand-insert into auth.users via raw SQL (it bypasses GoTrue's own
-- invariants and Supabase does not support it as a stable interface). Instead:
--   1. Create one throwaway test account (Supabase Studio -> Authentication ->
--      Add user, or a real signup through the app once Phase 2 wires up
--      SupabaseAuthProvider).
--   2. Copy its id from auth.users / Studio and substitute it below wherever
--      you see '00000000-0000-0000-0000-000000000000'.
-- =============================================================================

-- B1. Confirm the signup trigger created a profiles row automatically.
select * from public.profiles where id = '00000000-0000-0000-0000-000000000000';
-- Expect exactly 1 row, migrated_at IS NULL, legacy_device_id IS NULL.

-- B2. RLS smoke test — run AS that user (Supabase SQL Editor: switch role, or
-- use `set local role authenticated; select set_config('request.jwt.claims',
-- json_build_object('sub','00000000-0000-0000-0000-000000000000')::text, true);`
-- in a single transaction), then:
select * from public.pets;
-- Expect: 0 rows before any insert, never an error, and never another user's row.

insert into public.pets (user_id, character_id, top_stat, second_stat, initial_finals, latest_finals)
values ('00000000-0000-0000-0000-000000000000', '07_별사막여우', 'reasoning', 'judgment', '{}'::jsonb, '{}'::jsonb);
-- Expect: success (auth.uid() = user_id holds under the impersonated role).

-- B3. Guard trigger — confirm a confirmed pet's identity truly can't be overwritten.
update public.pets set confirmed = true, confirmed_at = now()
where user_id = '00000000-0000-0000-0000-000000000000';

update public.pets set latest_finals = '{"reasoning": 91}'::jsonb
where user_id = '00000000-0000-0000-0000-000000000000';
-- Expect: success — latest_finals is never guarded.

update public.pets set character_id = '01_치즈털실냥이'
where user_id = '00000000-0000-0000-0000-000000000000';
-- Expect: ERROR — "pets: identity fields are immutable once confirmed ..."
-- This is the DB-level guarantee behind "local pet must never overwrite server pet".

-- B4. A second pet for the same user must be structurally impossible.
insert into public.pets (user_id, character_id, top_stat, second_stat, initial_finals, latest_finals)
values ('00000000-0000-0000-0000-000000000000', '02_플로봇', 'judgment', 'reasoning', '{}'::jsonb, '{}'::jsonb);
-- Expect: ERROR — duplicate key value violates unique constraint "pets_pkey"
-- (user_id is the PRIMARY KEY, so "1 user = 1 pet" is enforced structurally,
-- not just by convention).

-- Clean up the test row when done:
-- delete from public.pets where user_id = '00000000-0000-0000-0000-000000000000';
-- (only works as service_role / table owner, since pets has no client DELETE policy)
