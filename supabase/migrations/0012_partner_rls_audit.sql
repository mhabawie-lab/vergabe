-- 0012_partner_rls_audit.sql
-- Row Level Security and audit logging for the Subunternehmer-Radar.
--
-- Every table here is tenant-private. Read access is limited to members of
-- the owning organisation; write access to org_admin and bid_manager.
--
-- Two tables are narrower still: `partner_rates` holds negotiated prices and
-- `partner_documents` holds third-party papers. RLS cannot see the
-- application's permission set, so it enforces the organisation and the role,
-- and the route handlers enforce `subcontractors:financial` and
-- `subcontractors:documents` on top. Both layers have to agree before a row
-- is served.

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.partner_companies          enable row level security;
alter table public.partner_contacts           enable row level security;
alter table public.partner_services           enable row level security;
alter table public.partner_service_regions    enable row level security;
alter table public.partner_availability       enable row level security;
alter table public.partner_qualifications     enable row level security;
alter table public.partner_documents          enable row level security;
alter table public.partner_rates              enable row level security;
alter table public.partner_activities         enable row level security;
alter table public.partner_signals            enable row level security;
alter table public.subcontractor_needs        enable row level security;
alter table public.subcontractor_matches      enable row level security;
alter table public.subcontractor_assignments  enable row level security;
alter table public.partner_imports            enable row level security;
alter table public.partner_import_rows        enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Every child table carries its own organization_id (kept in step with the
-- parent by a composite foreign key), so each policy is a direct membership
-- test rather than a join. Fewer moving parts, and the planner can use the
-- organisation index.
-- ---------------------------------------------------------------------------

do $$
declare
  tbl text;
  writable_tables constant text[] := array[
    'partner_companies',
    'partner_contacts',
    'partner_services',
    'partner_service_regions',
    'partner_availability',
    'partner_qualifications',
    'partner_documents',
    'partner_rates',
    'partner_activities',
    'partner_signals',
    'subcontractor_needs',
    'subcontractor_matches',
    'subcontractor_assignments',
    'partner_imports',
    'partner_import_rows'
  ];
