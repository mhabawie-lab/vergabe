-- 0014_harden_function_search_path.sql
-- Pins `search_path` on four trigger functions that were created without it.
--
-- Why this matters. A function without a fixed `search_path` resolves the
-- names it calls against whatever the caller's search path happens to be. A
-- role that can create objects in a schema on that path can shadow a
-- function or operator the body relies on — `now()`, a cast, a comparison —
-- and have it run inside the trigger. For a `security definer` function that
-- is a privilege escalation; for the others it is still a correctness hazard
-- nobody would notice.
--
-- Found by `npm run db:validate`, which now fails the build on a function
-- without a pinned path, so this cannot regress silently.
--
-- ADDITIVE. `create or replace function` changes no data and drops nothing;
-- the existing triggers keep pointing at the same function names, so no
-- trigger has to be recreated. The bodies are copied unchanged from
-- 0001, 0006, 0008 and 0012 — only the `set search_path` line is new.

-- --- 0001: touches only new.updated_at, but calls now() ---------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --- 0006: reads public.sources --------------------------------------------
create or replace function public.enforce_demo_source_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  source_is_demo boolean;
begin
  select s.is_demo into source_is_demo
  from public.sources s
  where s.id = new.source_id;

  if source_is_demo and not new.is_demo then
    raise exception
      'Source % is a demo source; % records must be flagged is_demo',
      new.source_id, tg_table_name;
  end if;

  return new;
end;
$$;

-- --- 0008: reads public.organizations --------------------------------------
create or replace function public.reject_demo_reference_data()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  org_is_demo boolean;
begin
  select o.is_demo into org_is_demo
  from public.organizations o
  where o.id = new.organization_id;

  if org_is_demo then
    raise exception
      'Organisation % is a demo tenant; real reference data must not be stored against it',
      new.organization_id;
  end if;

  return new;
end;
$$;

-- --- 0012: guards the block reason and the preferred/blocked contradiction --
create or replace function public.enforce_partner_block_reason()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_blocked and coalesce(btrim(new.blocked_reason), '') = '' then
    raise exception 'Eine Sperrung benötigt eine Begründung.';
  end if;

  -- Blocking and "preferred" are contradictory states.
  if new.is_blocked and new.is_preferred then
    raise exception 'Ein gesperrter Partner kann nicht zugleich bevorzugt sein.';
  end if;

  return new;
end;
$$;
