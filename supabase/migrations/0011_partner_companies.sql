-- 0011_partner_companies.sql
-- Subunternehmer-Radar — a private, tenant-scoped register of companies we
-- might work with in either direction.
--
-- NAMING. The tables are `partner_companies`, not `subcontractors`. A record
-- here can be a company that may work for us, a company that may hire us, or
-- both; naming the table after only one of those directions would bake the
-- wrong assumption into every query written against it. The user interface
-- keeps the business's own word, "Subunternehmer-Radar".
--
-- NOT a marketplace. There are no accounts for outside companies, no public
-- profiles, no postings and no applications. Every row belongs to exactly one
-- organisation and is readable only by its members (RLS in 0012).
--
-- TENANCY. Every child table carries `organization_id` of its own *and* a
-- composite foreign key onto (id, organization_id) of its parent. The column
-- alone could drift out of step with the parent; the composite key makes that
-- impossible in the database rather than only in application code.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.relationship_direction as enum (
  'can_work_for_us',
  'may_hire_us',
  'both',
  'unknown'
);

create type public.partner_level as enum (
  'main_contractor',
  'subcontractor',
  'sub_subcontractor',
  'further_subcontractor',
  'unknown'
);

create type public.partner_status as enum (
  'prospect',
  'contacted',
  'in_review',
  'qualified',
  'preferred',
  'blocked',
  'inactive',
  'archived'
);

create type public.verification_status as enum (
  'unverified',
  'self_declared',
  'documents_reviewed',
  'verified',
  'expired'
);

create type public.staff_model as enum (
  'own_staff',
  'mixed',
  'further_subcontractors',
  'unknown'
);

create type public.further_subcontracting_status as enum (
  'allowed',
  'not_allowed',
  'unknown'
);

create type public.datacenter_experience_status as enum (
  'confirmed',
  'claimed',
  'none',
  'unknown'
);

-- Finer-grained than `reference_service_category`: that one records what we
-- delivered, this one what a partner offers, where the distinction between
-- guarding a building site and manning a data centre changes the required
-- qualifications.
create type public.partner_service_category as enum (
  'security',
  'construction_site_security',
  'property_protection',
  'reception',
  'datacenter_security',
  'paramedic',
  'cleaning',
  'construction_support',
  'warehouse_logistics',
  'facility_management',
  'fire_watch',
  'other',
  'unknown'
);

create type public.partner_service_confirmation as enum (
  'proposed',
  'confirmed',
  'self_declared',
  'rejected',
  'unknown'
);

create type public.partner_service_source as enum (
  'manual',
  'import_column',
  'partner_statement',
  'document',
  'name_rule'
);

create type public.service_delivery_mode as enum ('own', 'subcontracted', 'unknown');

create type public.availability_status as enum (
  'available',
  'partially_available',
  'booked',
  'unknown'
);

create type public.shift_model as enum (
  'day',
  'night',
  'two_shift',
  'three_shift',
  'around_the_clock',
  'on_call',
  'unknown'
);

create type public.credential_type as enum (
  'trade_registration',
  'commercial_register',
  'guard_permit',
  'liability_insurance',
  'tax_clearance',
  'certificate',
  'qualification',
  'reference_proof',
  'nda',
  'other'
);

create type public.credential_review_status as enum (
  'pending',
  'reviewed',
  'accepted',
  'rejected'
);

-- `not_scanned` is the default and stays the default while no scanner exists.
create type public.document_scan_status as enum ('not_scanned', 'clean', 'infected');

create type public.rate_model as enum (
  'hourly',
  'daily',
  'monthly',
  'per_shift',
  'per_object',
  'flat',
  'other'
);

create type public.negotiation_status as enum (
  'indicative',
  'quoted',
  'negotiated',
  'agreed',
  'expired'
);

create type public.partner_activity_type as enum (
  'call',
  'email',
  'meeting',
  'quote_requested',
  'documents_requested',
  'documents_received',
  'review',
  'internal_note',
  'follow_up',
  'status_change',
  'other'
);

create type public.contact_channel as enum ('email', 'phone', 'mobile', 'unknown');

create type public.partner_signal_type as enum (
  'seeks_subcontractor',
  'seeks_further_subcontractor',
  'seeks_security',
  'seeks_construction_support',
  'seeks_cleaning',
  'new_project',
  'new_datacenter',
  'new_location',
  'growing_staff_demand',
  'available_capacity',
  'leadership_change',
  'credential_expiring',
  'other'
);

create type public.partner_signal_status as enum (
  'new',
  'reviewed',
  'relevant',
  'contacted',
  'done',
  'discarded',
  'expired'
);

