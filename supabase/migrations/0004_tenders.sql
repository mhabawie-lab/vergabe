-- 0004_tenders.sql
-- The unified tender model — the only layer the UI reads from.
--
-- Sized for millions of rows: every column the search screen filters on is
-- indexed, list queries are covered by composite indexes ordered the way the
-- UI sorts, and partial indexes keep the hot "open tenders" working set small.

-- ---------------------------------------------------------------------------
-- contracting_authorities
-- ---------------------------------------------------------------------------
create table public.contracting_authorities (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.sources (id) on delete cascade,
  external_id    text,
  name           text not null,
  authority_type text,
  street         text,
  postal_code    text,
  city           text,
  region_code    text,
  country_code   char(2),
  email          text,
  phone          text,
  website        text,
  -- Normalised name used to merge the same authority across sources.
  dedupe_key     text not null,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint contracting_authorities_external_unique unique (source_id, external_id),
  constraint contracting_authorities_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.contracting_authorities is 'Auftraggeber (contracting authority).';
comment on column public.contracting_authorities.dedupe_key is
  'Lowercased, punctuation-stripped name plus city. Groups the same authority across sources.';

create trigger contracting_authorities_set_updated_at
  before update on public.contracting_authorities
  for each row execute function public.set_updated_at();

create index contracting_authorities_dedupe_idx
  on public.contracting_authorities (dedupe_key);

create index contracting_authorities_name_trgm_idx
  on public.contracting_authorities using gin (name gin_trgm_ops);

create index contracting_authorities_region_idx
  on public.contracting_authorities (country_code, region_code);

-- ---------------------------------------------------------------------------
-- tenders
--
-- Future scaling note: once row counts approach the high tens of millions,
-- convert this into a range-partitioned table on publication_date. The index
-- definitions below carry over unchanged, so the migration stays mechanical.
-- ---------------------------------------------------------------------------
create table public.tenders (
  id                        uuid primary key default gen_random_uuid(),

  -- Provenance. Required for every record (CLAUDE.md § Rohdaten).
  source_id                 uuid not null references public.sources (id) on delete cascade,
  external_id               text not null,
  raw_import_id             uuid references public.raw_imports (id) on delete set null,
  source_url                text,
  original_language         char(2) not null default 'de',

  -- Duplicate detection across sources.
  fingerprint               char(64) not null,
  dedupe_group_id           uuid,

  -- Core content.
  title                     text not null,
  summary                   text,
  description               text,
  reference_number          text,
  procurement_type          public.procurement_type not null default 'services',
  procedure_type            public.procedure_type,

  -- Classification.
  cpv_codes                 text[] not null default '{}',
  sectors                   text[] not null default '{}',
  nuts_codes                text[] not null default '{}',

  -- Location.
  country_code              char(2),
  region_code               text,
  city                      text,
  postal_code               text,

  -- Authority.
  contracting_authority_id  uuid references public.contracting_authorities (id) on delete set null,

  -- Dates.
  publication_date          timestamptz,
  submission_deadline       timestamptz,
  question_deadline         timestamptz,
  binding_period_end        timestamptz,
  contract_start            date,
  contract_end              date,
  duration_months           integer,

  -- Value.
  estimated_value_net       numeric(16, 2),
  currency                  char(3) not null default 'EUR',

  status                    public.tender_status not null default 'published',

  -- Source-specific fields with no place in the unified model.
  source_extras             jsonb not null default '{}'::jsonb,

  is_demo                   boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- German-language full-text index. Title outranks body text.
  search_vector tsvector generated always as (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(reference_number, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('german', coalesce(city, '')), 'B')
  ) stored,

  constraint tenders_source_external_unique unique (source_id, external_id),
  constraint tenders_title_not_blank check (length(btrim(title)) > 0),
  constraint tenders_duration_positive check (duration_months is null or duration_months > 0),
  constraint tenders_value_non_negative check (
    estimated_value_net is null or estimated_value_net >= 0
  )
);

comment on table public.tenders is
  'Unified tender record. The only tender source the UI reads from.';
comment on column public.tenders.fingerprint is
  'SHA-256 over normalised title, authority, deadline and value. Candidate key for cross-source duplicates.';
comment on column public.tenders.dedupe_group_id is
  'Set once duplicates across sources have been confirmed; all members share one group id.';
comment on column public.tenders.source_extras is
  'Source-specific fields. Keeps the shared columns stable as new connectors are added.';
comment on column public.tenders.is_demo is
  'Demo record. Must be rendered with a DEMO badge and never presented as live data.';

create trigger tenders_set_updated_at
  before update on public.tenders
  for each row execute function public.set_updated_at();

-- Full-text search.
create index tenders_search_idx on public.tenders using gin (search_vector);

-- Fuzzy title matching, used by duplicate detection and typo-tolerant search.
create index tenders_title_trgm_idx on public.tenders using gin (title gin_trgm_ops);

-- Array containment filters (CPV, sector, NUTS).
create index tenders_cpv_idx     on public.tenders using gin (cpv_codes);
create index tenders_sectors_idx on public.tenders using gin (sectors);
create index tenders_nuts_idx    on public.tenders using gin (nuts_codes);

-- Default list ordering: newest first, filtered by status.
create index tenders_status_published_idx
  on public.tenders (status, publication_date desc nulls last);

-- Deadline screen. Partial: only tenders still open can have a pending deadline,
-- which keeps this index small even as the archive grows.
create index tenders_open_deadline_idx
  on public.tenders (submission_deadline)
  where status in ('published', 'amended') and submission_deadline is not null;

create index tenders_authority_idx
  on public.tenders (contracting_authority_id, publication_date desc);

create index tenders_source_idx
  on public.tenders (source_id, publication_date desc);

create index tenders_location_idx
  on public.tenders (country_code, region_code, city);

create index tenders_value_idx
  on public.tenders (estimated_value_net)
  where estimated_value_net is not null;

create index tenders_fingerprint_idx on public.tenders (fingerprint);

create index tenders_dedupe_group_idx
  on public.tenders (dedupe_group_id)
  where dedupe_group_id is not null;

-- Lets the UI separate demo from live data cheaply.
create index tenders_demo_idx on public.tenders (is_demo, publication_date desc);

-- ---------------------------------------------------------------------------
-- tender_lots
-- ---------------------------------------------------------------------------
create table public.tender_lots (
  id                  uuid primary key default gen_random_uuid(),
  tender_id           uuid not null references public.tenders (id) on delete cascade,
  lot_number          text not null,
  title               text not null,
  description         text,
  estimated_value_net numeric(16, 2),
  cpv_codes           text[] not null default '{}',
  created_at          timestamptz not null default now(),

  constraint tender_lots_unique unique (tender_id, lot_number)
);

comment on table public.tender_lots is 'Lot (Los) of a divided tender.';

create index tender_lots_tender_idx on public.tender_lots (tender_id);

-- ---------------------------------------------------------------------------
-- tender_requirements
--
-- Phase 1 fills these from the normalizer where the source supplies them.
-- Phase 3 adds AI-extracted requirements against the same table.
-- ---------------------------------------------------------------------------
create table public.tender_requirements (
  id          uuid primary key default gen_random_uuid(),
  tender_id   uuid not null references public.tenders (id) on delete cascade,
  category    public.requirement_category not null,
  label       text not null,
  description text,
  mandatory   boolean not null default true,
  -- Provenance of the requirement: 'source' now, 'ai' from phase 3.
  origin      text not null default 'source',
  created_at  timestamptz not null default now(),

  constraint tender_requirements_origin_check check (origin in ('source', 'ai', 'manual'))
);

comment on table public.tender_requirements is
  'Structured eligibility, staffing and evidence requirements of a tender.';

create index tender_requirements_tender_idx
  on public.tender_requirements (tender_id, category);

-- ---------------------------------------------------------------------------
-- tender_documents
--
-- Phase 1 records the document metadata a source advertises. The automatic
-- download and text extraction stages (phase 3) fill storage_path and the
-- extraction table.
-- ---------------------------------------------------------------------------
create table public.tender_documents (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tenders (id) on delete cascade,
  title           text not null,
  file_type       text,
  file_size_bytes bigint,
  source_url      text,
  storage_path    text,
  checksum        char(64),
  download_status public.document_download_status not null default 'pending',
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tender_documents_size_non_negative check (
    file_size_bytes is null or file_size_bytes >= 0
  )
);

comment on table public.tender_documents is 'Procurement document attached to a tender.';

create trigger tender_documents_set_updated_at
  before update on public.tender_documents
  for each row execute function public.set_updated_at();

create index tender_documents_tender_idx on public.tender_documents (tender_id);

create index tender_documents_pending_idx
  on public.tender_documents (download_status)
  where download_status = 'pending';

-- ---------------------------------------------------------------------------
-- awards
-- ---------------------------------------------------------------------------
create table public.awards (
  id                       uuid primary key default gen_random_uuid(),
  tender_id                uuid references public.tenders (id) on delete cascade,
  contracting_authority_id uuid references public.contracting_authorities (id) on delete set null,
  source_id                uuid not null references public.sources (id) on delete cascade,
  external_id              text,
  winner_name              text not null,
  winner_city              text,
  award_value_net          numeric(16, 2),
  currency                 char(3) not null default 'EUR',
  award_date               date,
  bidder_count             integer,
  source_url               text,
  is_demo                  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint awards_external_unique unique (source_id, external_id),
  constraint awards_bidder_count_positive check (bidder_count is null or bidder_count > 0)
);

comment on table public.awards is 'Award (Zuschlag) closing out a tender.';

create trigger awards_set_updated_at
  before update on public.awards
  for each row execute function public.set_updated_at();

create index awards_tender_idx    on public.awards (tender_id);
create index awards_authority_idx on public.awards (contracting_authority_id, award_date desc);
create index awards_date_idx      on public.awards (award_date desc nulls last);
create index awards_winner_trgm_idx
  on public.awards using gin (winner_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- tender_duplicate_candidates
--
-- Cross-source duplicate detection (CLAUDE.md § Rohdaten). Phase 1 records
-- exact fingerprint collisions; later phases add fuzzy scoring.
-- ---------------------------------------------------------------------------
create table public.tender_duplicate_candidates (
  id               uuid primary key default gen_random_uuid(),
  tender_id        uuid not null references public.tenders (id) on delete cascade,
  duplicate_of_id  uuid not null references public.tenders (id) on delete cascade,
  similarity_score numeric(5, 4) not null,
  detection_method text not null,
  status           text not null default 'pending',
  created_at       timestamptz not null default now(),

  constraint tender_duplicate_candidates_unique unique (tender_id, duplicate_of_id),
  constraint tender_duplicate_candidates_distinct check (tender_id <> duplicate_of_id),
  constraint tender_duplicate_candidates_score_range check (
    similarity_score >= 0 and similarity_score <= 1
  ),
  constraint tender_duplicate_candidates_status_check check (
    status in ('pending', 'confirmed', 'rejected')
  )
);

comment on table public.tender_duplicate_candidates is
  'Candidate duplicate pairs across sources, awaiting confirmation.';

create index tender_duplicate_candidates_pending_idx
  on public.tender_duplicate_candidates (status, created_at desc)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Tender data is shared reference data: every authenticated user may read it.
-- Writes happen exclusively through the ingestion pipeline using the service
-- role, which bypasses RLS — so no write policy is granted to end users.
-- ---------------------------------------------------------------------------
alter table public.contracting_authorities    enable row level security;
alter table public.tenders                    enable row level security;
alter table public.tender_lots                enable row level security;
alter table public.tender_requirements        enable row level security;
alter table public.tender_documents           enable row level security;
alter table public.awards                     enable row level security;
alter table public.tender_duplicate_candidates enable row level security;

create policy contracting_authorities_select on public.contracting_authorities
  for select to authenticated using (true);

create policy tenders_select on public.tenders
  for select to authenticated using (true);

create policy tender_lots_select on public.tender_lots
  for select to authenticated using (true);

create policy tender_requirements_select on public.tender_requirements
  for select to authenticated using (true);

create policy tender_documents_select on public.tender_documents
  for select to authenticated using (true);

create policy awards_select on public.awards
  for select to authenticated using (true);

create policy tender_duplicate_candidates_select on public.tender_duplicate_candidates
  for select using (public.is_platform_admin());
