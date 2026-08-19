-- 0005_workspace.sql
-- Per-organisation working data: company profile, favourites, saved searches,
-- watched authorities and the audit log.
--
-- Every table here is tenant-scoped and guarded by RLS through
-- public.is_org_member / public.has_org_role.

-- ---------------------------------------------------------------------------
-- company_profiles
--
-- Drives the match engine from phase 3 and the Unternehmensprofil screen today.
-- ---------------------------------------------------------------------------
create table public.company_profiles (
  organization_id     uuid primary key references public.organizations (id) on delete cascade,
  description         text,
  -- Sectors the company bids in; matched against tenders.sectors.
  sectors             text[] not null default '{}',
  cpv_codes           text[] not null default '{}',
  -- Regions served; matched against tenders.region_code.
  region_codes        text[] not null default '{}',
  country_codes       text[] not null default '{}',
  min_contract_value  numeric(16, 2),
  max_contract_value  numeric(16, 2),
  employee_count      integer,
  founded_year        integer,
  website             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint company_profiles_value_range check (
    min_contract_value is null
    or max_contract_value is null
    or min_contract_value <= max_contract_value
  ),
  constraint company_profiles_employee_count_non_negative check (
    employee_count is null or employee_count >= 0
  )
);

comment on table public.company_profiles is
  'Company profile of an organisation. Input for the match engine.';

create trigger company_profiles_set_updated_at
  before update on public.company_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table public.favorites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tender_id       uuid not null references public.tenders (id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),

  constraint favorites_unique unique (organization_id, tender_id)
);

comment on table public.favorites is 'Tenders bookmarked by an organisation.';

create index favorites_org_idx on public.favorites (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- search_profiles
--
-- Saved filter sets. Filters are stored as jsonb so a new filter dimension
-- does not require a migration.
-- ---------------------------------------------------------------------------
create table public.search_profiles (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  created_by          uuid references public.profiles (id) on delete set null,
  name                text not null,
  filters             jsonb not null default '{}'::jsonb,
  -- Whether new matches trigger a notification (delivery lands in phase 2).
  notifications_enabled boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint search_profiles_name_unique unique (organization_id, name),
  constraint search_profiles_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.search_profiles is 'Saved tender search for an organisation.';

create trigger search_profiles_set_updated_at
  before update on public.search_profiles
  for each row execute function public.set_updated_at();

create index search_profiles_org_idx on public.search_profiles (organization_id);

-- ---------------------------------------------------------------------------
-- watched_authorities
-- ---------------------------------------------------------------------------
create table public.watched_authorities (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  contracting_authority_id uuid not null references public.contracting_authorities (id) on delete cascade,
  created_at               timestamptz not null default now(),

  constraint watched_authorities_unique unique (organization_id, contracting_authority_id)
);

comment on table public.watched_authorities is
  'Contracting authorities an organisation tracks (Auftraggeber-Radar).';

create index watched_authorities_org_idx on public.watched_authorities (organization_id);

-- ---------------------------------------------------------------------------
-- audit_log
--
-- Security-relevant actions (CLAUDE.md § Sicherheit & Secrets). Append-only:
-- no update or delete policy is granted to anyone.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  user_id         uuid references public.profiles (id) on delete set null,
  action          text not null,
  resource_type   text,
  resource_id     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only log of security-relevant actions. Never contains secrets or credentials.';

create index audit_log_org_idx  on public.audit_log (organization_id, created_at desc);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.company_profiles    enable row level security;
alter table public.favorites           enable row level security;
alter table public.search_profiles     enable row level security;
alter table public.watched_authorities enable row level security;
alter table public.audit_log           enable row level security;

create policy company_profiles_select on public.company_profiles
  for select using (public.is_org_member(organization_id));

create policy company_profiles_write on public.company_profiles
  for all using (public.has_org_role(organization_id, array['org_admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.org_role[]));

create policy favorites_select on public.favorites
  for select using (public.is_org_member(organization_id));

create policy favorites_write on public.favorites
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

create policy search_profiles_select on public.search_profiles
  for select using (public.is_org_member(organization_id));

create policy search_profiles_write on public.search_profiles
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

create policy watched_authorities_select on public.watched_authorities
  for select using (public.is_org_member(organization_id));

create policy watched_authorities_write on public.watched_authorities
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

create policy audit_log_select on public.audit_log
  for select using (
    public.has_org_role(organization_id, array['org_admin']::public.org_role[])
  );
