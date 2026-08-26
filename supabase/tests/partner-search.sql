-- ---------------------------------------------------------------------------
-- Behaviour test for public.search_partner_companies (migration 0013) and for
-- the guards of 0011/0012.
--
-- Runs against any PostgreSQL instance that has all migrations applied — a
-- local cluster is enough, no Supabase credentials are needed. See
-- `docs/supabase-setup.md`, section "RPC lokal prüfen".
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/partner-search.sql
--
-- Everything happens inside a transaction that is rolled back at the end, so
-- the script leaves no data behind. All values are invented; real partner data
-- never belongs in this repository.
-- ---------------------------------------------------------------------------

begin;

create or replace function pg_temp.expect(
  label text, actual bigint, expected bigint
) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLGESCHLAGEN: % — erwartet %, erhalten %', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end;
$$;

create or replace function pg_temp.expect_error(label text, statement text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'FEHLGESCHLAGEN: % — die Anweisung war unerwartet erfolgreich', label;
  exception
    when others then
      if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
      raise notice 'ok: % (%).', label, sqlerrm;
  end;
end;
$$;

-- --- Fixture ---------------------------------------------------------------

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000d1', 'muster.pruefer@example.invalid');

insert into public.organizations (id, name, slug)
values ('00000000-0000-4000-8000-0000000000d2', 'Musterorganisation Partner', 'musterorg-partner');

insert into public.organization_members (organization_id, user_id, role)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1', 'org_admin');

insert into public.partner_companies
  (id, organization_id, legal_name, normalized_name, relationship_direction,
   partner_level, status, verification_status, country, region, city,
   datacenter_experience_status, staff_model, next_follow_up_at)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2',
   'Muster Wachdienst GmbH', 'muster wachdienst', 'can_work_for_us',
   'subcontractor', 'qualified', 'verified', 'DE', 'Musterland', 'Musterstadt',
   'confirmed', 'own_staff', now() + interval '3 days'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2',
   'Beispiel Bau AG', 'beispiel bau', 'may_hire_us',
   'main_contractor', 'contacted', 'unverified', 'DE', 'Musterland', 'Beispielstadt',
   'unknown', 'mixed', null),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d2',
   'Muster Reinigung GmbH', 'muster reinigung', 'both',
   'subcontractor', 'prospect', 'self_declared', 'DE', 'Musterland', 'Musterstadt',
   'claimed', 'unknown', null);

insert into public.partner_services
  (partner_company_id, organization_id, service_category, confirmation, confirmation_source, available_staff)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2',
   'datacenter_security', 'confirmed', 'manual', 15),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2',
   'construction_support', 'self_declared', 'import_column', null),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d2',
   'cleaning', 'confirmed', 'manual', 4);

insert into public.partner_service_regions
  (partner_company_id, organization_id, country, region, city, radius_km, nationwide, is_confirmed)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2',
   'DE', 'Musterland', 'Musterstadt', 80, false, true),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d2',
   'DE', null, null, null, true, false);

insert into public.partner_availability
  (partner_company_id, organization_id, service_category, available_from, available_until,
   status, available_staff, last_confirmed_at)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2',
   'datacenter_security', current_date - 10, current_date + 200, 'available', 15, now());

insert into public.partner_qualifications
  (partner_company_id, organization_id, credential_type, valid_from, valid_until,
   review_status, reviewed_at)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2',
   'guard_permit', current_date - 100, current_date + 300, 'accepted', now()),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d2',
   'guard_permit', current_date - 400, current_date - 5, 'accepted', now());

insert into public.partner_signals
  (organization_id, partner_company_id, signal_type, source_type, source_name,
   observed_at, confidence, status)
values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e2',
   'seeks_security', 'website', 'Karriereseite', current_date, 'medium', 'new');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';

-- --- Assertions ------------------------------------------------------------

do $$
declare
  org constant uuid := '00000000-0000-4000-8000-0000000000d2';
