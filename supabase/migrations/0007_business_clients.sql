-- 0007_business_clients.sql
-- Own business clients and their reference projects.
--
-- These are strictly separate from `contracting_authorities`: an authority is
-- a public body that published a tender, a business client is a customer the
-- organisation already works for. Mixing them would let private commercial
-- relationships leak into shared reference data — so they never share a table.
--
-- Everything here is tenant-private and scoped by organization_id. Unlike the
-- tender tables (shared reference data readable by every authenticated user),
-- these rows are visible only to members of the owning organisation.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.reference_project_status as enum (
  'planned',
  'active',
  'completed',
  'cancelled',
  'unknown'
);

create type public.reference_invoice_status as enum (
  'invoiced',
  'not_invoiced',
  'partially_invoiced',
  'unknown'
);

/**
 * Service categories a reference project can cover.
 *
 * `unknown` is the default and the honest answer whenever the source data
 * does not state the service. It is never replaced by a guess.
 */
create type public.reference_service_category as enum (
  'security',
  'paramedic',
  'cleaning',
  'warehouse',
  'construction_support',
  'facility_management',
  'other',
  'unknown'
);

/** Where a service classification came from. */
create type public.classification_source as enum (
  'name_rule',
  'manual',
  'import_column',
  'ai'
);

create type public.confidentiality_level as enum (
  'internal',
  'confidential',
  'public_reference'
);

create type public.reference_import_status as enum (
  'draft',
  'validated',
  'dry_run',
  'imported',
  'failed',
  'cancelled'
);

create type public.import_row_validation_status as enum (
  'valid',
  'warning',
  'error',
  'skipped',
  'imported'
);

-- ---------------------------------------------------------------------------
-- business_clients
-- ---------------------------------------------------------------------------
create table public.business_clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  -- Lowercased, accent-folded, punctuation-stripped. Used to spot the same
  -- client entered twice under slightly different spellings.
  normalized_name text not null,
  country         char(2),
  website         text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint business_clients_name_not_blank check (length(btrim(name)) > 0),
  -- One client name per organisation. Two organisations may of course share
  -- a customer without seeing each other's record.
  constraint business_clients_unique_per_org unique (organization_id, normalized_name)
);

comment on table public.business_clients is
  'Own business customer of an organisation. Never mixed with contracting_authorities from tender data.';
comment on column public.business_clients.normalized_name is
  'Comparison form of name. Basis for duplicate warnings; the original name is never overwritten.';

create trigger business_clients_set_updated_at
  before update on public.business_clients
  for each row execute function public.set_updated_at();

create index business_clients_org_idx
  on public.business_clients (organization_id, name);

create index business_clients_active_idx
  on public.business_clients (organization_id)
  where is_active;

create index business_clients_name_trgm_idx
  on public.business_clients using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- reference_imports
--
-- Declared before reference_projects because a project may point back at the
-- import run that created it.
-- ---------------------------------------------------------------------------
create table public.reference_imports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  file_name       text not null,
  file_type       text not null,
  status          public.reference_import_status not null default 'draft',
  total_rows      integer not null default 0,
  valid_rows      integer not null default 0,
  warning_rows    integer not null default 0,
  error_rows      integer not null default 0,
  imported_rows   integer not null default 0,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,

  constraint reference_imports_file_type_check
    check (file_type in ('csv', 'xlsx', 'manual')),
  constraint reference_imports_counts_non_negative check (
    total_rows >= 0 and valid_rows >= 0 and warning_rows >= 0
    and error_rows >= 0 and imported_rows >= 0
  )
);

comment on table public.reference_imports is
  'One import run of reference data. A dry run is recorded too, with status = dry_run and imported_rows = 0.';