begin
  foreach tbl in array writable_tables loop
    -- Read: any member of the organisation.
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id))',
      tbl || '_select', tbl
    );
    -- Write: org_admin and bid_manager only.
    execute format(
      'create policy %I on public.%I for all '
      'using (public.has_org_role(organization_id, array[''org_admin'', ''bid_manager'']::public.org_role[])) '
      'with check (public.has_org_role(organization_id, array[''org_admin'', ''bid_manager'']::public.org_role[]))',
      tbl || '_write', tbl
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo protection
--
-- The same rule the reference data has: partner records name real companies
-- and must never hang off the demo organisation, where they would sit beside
-- fabricated tenders.
-- ---------------------------------------------------------------------------
create or replace function public.reject_demo_partner_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_is_demo boolean;
begin
  select o.is_demo into org_is_demo
  from public.organizations o
  where o.id = new.organization_id;

  if coalesce(org_is_demo, false) then
    raise exception
      'Partnerdaten dürfen nicht an einer Demo-Organisation hängen (Tabelle %).',
      tg_table_name;
  end if;

  return new;
end;
$$;

create trigger partner_companies_reject_demo
  before insert or update on public.partner_companies
  for each row execute function public.reject_demo_partner_data();

create trigger partner_signals_reject_demo
  before insert or update on public.partner_signals
  for each row execute function public.reject_demo_partner_data();

create trigger subcontractor_needs_reject_demo
  before insert or update on public.subcontractor_needs
  for each row execute function public.reject_demo_partner_data();

-- ---------------------------------------------------------------------------
-- Audit logging
--
-- Metadata only. The trigger records who changed which row in which table and
-- how — never the contents. Notes, prices and document text stay out of the
-- log on purpose: an audit trail that copies the data becomes a second,
-- less-guarded store of it (`docs/data-protection.md`, § 6).
-- ---------------------------------------------------------------------------
create or replace function public.log_partner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_org := old.organization_id;
    target_id := old.id;
  else
    target_org := new.organization_id;
    target_id := new.id;
  end if;

  insert into public.audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
  values (
    target_org,
    auth.uid(),
    lower(tg_op) || '_' || tg_table_name,
    tg_table_name,
    target_id,
    jsonb_build_object('operation', tg_op)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger partner_companies_audit
  after insert or update or delete on public.partner_companies
  for each row execute function public.log_partner_change();

create trigger partner_qualifications_audit
  after insert or update or delete on public.partner_qualifications
  for each row execute function public.log_partner_change();

create trigger partner_documents_audit
  after insert or update or delete on public.partner_documents
  for each row execute function public.log_partner_change();

create trigger partner_rates_audit
  after insert or update or delete on public.partner_rates
  for each row execute function public.log_partner_change();

create trigger partner_signals_audit
  after insert or update or delete on public.partner_signals
  for each row execute function public.log_partner_change();

create trigger subcontractor_needs_audit
  after insert or update or delete on public.subcontractor_needs
  for each row execute function public.log_partner_change();

create trigger subcontractor_assignments_audit
  after insert or update or delete on public.subcontractor_assignments
  for each row execute function public.log_partner_change();

-- ---------------------------------------------------------------------------
-- Status change guard
--
-- Blocking a partner is a decision with consequences: it removes them from
-- every future match. It must therefore carry a reason, and the reason has to
-- survive an unblock/reblock cycle rather than being silently emptied.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_partner_block_reason()
returns trigger
language plpgsql
as $$
begin
  if new.is_blocked and coalesce(btrim(new.blocked_reason), '') = '' then
    raise exception 'Eine Sperrung benötigt eine Begründung.';
  end if;

  -- Blocking and "preferred" are contradictory states.
  if new.is_blocked and new.is_preferred then
    raise exception 'Ein gesperrter Partner kann nicht zugleich bevorzugt sein.';
  end if;

  return new;
end;
$$;

create trigger partner_companies_block_reason
  before insert or update on public.partner_companies
  for each row execute function public.enforce_partner_block_reason();

-- ---------------------------------------------------------------------------
-- Chain safety
--
-- A parent link that points at a different project, or that closes a cycle,
-- would make the chain view either wrong or non-terminating. Checked here so
-- it holds regardless of which client wrote the row.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_assignment_chain()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_level smallint;
  parent_org uuid;
  cursor_id uuid;
  hops integer := 0;
begin
  if new.parent_assignment_id is null then
    new.chain_level := 1;
    return new;
  end if;

  select a.chain_level, a.organization_id
    into parent_level, parent_org
  from public.subcontractor_assignments a
  where a.id = new.parent_assignment_id;

  if parent_level is null then
    raise exception 'Die übergeordnete Zuordnung existiert nicht.';
  end if;

  if parent_org is distinct from new.organization_id then
    -- Reported as "not found" rather than "forbidden": the difference would
    -- confirm that the foreign id exists.
    raise exception 'Die übergeordnete Zuordnung existiert nicht.';
  end if;

  new.chain_level := parent_level + 1;

  if new.chain_level > 6 then
    raise exception 'Die Nachunternehmerkette ist auf sechs Ebenen begrenzt.';
  end if;

  -- Walk up and refuse to close a cycle. Bounded by the depth limit, so this
  -- terminates even if existing data is inconsistent.
  cursor_id := new.parent_assignment_id;
  while cursor_id is not null and hops <= 6 loop
    if cursor_id = new.id then
      raise exception 'Eine Zuordnung darf sich nicht selbst übergeordnet sein.';
    end if;
    select a.parent_assignment_id into cursor_id
    from public.subcontractor_assignments a where a.id = cursor_id;
    hops := hops + 1;
  end loop;

  return new;
end;
$$;

create trigger subcontractor_assignments_chain
  before insert or update on public.subcontractor_assignments
  for each row execute function public.enforce_assignment_chain();
