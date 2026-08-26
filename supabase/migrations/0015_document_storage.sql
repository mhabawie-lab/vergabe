-- 0015_document_storage.sql
-- Private document storage for reference, partner and organisation documents.
--
-- Three private buckets and the metadata tables that describe what is in
-- them. Partner documents already had a table (0011); this migration adds the
-- two missing ones and the columns all three need in common.
--
-- WHY PRIVATE. These files are third-party certificates, insurance policies,
-- register extracts and customer paperwork. A public bucket URL for one of
-- those is a data breach that search engines will index. There is therefore
-- no public bucket, no public object URL, and every download goes through a
-- short-lived signed URL created server-side.
--
-- ADDITIVE. New tables, new columns, new policies. Nothing is dropped and no
-- row is touched.
--
-- The `storage` schema is provided by the Supabase platform. Against a plain
-- PostgreSQL used for migration checks it has to be stubbed — see
-- `docs/supabase-setup.md`, section 2.

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

create type public.document_owner_type as enum (
  'reference_project',
  'business_client',
  'partner_company',
  'organization'
);

create type public.document_lifecycle as enum ('active', 'archived');

-- ---------------------------------------------------------------------------
-- Missing columns on the existing partner document table
-- ---------------------------------------------------------------------------

alter table public.partner_documents
  add column if not exists lifecycle public.document_lifecycle not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null,
  -- The name as the user knew it, kept apart from the sanitised object key.
  add column if not exists original_file_name text;

create index if not exists partner_documents_lifecycle_idx
  on public.partner_documents (organization_id, lifecycle);

-- ---------------------------------------------------------------------------
-- Composite tenancy keys on the phase-2 tables
--
-- The partner tables (0011) bind every child to `(id, organization_id)` of its
-- parent, so the tenancy column cannot drift out of step. The reference tables
-- predate that pattern. Adding the keys here lets the document tables use the
-- same guarantee — and costs nothing, since `id` is already the primary key,
-- which makes the pair trivially unique.
-- ---------------------------------------------------------------------------

alter table public.reference_projects
  add constraint reference_projects_id_org unique (id, organization_id);

alter table public.business_clients
  add constraint business_clients_id_org unique (id, organization_id);

-- ---------------------------------------------------------------------------
-- Reference documents
--
-- Attached to a reference project or to a business client — a proof of
-- performance belongs to a project, a framework agreement to the customer.
-- ---------------------------------------------------------------------------

create table public.reference_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  reference_project_id uuid,
  business_client_id uuid,

  credential_type public.credential_type not null default 'reference_proof',
  title text,
  issuer text,
  document_number text,

  -- Object key inside the private bucket. Never a URL.
  storage_path text not null,
  bucket_id text not null default 'reference-documents',
  file_name text not null,
  original_file_name text,
  mime_type text,
  file_size bigint check (file_size >= 0),
  checksum text,

  confidentiality public.confidentiality_level not null default 'confidential',
  scan_status public.document_scan_status not null default 'not_scanned',
  lifecycle public.document_lifecycle not null default 'active',

  valid_from date,
  valid_until date,
  review_status public.credential_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  note text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reference_documents_project_fk
    foreign key (reference_project_id, organization_id)
    references public.reference_projects (id, organization_id) on delete cascade,
  constraint reference_documents_client_fk
    foreign key (business_client_id, organization_id)
    references public.business_clients (id, organization_id) on delete cascade,
  -- Exactly one owner, so "which record does this belong to" always has an
  -- answer and a document can never be orphaned between two.
  constraint reference_documents_one_owner
    check (num_nonnulls(reference_project_id, business_client_id) = 1),
  constraint reference_documents_storage_private
    check (storage_path !~* '^https?://'),
  constraint reference_documents_period
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint reference_documents_archived
    check (lifecycle = 'active' or archived_at is not null),
  constraint reference_documents_unique_path unique (bucket_id, storage_path)
);

create index reference_documents_project_idx
  on public.reference_documents (reference_project_id);
create index reference_documents_client_idx
  on public.reference_documents (business_client_id);
create index reference_documents_expiry_idx
  on public.reference_documents (organization_id, valid_until)
  where valid_until is not null;

create trigger reference_documents_set_updated_at
  before update on public.reference_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation documents
--
-- Our own paperwork: certificates, insurance, quality manuals.
-- ---------------------------------------------------------------------------