create type public.signal_confidence as enum ('low', 'medium', 'high');

create type public.observation_source_type as enum (
  'phone_call',
  'email',
  'meeting',
  'website',
  'press',
  'job_posting',
  'tender_portal',
  'trade_fair',
  'referral',
  'other'
);

create type public.need_status as enum (
  'draft',
  'active',
  'in_review',
  'filled',
  'paused',
  'cancelled',
  'archived'
);

create type public.match_status as enum (
  'proposed',
  'reviewed',
  'shortlisted',
  'contacted',
  'rejected',
  'selected',
  'assigned'
);

create type public.assignment_role as enum (
  'main_contractor',
  'subcontractor',
  'sub_subcontractor',
  'supplier',
  'other'
);

create type public.assignment_status as enum (
  'planned',
  'active',
  'completed',
  'terminated',
  'cancelled'
);

create type public.partner_confidentiality as enum ('internal', 'confidential');

-- ---------------------------------------------------------------------------
-- A. Company master data
-- ---------------------------------------------------------------------------

create table public.partner_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  legal_name text not null,
  -- Comparison form: lower case, accents folded, legal form dropped. Basis of
  -- the uniqueness rule and of the duplicate warning.
  normalized_name text not null,
  trade_name text,

  relationship_direction public.relationship_direction not null default 'unknown',
  partner_level public.partner_level not null default 'unknown',
  status public.partner_status not null default 'prospect',
  verification_status public.verification_status not null default 'unverified',

  country text,
  region text,
  city text,
  postal_code text,
  address text,
  website text,
  email text,
  phone text,

  -- Public identifiers, kept so a later link to public company data has
  -- something to join on. No enrichment happens here.
  registry_name text,
  registry_number text,
  vat_id text,
  lei text,

  staff_model public.staff_model not null default 'unknown',
  further_subcontracting_status public.further_subcontracting_status
    not null default 'unknown',
  datacenter_experience_status public.datacenter_experience_status
    not null default 'unknown',

  is_preferred boolean not null default false,
  is_blocked boolean not null default false,
  blocked_reason text,
  -- Subjective. Labelled as an internal assessment everywhere it is shown.
  internal_rating smallint check (internal_rating between 1 and 5),

  source_type public.observation_source_type,
  source_name text,
  source_url text,
  first_observed_at timestamptz,
  last_verified_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,

  internal_notes text,
  -- Reference only. A customer and a partner stay two records even when they
  -- are the same firm: the two relationships have different confidentiality.
  linked_business_client_id uuid references public.business_clients (id)
    on delete set null,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  -- A block without a reason is unusable six months later.
  constraint partner_companies_blocked_reason
    check (not is_blocked or blocked_reason is not null),
  -- Target of the composite foreign keys of every child table.
  constraint partner_companies_id_org unique (id, organization_id),
  -- The same company may exist independently in two organisations.
  constraint partner_companies_unique_name unique (organization_id, normalized_name)
);

create index partner_companies_org_name_idx
  on public.partner_companies (organization_id, legal_name);
create index partner_companies_org_status_idx
  on public.partner_companies (organization_id, status);
create index partner_companies_org_direction_idx
  on public.partner_companies (organization_id, relationship_direction);
create index partner_companies_follow_up_idx
  on public.partner_companies (organization_id, next_follow_up_at)
  where next_follow_up_at is not null and archived_at is null;
create index partner_companies_name_trgm_idx
  on public.partner_companies using gin (legal_name gin_trgm_ops);
-- Registry identifiers are the strongest duplicate signal there is.
create unique index partner_companies_registry_idx
  on public.partner_companies (organization_id, country, registry_number)
  where registry_number is not null;
create unique index partner_companies_vat_idx
  on public.partner_companies (organization_id, vat_id)
  where vat_id is not null;

create trigger partner_companies_set_updated_at
  before update on public.partner_companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- B. Contacts
-- ---------------------------------------------------------------------------

create table public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  first_name text,
  last_name text not null,
  role text,
  business_email text,
  business_phone text,
  preferred_channel public.contact_channel not null default 'unknown',

  source_type public.observation_source_type,
  last_verified_at timestamptz,
  internal_note text,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_contacts_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade
);

create index partner_contacts_company_idx
  on public.partner_contacts (partner_company_id) where is_active;

create trigger partner_contacts_set_updated_at
  before update on public.partner_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- C. Services
-- ---------------------------------------------------------------------------

