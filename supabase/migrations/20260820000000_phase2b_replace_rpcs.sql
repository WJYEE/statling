-- =============================================================================
-- Statling — Phase 2B-2.5: Transactional "replace" RPCs for the 3 surrogate-
-- uuid tables the client-side migration write helpers (lib/migration/
-- write-local-snapshot.ts) deliberately could NOT write safely.
-- =============================================================================
-- Scope: 3 new functions + their grants only. No table/column/RLS-policy
-- changes to the Phase 1 schema (supabase/migrations/
-- 20260819000000_phase1_schema_and_rls.sql) — every existing policy is
-- reused as-is, not modified, not replaced, not dropped.
--
-- Why these 3 tables specifically needed a server-side function instead of
-- plain client upsert (see the Phase 2B-2 report for the full reasoning):
-- room_items / deco_placement_items / user_notes are the only tables in the
-- snapshot whose primary key is a surrogate `uuid` with NO natural
-- (business-key) alternative to conflict on. A client-side "DELETE all my
-- rows, then INSERT the snapshot" has no way to be atomic (PostgREST issues
-- one HTTP request per statement, each its own transaction) — a network
-- drop between the two leaves the user with zero rows, and two concurrent
-- calls (two tabs) can each delete-then-insert and end up with duplicated
-- data. Wrapping both statements inside ONE plpgsql function makes them
-- share a single Postgres transaction for free, and an advisory lock below
-- serializes concurrent calls for the same user so two tabs can no longer
-- race each other.
--
-- Idempotency: `create or replace function` is safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Security model — read before changing anything below.
-- -----------------------------------------------------------------------------
-- All 3 functions are SECURITY INVOKER, not SECURITY DEFINER. This is a
-- deliberate choice, verified against the actual Phase 1 grants/policies
-- rather than assumed:
--
--   table                 | grants to `authenticated`      | relevant RLS policy
--   ----------------------|---------------------------------|----------------------------------------
--   room_items            | select, insert, update, delete | *_select/insert/update/delete_own, all `auth.uid() = user_id`
--   deco_placement_items  | select, insert, update, delete | *_select/insert/update/delete_own, all `auth.uid() = user_id`
--   user_notes            | select, insert, delete (NO update) | *_select/insert_own (`auth.uid() = user_id`), *_delete_own (`auth.uid() = user_id`)
--
-- The `authenticated` role already has every grant these 3 functions need
-- (DELETE + INSERT on all three — user_notes never needed UPDATE since it
-- only ever inserts or replaces-via-delete, never edits a row in place).
-- Because every function runs SECURITY INVOKER, the DELETE/INSERT inside it
-- execute as the calling (authenticated) role, so:
--   (a) the existing grants above are sufficient — no new table-level grant
--       is added or changed anywhere in this file;
--   (b) the existing RLS policies still apply IN FULL, exactly as if the
--       caller had issued the DELETE/INSERT directly via PostgREST — a bug
--       in a function body below (e.g. a forgotten WHERE clause) would
--       still be caught by RLS as a second, independent layer, which is
--       the entire reason INVOKER was chosen over DEFINER here. A DEFINER
--       function would run as the function's OWNER (typically a
--       superuser/service role), bypassing RLS entirely and making the
--       function's own WHERE/auth.uid() logic the ONLY thing standing
--       between a bug and a cross-user data leak — unacceptable for
--       something this security-sensitive, and unnecessary here since
--       INVOKER already has every privilege it needs.
--
-- Each function also independently guards `auth.uid() is null` before
-- touching any table, and NEVER accepts a user_id/owner parameter from the
-- client — the row owner is always `auth.uid()` read server-side, so there
-- is no argument a caller could pass to operate on someone else's data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. replace_room_items — atomic replace of the calling user's room_items.
-- -----------------------------------------------------------------------------
-- `items` shape: jsonb array of objects with asset_id/category/x/y/width/
-- height (required) and z_index/rotation/flipped (optional, defaulted) — see
-- lib/migration/snapshot-types.ts#RoomItemRow. `instance_id` is deliberately
-- NOT accepted from the client: local instanceId values are not guaranteed
-- to be real uuids (see the Phase 2B-1 report), and there is no pre-existing
-- server row for a first-time migration to reconcile against, so every row
-- simply gets a fresh server-generated id via the column's own
-- `default gen_random_uuid()`.
create or replace function public.replace_room_items(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'replace_room_items: no authenticated user' using errcode = '28000';
  end if;

  -- Scoped to THIS function + THIS user, so two tabs replacing the SAME
  -- user's room_items serialize against each other; a different user's call
  -- (different auth.uid()) uses a different lock key and is never blocked.
  perform pg_advisory_xact_lock(hashtext('replace_room_items:' || auth.uid()::text));

  delete from public.room_items where user_id = auth.uid();

  insert into public.room_items (user_id, asset_id, category, x, y, width, height, z_index, rotation, flipped)
  select
    auth.uid(),
    item ->> 'asset_id',
    item ->> 'category',
    (item ->> 'x')::double precision,
    (item ->> 'y')::double precision,
    (item ->> 'width')::double precision,
    (item ->> 'height')::double precision,
    coalesce((item ->> 'z_index')::integer, 40),
    coalesce((item ->> 'rotation')::double precision, 0),
    coalesce((item ->> 'flipped')::boolean, false)
  from jsonb_array_elements(coalesce(items, '[]'::jsonb)) as item;
end;
$$;

comment on function public.replace_room_items(jsonb) is
  'Phase 2B migration only: atomically replaces auth.uid()''s entire room_items set with `items`. SECURITY INVOKER — relies on the caller''s own room_items grants + RLS (auth.uid() = user_id), does not bypass them. Advisory-locked per user to make concurrent calls (e.g. two tabs) safe.';

revoke all on function public.replace_room_items(jsonb) from public;
grant execute on function public.replace_room_items(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. replace_deco_placement_items — atomic replace of the calling user's
--    deco_placement_items.
-- -----------------------------------------------------------------------------
-- `items` shape: jsonb array of objects with item_id/anchor/offset_x/
-- offset_y/width/height/layer (required) and scale/rotation/flipped
-- (optional, defaulted) — see snapshot-types.ts#DecoPlacementItemRow. Same
-- non-uuid `instance_id` reasoning as replace_room_items above — always
-- server-generated. `layer` keeps the table's own
-- `check (layer in ('behind','front'))` as the sole validation — an invalid
-- value fails the INSERT and rolls back the whole transaction rather than
-- being coerced or silently dropped.
create or replace function public.replace_deco_placement_items(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'replace_deco_placement_items: no authenticated user' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('replace_deco_placement_items:' || auth.uid()::text));

  delete from public.deco_placement_items where user_id = auth.uid();

  insert into public.deco_placement_items (user_id, item_id, anchor, offset_x, offset_y, width, height, scale, rotation, layer, flipped)
  select
    auth.uid(),
    item ->> 'item_id',
    item ->> 'anchor',
    (item ->> 'offset_x')::double precision,
    (item ->> 'offset_y')::double precision,
    (item ->> 'width')::double precision,
    (item ->> 'height')::double precision,
    coalesce((item ->> 'scale')::double precision, 1),
    coalesce((item ->> 'rotation')::double precision, 0),
    item ->> 'layer',
    coalesce((item ->> 'flipped')::boolean, false)
  from jsonb_array_elements(coalesce(items, '[]'::jsonb)) as item;
end;
$$;

comment on function public.replace_deco_placement_items(jsonb) is
  'Phase 2B migration only: atomically replaces auth.uid()''s entire deco_placement_items set with `items`. SECURITY INVOKER — relies on the caller''s own deco_placement_items grants + RLS (auth.uid() = user_id), does not bypass them. Advisory-locked per user to make concurrent calls (e.g. two tabs) safe.';

revoke all on function public.replace_deco_placement_items(jsonb) from public;
grant execute on function public.replace_deco_placement_items(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. replace_user_notes — atomic replace of the calling user's user_notes.
-- -----------------------------------------------------------------------------
-- `notes` shape: jsonb array of objects with `text` (required) and
-- `created_at` (optional — see snapshot-types.ts#UserNoteRow; falls back to
-- now() when absent/unparseable). `id` is never accepted from the client for
-- the same non-uuid reason as the other two tables' instance ids — always
-- server-generated. This table has NO update grant at all (insert/delete
-- only, by original Phase 1 design — notes are immutable once written), so
-- delete-then-insert inside one transaction was already the only grant-
-- compatible replace strategy, not merely the most convenient one.
create or replace function public.replace_user_notes(notes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'replace_user_notes: no authenticated user' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('replace_user_notes:' || auth.uid()::text));

  delete from public.user_notes where user_id = auth.uid();

  insert into public.user_notes (user_id, text, created_at)
  select
    auth.uid(),
    note ->> 'text',
    coalesce((note ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(notes, '[]'::jsonb)) as note;
end;
$$;

comment on function public.replace_user_notes(jsonb) is
  'Phase 2B migration only: atomically replaces auth.uid()''s entire user_notes set with `notes`. SECURITY INVOKER — relies on the caller''s own user_notes grants (insert+delete, no update) + RLS (auth.uid() = user_id), does not bypass them. Advisory-locked per user to make concurrent calls (e.g. two tabs) safe.';

revoke all on function public.replace_user_notes(jsonb) from public;
grant execute on function public.replace_user_notes(jsonb) to authenticated;

-- =============================================================================
-- End of Phase 2B-2.5. Not yet applied to any remote project (no `supabase
-- db push` has been run for this file) — see the Phase 2B-2.5 report for the
-- security review to read before applying it.
-- =============================================================================
