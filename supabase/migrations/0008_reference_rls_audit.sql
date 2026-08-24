-- 0008_reference_rls_audit.sql
-- Row Level Security and audit logging for the reference data of phase 2.
--
-- Reference data is commercially sensitive: it names real customers and real
-- sites. Unlike tender data it is therefore NOT readable by every
-- authenticated user — only by members of the owning organisation.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.business_clients            enable row level security;
alter table public.reference_projects          enable row level security;
alter table public.reference_project_services  enable row level security;
alter table public.reference_imports           enable row level security;
alter table public.reference_import_rows       enable row level security;

-- --- business_clients ------------------------------------------------------
create policy business_clients_select on public.business_clients
  for select using (public.is_org_member(organization_id));

create policy business_clients_write on public.business_clients
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

-- --- reference_projects ----------------------------------------------------
create policy reference_projects_select on public.reference_projects
  for select using (public.is_org_member(organization_id));

create policy reference_projects_write on public.reference_projects
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

-- --- reference_project_services --------------------------------------------
-- Services have no organization_id of their own; tenancy is inherited from the
-- parent project, which is why both policies join through it.
create policy reference_project_services_select on public.reference_project_services
  for select using (
    exists (
      select 1
      from public.reference_projects p
      where p.id = reference_project_id
        and public.is_org_member(p.organization_id)
    )
  );

create policy reference_project_services_write on public.reference_project_services
  for all using (
    exists (
      select 1
      from public.reference_projects p
      where p.id = reference_project_id
        and public.has_org_role(
          p.organization_id,
          array['org_admin', 'bid_manager']::public.org_role[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.reference_projects p
      where p.id = reference_project_id
        and public.has_org_role(
          p.organization_id,
          array['org_admin', 'bid_manager']::public.org_role[]
        )
    )
  );

-- --- reference_imports -----------------------------------------------------
create policy reference_imports_select on public.reference_imports
  for select using (public.is_org_member(organization_id));

create policy reference_imports_write on public.reference_imports
  for all using (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_admin', 'bid_manager']::public.org_role[])
  );

-- --- reference_import_rows -------------------------------------------------
create policy reference_import_rows_select on public.reference_import_rows
  for select using (
    exists (
      select 1
      from public.reference_imports i
      where i.id = reference_import_id
        and public.is_org_member(i.organization_id)
    )
  );

create policy reference_import_rows_write on public.reference_import_rows
  for all using (
    exists (
      select 1
      from public.reference_imports i
      where i.id = reference_import_id
        and public.has_org_role(
          i.organization_id,
          array['org_admin', 'bid_manager']::public.org_role[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.reference_imports i
      where i.id = reference_import_id
        and public.has_org_role(
          i.organization_id,
          array['org_admin', 'bid_manager']::public.org_role[]
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Audit logging
--
-- Insert, update and delete on customer data are security-relevant actions
-- (CLAUDE.md § Sicherheit). The trigger records who did what to which record —
-- deliberately without copying the row contents, so the append-only audit log
-- never becomes a second store of customer data.
-- ---------------------------------------------------------------------------
create or replace function public.log_reference_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  target_id  uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
  else
    target_id := new.id;
  end if;

  -- Resolve the owning organisation. Child tables inherit it from their parent.
  if tg_table_name in ('business_clients', 'reference_projects', 'reference_imports') then
    if tg_op = 'DELETE' then
      target_org := old.organization_id;
    else
      target_org := new.organization_id;
    end if;
  elsif tg_table_name = 'reference_project_services' then
    select p.organization_id into target_org
    from public.reference_projects p
    where p.id = coalesce(new.reference_project_id, old.reference_project_id);
  elsif tg_table_name = 'reference_import_rows' then
    select i.organization_id into target_org
    from public.reference_imports i
    where i.id = coalesce(new.reference_import_id, old.reference_import_id);
  end if;

  insert into public.audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
  values (
    target_org,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    target_id::text,
    -- Metadata only. Never the row itself.
    jsonb_build_object('operation', tg_op)
  );

  return coalesce(new, old);
end;
$$;

comment on function public.log_reference_change() is
  'Records changes to reference data in audit_log. Stores metadata only, never customer data itself.';

create trigger business_clients_audit
  after insert or update or delete on public.business_clients
  for each row execute function public.log_reference_change();

create trigger reference_projects_audit
  after insert or update or delete on public.reference_projects
  for each row execute function public.log_reference_change();

create trigger reference_project_services_audit
  after insert or update or delete on public.reference_project_services
  for each row execute function public.log_reference_change();

create trigger reference_imports_audit
  after insert or update or delete on public.reference_imports
  for each row execute function public.log_reference_change();

-- ---------------------------------------------------------------------------
-- Guard: reference data must never be attached to a demo organisation without
-- being marked as such. Phase 2 has no demo reference data at all — this
-- constraint documents and enforces that decision.
-- ---------------------------------------------------------------------------
create or replace function public.reject_demo_reference_data()
returns trigger
language plpgsql
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

comment on function public.reject_demo_reference_data() is
  'Blocks reference data on demo organisations, so real customer records can never be presented as demo data or vice versa.';

create trigger business_clients_reject_demo
  before insert on public.business_clients
  for each row execute function public.reject_demo_reference_data();

create trigger reference_projects_reject_demo
  before insert on public.reference_projects
  for each row execute function public.reject_demo_reference_data();
