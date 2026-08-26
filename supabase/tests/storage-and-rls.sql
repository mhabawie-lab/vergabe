-- ---------------------------------------------------------------------------
-- Row Level Security and storage policy test.
--
-- Covers what the application cannot test for itself: that the *database*
-- refuses cross-tenant access even when the application layer is bypassed.
-- Every check runs as the `authenticated` role with a real member and a real
-- non-member, never as superuser and never with the service role — a test
-- that bypasses RLS proves nothing about RLS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/storage-and-rls.sql
--
-- Wrapped in a transaction that is rolled back. All values are invented.
-- ---------------------------------------------------------------------------

begin;

create or replace function pg_temp.expect(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLGESCHLAGEN: % — erwartet %, erhalten %', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end;
$$;

create or replace function pg_temp.expect_bool(label text, actual boolean, expected boolean)
returns void language plpgsql as $$
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
      raise notice 'ok: %', label;
  end;
end;
$$;

-- --- Fixture: two organisations, three users -------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin.a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'viewer.a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin.b@example.invalid');

insert into public.organizations (id, name, slug) values
  ('00000000-0000-4000-8000-0000000000aa', 'Musterorganisation A', 'muster-a'),
  ('00000000-0000-4000-8000-0000000000bb', 'Beispielorganisation B', 'beispiel-b');

insert into public.organization_members (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1', 'org_admin'),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a2', 'viewer'),
  ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'org_admin');

insert into public.business_clients (id, organization_id, name, normalized_name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000aa', 'Muster Kunde GmbH', 'muster kunde'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000bb', 'Fremder Kunde GmbH', 'fremder kunde');

insert into public.partner_companies (id, organization_id, legal_name, normalized_name) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000aa', 'Muster Wachdienst GmbH', 'muster wachdienst'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000bb', 'Fremder Wachdienst GmbH', 'fremder wachdienst');

insert into public.partner_rates
  (partner_company_id, organization_id, rate_model, net_amount, currency) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000aa', 'hourly', 28.50, 'EUR');

insert into public.reference_documents
  (organization_id, business_client_id, storage_path, file_name) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000000aa/business_client/00000000-0000-4000-8000-0000000000c1/muster.pdf',
   'muster.pdf');

insert into public.organization_documents (organization_id, storage_path, file_name) values
  ('00000000-0000-4000-8000-0000000000aa',
   '00000000-0000-4000-8000-0000000000aa/organization/00000000-0000-4000-8000-0000000000aa/zertifikat.pdf',
   'zertifikat.pdf');

insert into storage.objects (bucket_id, name) values
  ('reference-documents',
   '00000000-0000-4000-8000-0000000000aa/business_client/00000000-0000-4000-8000-0000000000c1/muster.pdf'),
  ('partner-documents',
   '00000000-0000-4000-8000-0000000000bb/partner_company/00000000-0000-4000-8000-0000000000d2/fremd.pdf');

-- --- Buckets ---------------------------------------------------------------

do $$
begin
  perform pg_temp.expect('alle drei Buckets sind privat',
    (select count(*) from storage.buckets where public), 0);
  perform pg_temp.expect('drei Buckets vorhanden',
    (select count(*) from storage.buckets
      where id in ('reference-documents', 'partner-documents', 'organization-documents')), 3);
end;
$$;

-- --- Path helper -----------------------------------------------------------

do $$
begin
  perform pg_temp.expect_bool('Pfadpräfix wird als Organisation gelesen',
    public.storage_path_organization(
      '00000000-0000-4000-8000-0000000000aa/x/y/z.pdf') = '00000000-0000-4000-8000-0000000000aa',
    true);
  perform pg_temp.expect_bool('ein Pfad ohne Organisationspräfix ergibt null',
    public.storage_path_organization('irgendwas/z.pdf') is null, true);
  -- A traversal attempt cannot produce a valid prefix.
  perform pg_temp.expect_bool('Pfadmanipulation ergibt keine Organisation',
    public.storage_path_organization('../../etc/passwd') is null, true);
end;
$$;

-- --- As a member of organisation A -----------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