begin
  perform pg_temp.expect('alle Partner der Organisation',
    (select count(*) from public.search_partner_companies(org)), 3);

  perform pg_temp.expect('Gesamtzahl trotz Seitengröße 2',
    (select max(total_count) from public.search_partner_companies(org, p_limit => 2)), 3);

  perform pg_temp.expect('zweite Seite enthält den Rest',
    (select count(*) from public.search_partner_companies(org, p_limit => 2, p_offset => 2)), 1);

  perform pg_temp.expect('Volltext über den Firmennamen',
    (select count(*) from public.search_partner_companies(org, p_query => 'wachdienst')), 1);

  perform pg_temp.expect('Volltext über die Region trifft alle',
    (select count(*) from public.search_partner_companies(org, p_query => 'musterland')), 3);

  perform pg_temp.expect('Prozentzeichen ist kein Platzhalter',
    (select count(*) from public.search_partner_companies(org, p_query => '%')), 3);

  perform pg_temp.expect('Filter auf Beziehungsrichtung',
    (select count(*) from public.search_partner_companies(org, p_directions => array['may_hire_us'])), 1);

  perform pg_temp.expect('Filter auf Partnerstatus',
    (select count(*) from public.search_partner_companies(org, p_statuses => array['qualified'])), 1);

  -- Only a CONFIRMED service counts; the self-declared one must not match.
  perform pg_temp.expect('nur bestätigte Leistungen zählen',
    (select count(*) from public.search_partner_companies(org, p_services => array['datacenter_security'])), 1);

  perform pg_temp.expect('eine selbst angegebene Leistung zählt nicht',
    (select count(*) from public.search_partner_companies(org, p_services => array['construction_support'])), 0);

  perform pg_temp.expect('Ortsfilter arbeitet unscharf',
    (select count(*) from public.search_partner_companies(org, p_city => 'musterstadt')), 2);

  perform pg_temp.expect('bundesweite Abdeckung trifft jeden Ort',
    (select count(*) from public.search_partner_companies(org, p_city => 'beispielstadt')), 2);

  perform pg_temp.expect('Mindestradius',
    (select count(*) from public.search_partner_companies(org, p_min_radius_km => 50)), 2);

  perform pg_temp.expect('Verfügbarkeit an einem Tag',
    (select count(*) from public.search_partner_companies(org, p_available_on => current_date + 10)), 1);

  perform pg_temp.expect('verfügbare Mitarbeiter ab 10',
    (select count(*) from public.search_partner_companies(org, p_min_available_staff => 10)), 1);

  perform pg_temp.expect('Datacenter-Erfahrung belegt',
    (select count(*) from public.search_partner_companies(org, p_datacenter => 'confirmed')), 1);

  perform pg_temp.expect('Verifizierungsstatus',
    (select count(*) from public.search_partner_companies(org, p_verification_statuses => array['verified'])), 1);

  perform pg_temp.expect('gültige Nachweise',
    (select count(*) from public.search_partner_companies(org, p_credential_state => 'valid')), 1);

  perform pg_temp.expect('abgelaufene Nachweise',
    (select count(*) from public.search_partner_companies(org, p_credential_state => 'expired')), 1);

  perform pg_temp.expect('Firmen mit offenem Bedarfssignal',
    (select count(*) from public.search_partner_companies(org, p_has_open_demand_signal => true)), 1);

  perform pg_temp.expect('Firmen ohne offenes Bedarfssignal',
    (select count(*) from public.search_partner_companies(org, p_has_open_demand_signal => false)), 2);

  perform pg_temp.expect('Wiedervorlage bis in einer Woche',
    (select count(*) from public.search_partner_companies(org, p_follow_up_before => current_date + 7)), 1);

  -- Sorting is a whitelist, never dynamic SQL.
  perform pg_temp.expect('unbekanntes Sortierfeld fällt auf den Standard zurück',
    (select count(*) from public.search_partner_companies(
       org, p_sort => '; drop table public.partner_companies; --')), 3);

  perform pg_temp.expect('fremde Organisation liefert kein Ergebnis',
    (select count(*) from public.search_partner_companies(
       '00000000-0000-4000-8000-00000000ffff')), 0);

  raise notice 'Suchprüfungen bestanden.';
end;
$$;

-- --- Guards ----------------------------------------------------------------

do $$
begin
  perform pg_temp.expect_error(
    'eine Sperrung ohne Begründung wird abgelehnt',
    $stmt$update public.partner_companies set is_blocked = true
           where id = '00000000-0000-4000-8000-0000000000e2'$stmt$);

  perform pg_temp.expect_error(
    'gesperrt und bevorzugt schließen sich aus',
    $stmt$update public.partner_companies
           set is_blocked = true, blocked_reason = 'Muster', is_preferred = true
           where id = '00000000-0000-4000-8000-0000000000e2'$stmt$);

  perform pg_temp.expect_error(
    'ein Dokument mit öffentlicher URL wird abgelehnt',
    $stmt$insert into public.partner_documents
           (partner_company_id, organization_id, storage_path, file_name)
           values ('00000000-0000-4000-8000-0000000000e1',
                   '00000000-0000-4000-8000-0000000000d2',
                   'https://example.invalid/muster.pdf', 'muster.pdf')$stmt$);
end;
$$;

-- --- Chain -----------------------------------------------------------------

do $$
declare
  first_id uuid;
  second_id uuid;
begin
  insert into public.subcontractor_assignments
    (organization_id, partner_company_id, role, further_subcontracting_allowed)
  values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
          'subcontractor', 'allowed')
  returning id into first_id;

  insert into public.subcontractor_assignments
    (organization_id, partner_company_id, role, parent_assignment_id)
  values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e3',
          'sub_subcontractor', first_id)
  returning id into second_id;

  perform pg_temp.expect('zweite Kettenebene wird errechnet',
    (select chain_level from public.subcontractor_assignments where id = second_id), 2);

  perform pg_temp.expect_error(
    'ein Kreis in der Kette wird verhindert',
    format($stmt$update public.subcontractor_assignments
                 set parent_assignment_id = %L where id = %L$stmt$, second_id, first_id));

  raise notice 'Kettenprüfungen bestanden.';
end;
$$;

-- --- Audit -----------------------------------------------------------------

do $$
begin
  perform pg_temp.expect('Audit-Einträge enthalten keine Inhalte',
    (select count(*) from public.audit_log
      where resource_type = 'partner_companies'
        and metadata ? 'operation'
        and not (metadata ?| array['legal_name', 'internal_notes', 'net_amount'])),
    (select count(*) from public.audit_log where resource_type = 'partner_companies'));

  raise notice 'Alle Prüfungen bestanden.';
end;
$$;

rollback;