create index reference_imports_org_idx
  on public.reference_imports (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reference_projects
-- ---------------------------------------------------------------------------
create table public.reference_projects (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  business_client_id     uuid references public.business_clients (id) on delete set null,

  -- The customer's own object number, as printed in their source list.
  external_object_number text,
  project_name           text not null,
  -- What kind of site this is (e.g. "Datacenter"). This is the object type,
  -- NOT a statement about which service was delivered there.
  object_type            text,

  country                char(2),
  region                 text,
  city                   text,
  postal_code            text,
  address                text,

  start_date             date,
  end_date               date,
  project_status         public.reference_project_status not null default 'unknown',
  invoice_status         public.reference_invoice_status not null default 'unknown',

  /**
   * The shift column exactly as delivered, e.g. "218/146/0".
   *
   * The meaning of the individual numbers is NOT established. Nothing in this
   * schema names them, and no code may infer a meaning until the user has
   * confirmed one.
   */
  shift_summary_raw      text,
  -- The same value split into numbers, for arithmetic only. Deriving meaning
  -- from the positions is explicitly out of scope until confirmed.
  shift_values           integer[],

  description            text,
  confidentiality_level  public.confidentiality_level not null default 'internal',
  source_import_id       uuid references public.reference_imports (id) on delete set null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint reference_projects_name_not_blank check (length(btrim(project_name)) > 0),
  constraint reference_projects_date_order check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  -- The customer's object number is unique inside one organisation. Import
  -- relies on this to detect a row that was already imported.
  constraint reference_projects_external_unique
    unique (organization_id, external_object_number)
);

comment on table public.reference_projects is
  'A project already delivered or running for a business client. Input for later match-engine suggestions.';
comment on column public.reference_projects.shift_summary_raw is
  'Shift column verbatim from the source, e.g. "218/146/0". The meaning of the three numbers is unconfirmed and must not be invented.';
comment on column public.reference_projects.shift_values is
  'The raw value split into numbers, for arithmetic only. Position semantics are deliberately undefined.';
comment on column public.reference_projects.object_type is
  'Type of site (e.g. Datacenter). Never to be treated as the delivered service.';

create trigger reference_projects_set_updated_at
  before update on public.reference_projects
  for each row execute function public.set_updated_at();

create index reference_projects_org_idx
  on public.reference_projects (organization_id, created_at desc);

create index reference_projects_client_idx
  on public.reference_projects (business_client_id, start_date desc);

create index reference_projects_location_idx
  on public.reference_projects (organization_id, country, region, city);

create index reference_projects_status_idx
  on public.reference_projects (organization_id, project_status);

create index reference_projects_period_idx
  on public.reference_projects (organization_id, start_date, end_date);

create index reference_projects_name_trgm_idx
  on public.reference_projects using gin (project_name gin_trgm_ops);

create index reference_projects_import_idx
  on public.reference_projects (source_import_id)
  where source_import_id is not null;

-- ---------------------------------------------------------------------------
-- reference_project_services
--
-- A project can cover several services. Every row records where the
-- classification came from and whether a human confirmed it.
-- ---------------------------------------------------------------------------
create table public.reference_project_services (
  id                        uuid primary key default gen_random_uuid(),
  reference_project_id      uuid not null references public.reference_projects (id) on delete cascade,
  service_category          public.reference_service_category not null default 'unknown',
  -- Free-text label as written in the source, when there was one.
  service_label             text,
  classification_source     public.classification_source not null,
  -- 0..1. Only meaningful together with classification_source.
  classification_confidence numeric(3, 2),
  -- False means: a proposal, not a fact. The UI must label it as such.
  confirmed_by_user         boolean not null default false,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint reference_project_services_confidence_range check (
    classification_confidence is null
    or (classification_confidence >= 0 and classification_confidence <= 1)
  ),
  constraint reference_project_services_unique
    unique (reference_project_id, service_category)
);

comment on table public.reference_project_services is
  'Service delivered in a reference project. An unconfirmed row is a proposal, never a fact.';
comment on column public.reference_project_services.confirmed_by_user is
  'Only a confirmed service may feed search-profile suggestions or the match engine.';

create trigger reference_project_services_set_updated_at
  before update on public.reference_project_services
  for each row execute function public.set_updated_at();

create index reference_project_services_project_idx
  on public.reference_project_services (reference_project_id);

create index reference_project_services_confirmed_idx
  on public.reference_project_services (service_category)
  where confirmed_by_user;

-- ---------------------------------------------------------------------------
-- reference_import_rows
--
-- One row per source line. raw_data is never modified; normalized_data holds
-- the cleaned-up proposal alongside it, so the original stays auditable.
-- ---------------------------------------------------------------------------
create table public.reference_import_rows (
  id                   uuid primary key default gen_random_uuid(),
  reference_import_id  uuid not null references public.reference_imports (id) on delete cascade,
  row_number           integer not null,
  -- Verbatim source row. Never overwritten.
  raw_data             jsonb not null,
  -- Normalised proposal. Separate from raw_data by design.
  normalized_data      jsonb not null default '{}'::jsonb,
  validation_status    public.import_row_validation_status not null default 'valid',
  validation_messages  jsonb not null default '[]'::jsonb,
  imported_project_id  uuid references public.reference_projects (id) on delete set null,
  created_at           timestamptz not null default now(),

  constraint reference_import_rows_unique unique (reference_import_id, row_number),
  constraint reference_import_rows_row_number_positive check (row_number > 0)
);

comment on table public.reference_import_rows is
  'One source line of an import. raw_data is immutable; normalized_data holds the proposal beside it.';

create index reference_import_rows_import_idx
  on public.reference_import_rows (reference_import_id, row_number);

create index reference_import_rows_problems_idx
  on public.reference_import_rows (reference_import_id)
  where validation_status in ('warning', 'error');