create table public.partner_services (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  service_category public.partner_service_category not null default 'unknown',
  service_label text,
  -- Only `confirmed` counts as evidence. `self_declared` is what the company
  -- told us and is deliberately not the same thing.
  confirmation public.partner_service_confirmation not null default 'proposed',
  confirmation_source public.partner_service_source not null default 'manual',

  capacity_note text,
  available_staff integer check (available_staff >= 0),
  delivery_mode public.service_delivery_mode not null default 'unknown',
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_services_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_services_unique unique (partner_company_id, service_category)
);

create index partner_services_category_idx
  on public.partner_services (organization_id, service_category, confirmation);
create index partner_services_company_idx
  on public.partner_services (partner_company_id);

create trigger partner_services_set_updated_at
  before update on public.partner_services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- D. Service regions
-- ---------------------------------------------------------------------------

create table public.partner_service_regions (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  country text,
  region text,
  city text,
  radius_km integer check (radius_km >= 0),
  nationwide boolean not null default false,
  willing_to_travel boolean not null default false,
  is_confirmed boolean not null default false,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_service_regions_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade
);

create index partner_service_regions_company_idx
  on public.partner_service_regions (partner_company_id);
create index partner_service_regions_lookup_idx
  on public.partner_service_regions (organization_id, country, region, city);

create trigger partner_service_regions_set_updated_at
  before update on public.partner_service_regions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- E. Availability
-- ---------------------------------------------------------------------------

create table public.partner_availability (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  service_category public.partner_service_category,
  available_from date,
  available_until date,
  status public.availability_status not null default 'unknown',
  available_staff integer check (available_staff >= 0),
  shift_model public.shift_model not null default 'unknown',
  night_shift boolean not null default false,
  weekend boolean not null default false,
  around_the_clock boolean not null default false,
  short_notice boolean not null default false,
  note text,
  -- Availability goes stale. The application shows how old this is rather
  -- than treating an old entry as current.
  last_confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_availability_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_availability_period
    check (available_until is null or available_from is null
           or available_until >= available_from)
);

create index partner_availability_company_idx
  on public.partner_availability (partner_company_id);
create index partner_availability_window_idx
  on public.partner_availability (organization_id, available_from, available_until);

create trigger partner_availability_set_updated_at
  before update on public.partner_availability
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- F. Qualifications and documents
-- ---------------------------------------------------------------------------

create table public.partner_qualifications (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  credential_type public.credential_type not null,
  title text,
  issuer text,
  document_number text,
  valid_from date,
  -- Never guessed. A missing expiry stays missing.
  valid_until date,
  review_status public.credential_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_qualifications_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_qualifications_period
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint partner_qualifications_reviewed
    check (review_status = 'pending' or reviewed_at is not null),
  -- Target of the composite key from partner_documents.
  constraint partner_qualifications_id_org unique (id, organization_id)
);

create index partner_qualifications_company_idx
  on public.partner_qualifications (partner_company_id);
-- Drives the expiry monitor; stays small because undated rows are excluded.
create index partner_qualifications_expiry_idx
  on public.partner_qualifications (organization_id, valid_until)
  where valid_until is not null;

create trigger partner_qualifications_set_updated_at
  before update on public.partner_qualifications
  for each row execute function public.set_updated_at();

