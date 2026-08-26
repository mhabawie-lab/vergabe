-- ---------------------------------------------------------------------------
-- Local stand-in for the Supabase platform objects.
--
-- The migrations expect three things Supabase provides and a plain PostgreSQL
-- does not: the `auth` schema with `auth.users` and `auth.uid()`, the roles
-- `anon` / `authenticated` / `service_role`, and the `storage` schema with its
-- buckets and objects tables.
--
-- This file creates just enough of each to apply the migrations and run the
-- SQL tests. It is **only** for local checks and CI:
--
--   * `auth.uid()` here reads a freely settable session variable. On the real
--     platform it comes from a verified JWT. Anything using this shim must
--     never hold real data.
--   * `storage.objects` here has no upload machinery, only the columns the
--     policies read.
--
-- Idempotent, because roles are cluster-wide and a second database in the
-- same cluster would otherwise fail on the role creation.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- Supabase grants these by default; a plain cluster does not.
grant usage on schema public, storage, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects, storage.buckets to anon;
grant select on storage.buckets to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
