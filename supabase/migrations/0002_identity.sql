-- 0002_identity.sql
-- Organisations, user profiles and role membership.
--
-- SicherVergabe is multi-tenant: business data belongs to an organisation and
-- a user reaches it through organization_members. RLS is enforced on every
-- table (CLAUDE.md § Sicherheit & Secrets).

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  legal_form  text,
  city        text,
  country_code char(2),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint organizations_slug_key unique (slug),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.organizations is 'Tenant: a company using SicherVergabe.';
comment on column public.organizations.is_demo is
  'Demo tenant. Records below it are demo data and must be labelled DEMO in the UI.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles
--
-- Mirrors auth.users with application-level attributes. Created by a trigger
-- so a profile always exists for an authenticated user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  job_title         text,
  phone             text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Application profile for an authenticated user.';
comment on column public.profiles.is_platform_admin is
  'Platform staff only. Grants the super_admin role across organisations.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.org_role not null default 'viewer',
  created_at      timestamptz not null default now(),

  constraint organization_members_unique unique (organization_id, user_id)
);

comment on table public.organization_members is
  'Maps a user to an organisation with exactly one role.';

create index organization_members_user_idx
  on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Authorisation helpers
--
-- SECURITY DEFINER so policies can consult membership without recursing
-- through the RLS on organization_members itself.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  ) or public.is_platform_admin();
$$;

create or replace function public.has_org_role(target_org uuid, allowed public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role = any (allowed)
  ) or public.is_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations         enable row level security;
alter table public.profiles              enable row level security;
alter table public.organization_members  enable row level security;

create policy organizations_select on public.organizations
  for select using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update using (public.has_org_role(id, array['org_admin']::public.org_role[]))
  with check (public.has_org_role(id, array['org_admin']::public.org_role[]));

create policy profiles_select_self on public.profiles
  for select using (id = auth.uid() or public.is_platform_admin());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy organization_members_select on public.organization_members
  for select using (public.is_org_member(organization_id));

create policy organization_members_write on public.organization_members
  for all using (public.has_org_role(organization_id, array['org_admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.org_role[]));