create table public.partner_documents (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,
  partner_qualification_id uuid,

  credential_type public.credential_type not null default 'other',
  -- Path inside a PRIVATE bucket. Never a public URL: access is granted only
  -- through short-lived signed URLs created server-side.
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint check (file_size >= 0),
  checksum text,
  confidentiality public.partner_confidentiality not null default 'confidential',
  scan_status public.document_scan_status not null default 'not_scanned',

  valid_from date,
  valid_until date,
  review_status public.credential_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  note text,
  uploaded_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_documents_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_documents_qualification_fk
    foreign key (partner_qualification_id, organization_id)
    references public.partner_qualifications (id, organization_id) on delete set null,
  constraint partner_documents_storage_private
    check (storage_path !~* '^https?://'),
  constraint partner_documents_period
    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index partner_documents_company_idx
  on public.partner_documents (partner_company_id);
create index partner_documents_expiry_idx
  on public.partner_documents (organization_id, valid_until)
  where valid_until is not null;

create trigger partner_documents_set_updated_at
  before update on public.partner_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- G. Rates — the most confidential table in this schema
-- ---------------------------------------------------------------------------

create table public.partner_rates (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,

  service_category public.partner_service_category,
  region text,
  rate_model public.rate_model not null default 'hourly',
  unit text,
  net_amount numeric(12, 2) check (net_amount >= 0),
  currency text not null default 'EUR',
  valid_from date,
  valid_until date,
  surcharges text,
  negotiation_status public.negotiation_status not null default 'indicative',
  internal_note text,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_rates_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_rates_period
    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index partner_rates_company_idx on public.partner_rates (partner_company_id);

create trigger partner_rates_set_updated_at
  before update on public.partner_rates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- H. Activities and follow-ups
-- ---------------------------------------------------------------------------

create table public.partner_activities (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null,
  organization_id uuid not null,
  partner_contact_id uuid,

  activity_type public.partner_activity_type not null,
  occurred_at timestamptz not null default now(),
  summary text,
  outcome text,
  next_action text,
  follow_up_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_activities_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint partner_activities_contact_fk
    foreign key (partner_contact_id) references public.partner_contacts (id)
    on delete set null
);

create index partner_activities_company_idx
  on public.partner_activities (partner_company_id, occurred_at desc);
create index partner_activities_follow_up_idx
  on public.partner_activities (organization_id, follow_up_at)
  where follow_up_at is not null;

create trigger partner_activities_set_updated_at
  before update on public.partner_activities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- I. Signals — observations, never facts
-- ---------------------------------------------------------------------------

create table public.partner_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  partner_company_id uuid,
  -- Lets an observation be recorded before the company exists as a record.
  company_name_raw text,

  signal_type public.partner_signal_type not null,
  service_category public.partner_service_category,
  project_name text,
  country text,
  region text,
  city text,
  description text,

  -- Provenance is mandatory: an observation without a source is a rumour and
  -- must not appear anywhere as a stated fact.
  source_type public.observation_source_type not null,
  source_name text,
  source_url text,
  observed_at date not null,
  valid_until date,
  confidence public.signal_confidence not null default 'low',

  status public.partner_signal_status not null default 'new',
  assigned_to uuid references public.profiles (id) on delete set null,
  next_action text,
  follow_up_at timestamptz,
  internal_note text,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partner_signals_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete set null,
  -- Either a linked company or a written-down name; an anonymous signal is
  -- not actionable.
  constraint partner_signals_subject
    check (partner_company_id is not null or company_name_raw is not null),
  constraint partner_signals_period
    check (valid_until is null or valid_until >= observed_at)
);

create index partner_signals_org_status_idx
  on public.partner_signals (organization_id, status, observed_at desc);
create index partner_signals_company_idx on public.partner_signals (partner_company_id);
create index partner_signals_type_idx
  on public.partner_signals (organization_id, signal_type);
create index partner_signals_follow_up_idx
  on public.partner_signals (organization_id, follow_up_at)
  where follow_up_at is not null;

create trigger partner_signals_set_updated_at
  before update on public.partner_signals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- J. Our own demand
-- ---------------------------------------------------------------------------

create table public.subcontractor_needs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  title text not null,
  reference_project_id uuid references public.reference_projects (id) on delete set null,
  tender_id uuid references public.tenders (id) on delete set null,
  project_type text,
  service_category public.partner_service_category not null,

  country text,
  region text,
  city text,
  site_address text,
  radius_km integer check (radius_km >= 0),

  start_date date,
  end_date date,
  required_staff integer check (required_staff >= 0),
  shift_model public.shift_model not null default 'unknown',
  around_the_clock boolean not null default false,
  night_work boolean not null default false,
  weekend_work boolean not null default false,

  required_qualifications text[] not null default '{}',
  required_credentials public.credential_type[] not null default '{}',
  further_subcontracting_allowed public.further_subcontracting_status
    not null default 'unknown',
  target_budget numeric(12, 2) check (target_budget >= 0),
  currency text not null default 'EUR',
  confidentiality public.partner_confidentiality not null default 'confidential',

  status public.need_status not null default 'draft',
  internal_note text,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subcontractor_needs_period
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint subcontractor_needs_id_org unique (id, organization_id)
);

create index subcontractor_needs_org_status_idx
  on public.subcontractor_needs (organization_id, status);
create index subcontractor_needs_service_idx
  on public.subcontractor_needs (organization_id, service_category);

create trigger subcontractor_needs_set_updated_at
  before update on public.subcontractor_needs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- K. Matches
-- ---------------------------------------------------------------------------

