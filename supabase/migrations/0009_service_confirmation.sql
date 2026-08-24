-- 0009_service_confirmation.sql
-- Explicit confirmation state for service classifications.
--
-- Additive only: no column is dropped, no row is deleted, and existing values
-- are preserved. `confirmed_by_user` stays as the boolean answer to "does this
-- count as evidence?"; the new `confirmation_status` records *how* that answer
-- came about, which the boolean alone cannot express — a rejected proposal and
-- an untouched one are both `false`, but they mean very different things.

-- ---------------------------------------------------------------------------
-- Confirmation status
-- ---------------------------------------------------------------------------
create type public.service_confirmation_status as enum (
  -- Automatic proposal, nobody has looked at it yet.
  'proposed',
  -- The proposal was confirmed unchanged.
  'confirmed',
  -- A person picked the category themselves and confirmed it.
  'manual',
  -- A person judged the proposal wrong.
  'rejected',
  -- A person established that the service cannot be determined.
  'unknown'
);

comment on type public.service_confirmation_status is
  'How a service classification reached its current state. Only confirmed and manual count as evidence.';

alter table public.reference_project_services
  add column confirmation_status public.service_confirmation_status
    not null default 'proposed',
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references public.profiles (id) on delete set null;

comment on column public.reference_project_services.confirmation_status is
  'Distinguishes an untouched proposal from a rejected one — both have confirmed_by_user = false.';
comment on column public.reference_project_services.confirmed_at is
  'When the decision was taken. Null while the row is still an untouched proposal.';
comment on column public.reference_project_services.confirmed_by is
  'Who took the decision. Null while the row is still an untouched proposal.';

-- Existing rows: derive the status from the boolean already stored.
-- A row that was confirmed before this migration is recorded as `manual`,
-- because there is no record of whether it matched the original proposal —
-- claiming `confirmed` would assert something unknown.
update public.reference_project_services
set confirmation_status = 'manual'
where confirmed_by_user;

-- The two fields must not contradict each other.
alter table public.reference_project_services
  add constraint reference_project_services_confirmation_consistent check (
    (confirmed_by_user and confirmation_status in ('confirmed', 'manual'))
    or (not confirmed_by_user
        and confirmation_status in ('proposed', 'rejected', 'unknown'))
  );

-- A decision carries who took it and when.
alter table public.reference_project_services
  add constraint reference_project_services_decision_complete check (
    confirmation_status = 'proposed'
    or (confirmed_at is not null)
  );

create index reference_project_services_status_idx
  on public.reference_project_services (confirmation_status);

-- Serves the "which projects still need review?" filter.
create index reference_project_services_open_idx
  on public.reference_project_services (reference_project_id)
  where confirmation_status = 'proposed';

-- ---------------------------------------------------------------------------
-- Audit trail for confirmation decisions
--
-- The generic trigger from 0008 records that a row changed. A confirmation
-- decision additionally needs the previous and the new value, because the
-- point of the audit is to show what someone asserted about a customer
-- reference — not merely that they touched it.
--
-- Category and status are classification metadata, not customer data, so
-- recording them does not turn the audit log into a second store of customer
-- records.
-- ---------------------------------------------------------------------------
create or replace function public.log_service_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  action_name text;
begin
  -- Only classification decisions are of interest here; other column changes
  -- are already covered by log_reference_change.
  if old.confirmation_status is not distinct from new.confirmation_status
     and old.service_category is not distinct from new.service_category then
    return new;
  end if;

  select p.organization_id into target_org
  from public.reference_projects p
  where p.id = new.reference_project_id;

  action_name := case new.confirmation_status
    when 'confirmed' then 'service_confirmed'
    when 'manual'    then 'service_category_changed'
    when 'rejected'  then 'service_rejected'
    when 'unknown'   then 'service_marked_unknown'
    when 'proposed'  then 'service_confirmation_reset'
  end;

  insert into public.audit_log (
    organization_id, user_id, action, resource_type, resource_id, metadata
  )
  values (
    target_org,
    coalesce(new.confirmed_by, auth.uid()),
    action_name,
    'reference_project_services',
    new.id::text,
    jsonb_build_object(
      'reference_project_id', new.reference_project_id,
      'previous_category',    old.service_category,
      'new_category',         new.service_category,
      'previous_status',      old.confirmation_status,
      'new_status',           new.confirmation_status,
      'classification_source', new.classification_source
    )
  );

  return new;
end;
$$;

comment on function public.log_service_confirmation() is
  'Records a confirmation decision with its previous and new value. Stores classification metadata only, never customer data.';

create trigger reference_project_services_confirmation_audit
  after update on public.reference_project_services
  for each row execute function public.log_service_confirmation();
