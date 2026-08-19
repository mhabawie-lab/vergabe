-- 0001_init_extensions.sql
-- Extensions and shared helpers used by every later migration.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy title matching for dedupe
create extension if not exists "unaccent";   -- accent-insensitive search

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function keeping updated_at in sync on every UPDATE.';

-- ---------------------------------------------------------------------------
-- Shared enums
--
-- Enums (rather than check constraints) keep the storage compact — relevant
-- once the tenders table holds millions of rows — and are mirrored by the
-- string-literal unions in src/types.
-- ---------------------------------------------------------------------------
create type public.source_type as enum ('api', 'scraper', 'file_feed', 'manual');

create type public.connector_run_status as enum ('running', 'success', 'partial', 'failed');

create type public.normalization_run_status as enum ('success', 'failed');

create type public.tender_status as enum (
  'published',
  'amended',
  'closed',
  'awarded',
  'cancelled'
);

create type public.procurement_type as enum ('services', 'works', 'supplies');

create type public.procedure_type as enum (
  'open',
  'restricted',
  'negotiated',
  'competitive_dialogue',
  'direct_award',
  'framework'
);

create type public.requirement_category as enum (
  'eligibility',
  'staff',
  'certificate',
  'reference',
  'other'
);

create type public.document_download_status as enum (
  'pending',
  'downloaded',
  'failed',
  'unavailable'
);

create type public.org_role as enum ('super_admin', 'org_admin', 'bid_manager', 'viewer');