do $$
begin
  perform pg_temp.expect('Mitglied sieht eigene Kunden',
    (select count(*) from public.business_clients), 1);
  perform pg_temp.expect('Mitglied sieht eigene Partner',
    (select count(*) from public.partner_companies), 1);
  perform pg_temp.expect('Mitglied sieht eigene Referenzdokumente',
    (select count(*) from public.reference_documents), 1);
  perform pg_temp.expect('Mitglied sieht eigene Organisationsdokumente',
    (select count(*) from public.organization_documents), 1);
  perform pg_temp.expect('Mitglied sieht eigene Konditionen',
    (select count(*) from public.partner_rates), 1);
  perform pg_temp.expect('Mitglied sieht nur eigene Storage-Objekte',
    (select count(*) from storage.objects), 1);
  perform pg_temp.expect('die eigene Partnersuche liefert Treffer',
    (select count(*) from public.search_partner_companies('00000000-0000-4000-8000-0000000000aa')), 1);
  -- The RPC must not be able to reach into another tenant.
  perform pg_temp.expect('die RPC kann keine fremde Organisation erzwingen',
    (select count(*) from public.search_partner_companies('00000000-0000-4000-8000-0000000000bb')), 0);
end;
$$;

-- --- As a non-member -------------------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';

do $$
begin
  perform pg_temp.expect('Nichtmitglied sieht keine fremden Kunden',
    (select count(*) from public.business_clients
      where organization_id = '00000000-0000-4000-8000-0000000000aa'), 0);
  perform pg_temp.expect('Nichtmitglied sieht keine fremden Referenzdokumente',
    (select count(*) from public.reference_documents
      where organization_id = '00000000-0000-4000-8000-0000000000aa'), 0);
  perform pg_temp.expect('Nichtmitglied sieht keine fremden Konditionen',
    (select count(*) from public.partner_rates
      where organization_id = '00000000-0000-4000-8000-0000000000aa'), 0);
  perform pg_temp.expect('Nichtmitglied sieht keine fremden Storage-Objekte',
    (select count(*) from storage.objects
      where name like '00000000-0000-4000-8000-0000000000aa/%'), 0);
  -- A known-good UUID must not reveal that the record exists.
  perform pg_temp.expect('eine fremde UUID verrät keine Existenz',
    (select count(*) from public.partner_companies
      where id = '00000000-0000-4000-8000-0000000000d1'), 0);
end;
$$;

-- --- Write attempts across the tenant boundary -----------------------------

do $$
begin
  perform pg_temp.expect_error(
    'Nichtmitglied kann keinen fremden Kunden anlegen',
    $stmt$insert into public.business_clients (organization_id, name, normalized_name)
           values ('00000000-0000-4000-8000-0000000000aa', 'Eingeschleust', 'eingeschleust')$stmt$);

  perform pg_temp.expect_error(
    'Nichtmitglied kann kein Storage-Objekt in eine fremde Organisation legen',
    $stmt$insert into storage.objects (bucket_id, name)
           values ('partner-documents',
                   '00000000-0000-4000-8000-0000000000aa/partner_company/x/eingeschleust.pdf')$stmt$);
end;
$$;

-- --- Viewer: read yes, write no --------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';

do $$
begin
  perform pg_temp.expect('Betrachter sieht die eigenen Kunden',
    (select count(*) from public.business_clients), 1);
  perform pg_temp.expect('Betrachter sieht die eigenen Partner',
    (select count(*) from public.partner_companies), 1);

  perform pg_temp.expect_error(
    'Betrachter kann keinen Kunden anlegen',
    $stmt$insert into public.business_clients (organization_id, name, normalized_name)
           values ('00000000-0000-4000-8000-0000000000aa', 'Vom Betrachter', 'vom betrachter')$stmt$);

  perform pg_temp.expect_error(
    'Betrachter kann kein Referenzdokument anlegen',
    $stmt$insert into public.reference_documents
           (organization_id, business_client_id, storage_path, file_name)
           values ('00000000-0000-4000-8000-0000000000aa',
                   '00000000-0000-4000-8000-0000000000c1',
                   '00000000-0000-4000-8000-0000000000aa/x/y/z.pdf', 'z.pdf')$stmt$);

  perform pg_temp.expect_error(
    'Betrachter kann kein Storage-Objekt hochladen',
    $stmt$insert into storage.objects (bucket_id, name)
           values ('reference-documents',
                   '00000000-0000-4000-8000-0000000000aa/business_client/c/neu.pdf')$stmt$);
end;
$$;

-- --- Anonymous -------------------------------------------------------------

set local role anon;
reset request.jwt.claim.sub;

do $$
begin
  perform pg_temp.expect('anonym: keine Kunden',
    (select count(*) from public.business_clients), 0);
  perform pg_temp.expect('anonym: keine Partner',
    (select count(*) from public.partner_companies), 0);
  perform pg_temp.expect('anonym: keine Dokumente',
    (select count(*) from public.reference_documents), 0);
  perform pg_temp.expect('anonym: keine Storage-Objekte',
    (select count(*) from storage.objects), 0);
end;
$$;

reset role;

do $$ begin raise notice 'Alle RLS- und Storage-Prüfungen bestanden.'; end $$;

rollback;