create table public.subcontractor_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  need_id uuid not null,
  partner_company_id uuid not null,

  total_score numeric(5, 2) not null check (total_score between 0 and 100),
  -- Which rule set produced the figure. A score without its version cannot be
  -- compared with one computed later.
  score_version text not null,
  service_score numeric(5, 2) not null default 0,
  region_score numeric(5, 2) not null default 0,
  availability_score numeric(5, 2) not null default 0,
  capacity_score numeric(5, 2) not null default 0,
  credential_score numeric(5, 2) not null default 0,
  datacenter_score numeric(5, 2) not null default 0,

  exclusion_reason text,
  missing_information text[] not null default '{}',
  -- The per-component explanation, shown in full in the UI.
  reasoning jsonb not null default '[]'::jsonb,

  status public.match_status not null default 'proposed',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subcontractor_matches_need_fk
    foreign key (need_id, organization_id)
    references public.subcontractor_needs (id, organization_id) on delete cascade,
  constraint subcontractor_matches_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint subcontractor_matches_unique unique (need_id, partner_company_id)
);

create index subcontractor_matches_need_idx
  on public.subcontractor_matches (need_id, total_score desc);
create index subcontractor_matches_company_idx
  on public.subcontractor_matches (partner_company_id);

create trigger subcontractor_matches_set_updated_at
  before update on public.subcontractor_matches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- L. Assignments and the subcontracting chain
-- ---------------------------------------------------------------------------

create table public.subcontractor_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  partner_company_id uuid not null,

  reference_project_id uuid references public.reference_projects (id) on delete set null,
  need_id uuid,

  role public.assignment_role not null default 'subcontractor',
  -- Self reference: the chain. Null means the partner is engaged by us.
  parent_assignment_id uuid references public.subcontractor_assignments (id)
    on delete cascade,
  chain_level smallint not null default 1 check (chain_level between 1 and 6),
  contract_partner_company_id uuid,

  scope text,
  staff_count integer check (staff_count >= 0),
  start_date date,
  end_date date,
  further_subcontracting_allowed public.further_subcontracting_status
    not null default 'unknown',
  status public.assignment_status not null default 'planned',
  internal_rating smallint check (internal_rating between 1 and 5),
  note text,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subcontractor_assignments_company_fk
    foreign key (partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete cascade,
  constraint subcontractor_assignments_need_fk
    foreign key (need_id, organization_id)
    references public.subcontractor_needs (id, organization_id) on delete set null,
  constraint subcontractor_assignments_contract_partner_fk
    foreign key (contract_partner_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete set null,
  constraint subcontractor_assignments_not_self
    check (parent_assignment_id is null or parent_assignment_id <> id),
  constraint subcontractor_assignments_period
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint subcontractor_assignments_id_org unique (id, organization_id)
);

create index subcontractor_assignments_company_idx
  on public.subcontractor_assignments (partner_company_id);
create index subcontractor_assignments_project_idx
  on public.subcontractor_assignments (organization_id, reference_project_id);
create index subcontractor_assignments_parent_idx
  on public.subcontractor_assignments (parent_assignment_id);

create trigger subcontractor_assignments_set_updated_at
  before update on public.subcontractor_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- M. Import protocol — same shape as the reference import of phase 2
-- ---------------------------------------------------------------------------

create table public.partner_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('csv', 'xlsx', 'manual')),
  status public.reference_import_status not null default 'dry_run',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  imported_rows integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint partner_imports_id_org unique (id, organization_id)
);

create index partner_imports_org_idx
  on public.partner_imports (organization_id, created_at desc);

create table public.partner_import_rows (
  id uuid primary key default gen_random_uuid(),
  partner_import_id uuid not null,
  organization_id uuid not null,
  row_number integer not null,
  -- The source row, untouched. Never overwritten.
  raw_data jsonb not null,
  -- The cleaned proposal, stored alongside rather than on top of it.
  normalized_data jsonb not null default '{}'::jsonb,
  validation_status public.import_row_validation_status not null default 'valid',
  validation_messages jsonb not null default '[]'::jsonb,
  imported_company_id uuid,
  created_at timestamptz not null default now(),

  constraint partner_import_rows_import_fk
    foreign key (partner_import_id, organization_id)
    references public.partner_imports (id, organization_id) on delete cascade,
  constraint partner_import_rows_company_fk
    foreign key (imported_company_id, organization_id)
    references public.partner_companies (id, organization_id) on delete set null
);

create index partner_import_rows_import_idx
  on public.partner_import_rows (partner_import_id, row_number);

comment on table public.partner_companies is
  'Tenant-private register of possible subcontractors and possible clients. '
  'Not a marketplace: outside companies have no accounts and no visibility.';
comment on column public.partner_companies.internal_rating is
  'Subjective internal assessment 1-5. Never an objective quality measure.';
comment on table public.partner_signals is
  'Observations about companies, each with a mandatory source. An observation '
  'is never presented as an established fact.';
comment on table public.partner_rates is
  'Negotiated conditions. Requires the subcontractors:financial permission.';
