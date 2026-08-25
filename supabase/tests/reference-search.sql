-- ---------------------------------------------------------------------------
-- Behaviour test for public.search_reference_projects (migration 0010).
--
-- Runs against any PostgreSQL instance that has all migrations applied — a
-- local cluster is enough, no Supabase credentials are needed. See
-- `docs/supabase-setup.md`, section "RPC lokal prüfen".
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reference-search.sql
--
-- Everything happens inside a transaction that is rolled back at the end, so
-- the script leaves no data behind. All values are invented (`MUSTER`, `BSP-`);
-- real customer data never belongs in this repository.
-- ---------------------------------------------------------------------------

begin;

create or replace function pg_temp.expect(
  label text,
  actual bigint,
  expected bigint
) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLGESCHLAGEN: % — erwartet %, erhalten %', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end;
$$;

-- --- Fixture ---------------------------------------------------------------

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000e1', 'muster.pruefer@example.invalid');

insert into public.organizations (id, name, slug)
values ('00000000-0000-4000-8000-0000000000e2', 'Musterorganisation Test', 'musterorganisation-test');

insert into public.organization_members (organization_id, user_id, role)
values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e1', 'org_admin');

insert into public.business_clients (id, organization_id, name, normalized_name)
values
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e2', 'Muster Alpha GmbH', 'muster alpha'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000e2', 'Beispiel Beta AG', 'beispiel beta');

insert into public.reference_projects
  (id, organization_id, business_client_id, external_object_number, project_name,
   object_type, city, region, start_date, end_date, project_status)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e2',
   '00000000-0000-4000-8000-0000000000e3', 'BSP-001', 'Musterobjekt Security Nord',
   'Datacenter', 'Musterstadt', 'Musterland', '2024-01-01', '2024-12-31', 'completed'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2',
   '00000000-0000-4000-8000-0000000000e4', 'BSP-002', 'Beispielobjekt Clean Süd',
   'Buerogebaeude', 'Beispielstadt', 'Musterland', '2025-03-01', null, 'active'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e2',
   '00000000-0000-4000-8000-0000000000e3', 'BSP-003', 'Musterobjekt ohne Leistung',
   'Lagerhalle', 'Musterstadt', 'Musterland', null, null, 'unknown');

insert into public.reference_project_services
  (reference_project_id, service_category, classification_source,
   classification_confidence, confirmed_by_user, confirmation_status, confirmed_at)
values
  ('00000000-0000-4000-8000-0000000000f1', 'security', 'name_rule', 0.8, true, 'confirmed', now()),
  ('00000000-0000-4000-8000-0000000000f2', 'cleaning', 'name_rule', 0.8, false, 'proposed', null);

-- The function reads `auth.uid()`, so the test acts as the member above.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e1';

-- --- Assertions ------------------------------------------------------------

do $$
declare
  org constant uuid := '00000000-0000-4000-8000-0000000000e2';
begin
  perform pg_temp.expect('alle Projekte der Organisation',
    (select count(*) from public.search_reference_projects(org)), 3);

  perform pg_temp.expect('Gesamtzahl trotz Seitengröße 2',
    (select max(total_count) from public.search_reference_projects(org, p_limit => 2)), 3);

  perform pg_temp.expect('zweite Seite enthält den Rest',
    (select count(*) from public.search_reference_projects(org, p_limit => 2, p_offset => 2)), 1);

  perform pg_temp.expect('Volltext über den Projektnamen',
    (select count(*) from public.search_reference_projects(org, p_query => 'muster')), 2);

  perform pg_temp.expect('Volltext über den Kundennamen',
    (select count(*) from public.search_reference_projects(org, p_query => 'beta')), 1);

  perform pg_temp.expect('Volltext über die Objektart',
    (select count(*) from public.search_reference_projects(org, p_query => 'datacenter')), 1);

  perform pg_temp.expect('Suche ist akzentunempfindlich',
    (select count(*) from public.search_reference_projects(org, p_query => 'sud')), 1);

  perform pg_temp.expect('Bindestrich in der Objekt-Nr. stört nicht',
    (select count(*) from public.search_reference_projects(org, p_query => 'BSP 002')), 1);

  perform pg_temp.expect('Prozentzeichen ist kein Platzhalter',
    (select count(*) from public.search_reference_projects(org, p_query => '%')), 3);

  perform pg_temp.expect('Filter auf einen Kunden',
    (select count(*) from public.search_reference_projects(
       org, p_client_id => '00000000-0000-4000-8000-0000000000e3')), 2);

  perform pg_temp.expect('Ortsfilter arbeitet unscharf',
    (select count(*) from public.search_reference_projects(org, p_city => 'musterstadt')), 2);

  perform pg_temp.expect('Filter auf Leistungsart',
    (select count(*) from public.search_reference_projects(org, p_services => array['cleaning'])), 1);

  perform pg_temp.expect('Filter auf Projektstatus',
    (select count(*) from public.search_reference_projects(org, p_statuses => array['active'])), 1);

  perform pg_temp.expect('nur bestätigte Leistungen zählen als Nachweis',
    (select count(*) from public.search_reference_projects(org, p_confirmation_status => 'evidence')), 1);

  perform pg_temp.expect('Projekte mit ausschließlich offenen Vorschlägen',
    (select count(*) from public.search_reference_projects(org, p_confirmation_status => 'proposed')), 1);

  perform pg_temp.expect('Projekte mit offenen Vorschlägen',
    (select count(*) from public.search_reference_projects(org, p_reference_status => 'open')), 1);

  perform pg_temp.expect('Projekte ohne offene Vorschläge',
    (select count(*) from public.search_reference_projects(org, p_reference_status => 'confirmed')), 2);

  -- Ein offenes Ende ist kein Beleg dafür, dass das Projekt vorbei ist.
  perform pg_temp.expect('Zeitraum ab 2025 behält offene Projekte',
    (select count(*) from public.search_reference_projects(org, p_period_from => '2025-01-01')), 2);

  perform pg_temp.expect('Zeitraum bis 2024',
    (select count(*) from public.search_reference_projects(org, p_period_to => '2024-12-31')), 2);

  -- Sortierung: Whitelist, keine dynamische SQL-Konstruktion.
  perform pg_temp.expect('unbekanntes Sortierfeld fällt auf den Standard zurück',
    (select count(*) from public.search_reference_projects(
       org, p_sort => '; drop table public.reference_projects; --')), 3);

  perform pg_temp.expect('Sortierung nach Projektname aufsteigend',
    (select count(*) from (
       select p.project_name
       from public.search_reference_projects(org, p_sort => 'project_name', p_direction => 'asc') r
       join public.reference_projects p on p.id = r.id
     ) s), 3);

  -- Mandantentrennung: eine fremde Organisation liefert nichts, keinen Fehler.
  perform pg_temp.expect('fremde Organisation liefert kein Ergebnis',
    (select count(*) from public.search_reference_projects(
       '00000000-0000-4000-8000-00000000ffff')), 0);

  raise notice 'Alle Prüfungen bestanden.';
end;
$$;

rollback;
