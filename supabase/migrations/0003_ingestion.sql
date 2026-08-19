-- 0003_ingestion.sql
-- Ingestion side of the pipeline: SOURCE → CONNECTOR → RAW IMPORT → NORMALIZER.
--
-- Raw payloads are immutable. Re-running the normalizer reads from
-- raw_imports rather than re-fetching the source (CLAUDE.md § Rohdaten).

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
create table public.sources (
  id                    uuid primary key default gen_random_uuid(),
  key                   text not null,
  name                  text not null,
  source_type           public.source_type not null,
  country_code          char(2),
  website_url           text,
  description           text,
  is_active             boolean not null default false,
  is_demo               boolean not null default false,
  poll_interval_seconds integer not null default 3600,
  config                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint sources_key_key unique (key),
  constraint sources_key_format check (key ~ '^[a-z0-9_-]+$'),
  constraint sources_poll_interval_positive check (poll_interval_seconds > 0)
);

comment on table public.sources is
  'Registered data source. is_active is data, not code: enabling or disabling a connector never needs a deployment.';
comment on column public.sources.key is
  'Stable identifier matching the connector implementation under src/modules/connectors/sources.';
comment on column public.sources.config is
  'Non-secret connector configuration. Credentials belong in environment variables only.';

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create index sources_active_idx on public.sources (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- connector_runs
--
-- One row per connector execution — the basis for the monitoring view in the
-- admin area.
-- ---------------------------------------------------------------------------
create table public.connector_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.sources (id) on delete cascade,
  status         public.connector_run_status not null default 'running',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  items_found    integer not null default 0,
  items_imported integer not null default 0,
  items_skipped  integer not null default 0,
  items_failed   integer not null default 0,
  error_message  text,
  created_at     timestamptz not null default now(),

  constraint connector_runs_counts_non_negative check (
    items_found >= 0 and items_imported >= 0
    and items_skipped >= 0 and items_failed >= 0
  )
);

comment on table public.connector_runs is 'Execution log of a connector run.';

-- Serves the admin monitoring list ("latest runs per source") directly.
create index connector_runs_source_started_idx
  on public.connector_runs (source_id, started_at desc);

create index connector_runs_status_idx
  on public.connector_runs (status)
  where status in ('running', 'failed');

-- ---------------------------------------------------------------------------
-- raw_imports
--
-- Verbatim source payloads. Never updated, only inserted.
-- ---------------------------------------------------------------------------
create table public.raw_imports (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid not null references public.sources (id) on delete cascade,
  connector_run_id uuid references public.connector_runs (id) on delete set null,
  external_id      text not null,
  payload          jsonb not null,
  payload_hash     char(64) not null,
  fetched_at       timestamptz not null default now(),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),

  -- An unchanged payload is imported once; a changed one creates a new row,
  -- preserving the full history of what the source delivered.
  constraint raw_imports_content_unique unique (source_id, external_id, payload_hash)
);

comment on table public.raw_imports is
  'Immutable original payloads as delivered by a source. Never mutated.';
comment on column public.raw_imports.payload_hash is
  'SHA-256 over the canonical payload. Identical hashes are skipped by the connector runner.';

create index raw_imports_source_external_idx
  on public.raw_imports (source_id, external_id, fetched_at desc);

create index raw_imports_fetched_idx on public.raw_imports (fetched_at desc);

-- ---------------------------------------------------------------------------
-- normalization_runs
-- ---------------------------------------------------------------------------
create table public.normalization_runs (
  id             uuid primary key default gen_random_uuid(),
  raw_import_id  uuid not null references public.raw_imports (id) on delete cascade,
  source_id      uuid not null references public.sources (id) on delete cascade,
  tender_id      uuid,
  status         public.normalization_run_status not null,
  mapper_version text not null,
  error_message  text,
  created_at     timestamptz not null default now()
);

comment on table public.normalization_runs is
  'Outcome of mapping one raw import into the unified tender model.';
comment on column public.normalization_runs.mapper_version is
  'Version of the mapper that produced the result, so records can be reprocessed selectively.';

create index normalization_runs_raw_import_idx
  on public.normalization_runs (raw_import_id, created_at desc);

create index normalization_runs_failed_idx
  on public.normalization_runs (source_id, created_at desc)
  where status = 'failed';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Source metadata is readable by any authenticated user (it powers the
-- "Quelle" filter). The raw layer is platform-admin only — the UI must never
-- read it, and writes happen through the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.sources            enable row level security;
alter table public.connector_runs     enable row level security;
alter table public.raw_imports        enable row level security;
alter table public.normalization_runs enable row level security;

create policy sources_select on public.sources
  for select to authenticated using (true);

create policy sources_write on public.sources
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy connector_runs_select on public.connector_runs
  for select to authenticated using (true);

create policy raw_imports_admin_only on public.raw_imports
  for select using (public.is_platform_admin());

create policy normalization_runs_admin_only on public.normalization_runs
  for select using (public.is_platform_admin());