create table public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  credential_type public.credential_type not null default 'certificate',
  title text,
  issuer text,
  document_number text,

  storage_path text not null,
  bucket_id text not null default 'organization-documents',
  file_name text not null,
  original_file_name text,
  mime_type text,
  file_size bigint check (file_size >= 0),
  checksum text,

  confidentiality public.confidentiality_level not null default 'internal',
  scan_status public.document_scan_status not null default 'not_scanned',
  lifecycle public.document_lifecycle not null default 'active',

  valid_from date,
  valid_until date,
  review_status public.credential_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  note text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_documents_storage_private
    check (storage_path !~* '^https?://'),
  constraint organization_documents_period
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint organization_documents_archived
    check (lifecycle = 'active' or archived_at is not null),
  constraint organization_documents_unique_path unique (bucket_id, storage_path)
);

create index organization_documents_org_idx
  on public.organization_documents (organization_id, lifecycle);
create index organization_documents_expiry_idx
  on public.organization_documents (organization_id, valid_until)
  where valid_until is not null;

create trigger organization_documents_set_updated_at
  before update on public.organization_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security on the metadata
-- ---------------------------------------------------------------------------

alter table public.reference_documents    enable row level security;
alter table public.organization_documents enable row level security;

create policy reference_documents_select on public.reference_documents
  for select using (public.is_org_member(organization_id));

create policy reference_documents_write on public.reference_documents
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

create policy organization_documents_select on public.organization_documents
  for select using (public.is_org_member(organization_id));

-- Our own paperwork is administered by org_admin only.
create policy organization_documents_write on public.organization_documents
  for all using (
    public.has_org_role(organization_id, array['org_admin']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin']::public.org_role[])
  );

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create trigger reference_documents_audit
  after insert or update or delete on public.reference_documents
  for each row execute function public.log_reference_change();

create trigger organization_documents_audit
  after insert or update or delete on public.organization_documents
  for each row execute function public.log_reference_change();

-- ---------------------------------------------------------------------------
-- Buckets
--
-- All three private. `on conflict do nothing` so re-running the migration
-- against a project where they already exist is harmless — and so it never
-- flips an existing bucket's visibility.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('reference-documents', 'reference-documents', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]),
  ('partner-documents', 'partner-documents', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]),
  ('organization-documents', 'organization-documents', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage policies
--
-- The object key always starts with the organisation:
--
--     <organization_id>/<entity_type>/<entity_id>/<uuid>-<sanitised name>
--
-- so the first path segment is the tenancy key. `storage.foldername(name)` is
-- Supabase's own splitter; taking element 1 and casting it to uuid means a
-- malformed prefix simply fails to match rather than matching everything.
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_organization(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.storage_path_organization is
  'Organisation id from the first path segment of a storage object key, or '
  'null when the key is not organisation-scoped. Used by the storage policies.';

do $$
declare
  bucket text;
  read_buckets constant text[] := array[
    'reference-documents', 'partner-documents', 'organization-documents'
  ];
begin
  foreach bucket in array read_buckets loop
    -- Read: any member of the organisation named by the path prefix.
    execute format(
      'create policy %I on storage.objects for select to authenticated using ('
      '  bucket_id = %L'
      '  and public.storage_path_organization(name) is not null'
      '  and public.is_org_member(public.storage_path_organization(name))'
      ')',
      bucket || '_read', bucket
    );

    -- Delete: same role gate as writing. The application checks the domain
    -- permission on top and normally archives instead of deleting.
    execute format(
      'create policy %I on storage.objects for delete to authenticated using ('
      '  bucket_id = %L'
      '  and public.storage_path_organization(name) is not null'
      '  and public.has_org_role('
      '    public.storage_path_organization(name),'
      '    array[''org_admin'']::public.org_role[]'
      '  )'
      ')',
      bucket || '_delete', bucket
    );
  end loop;
end;
$$;

-- Write: reference and partner documents need bid-manager rights, our own
-- organisation paperwork is administered by org_admin only. `with check` on
-- update as well, so a file cannot be renamed into another organisation.
create policy reference_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reference-documents'
    and public.storage_path_organization(name) is not null
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  );

create policy reference_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'reference-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  )
  with check (
    bucket_id = 'reference-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  );

create policy partner_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-documents'
    and public.storage_path_organization(name) is not null
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  );

create policy partner_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'partner-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  )
  with check (
    bucket_id = 'partner-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin', 'bid_manager']::public.org_role[]
    )
  );

create policy organization_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organization-documents'
    and public.storage_path_organization(name) is not null
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin']::public.org_role[]
    )
  );

create policy organization_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'organization-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin']::public.org_role[]
    )
  )
  with check (
    bucket_id = 'organization-documents'
    and public.has_org_role(
      public.storage_path_organization(name),
      array['org_admin']::public.org_role[]
    )
  );

comment on table public.reference_documents is
  'Documents attached to a reference project or business client. Private '
  'bucket only; downloads go through short-lived signed URLs.';
comment on table public.organization_documents is
  'The organisation''s own certificates and paperwork. Administered by '
  'org_admin.';
