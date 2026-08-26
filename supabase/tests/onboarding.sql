-- ---------------------------------------------------------------------------
-- Onboarding test: the first organisation for a new user.
--
-- Proves the boundaries of create_first_organization at the database level:
-- it works exactly once, only for the signed-in user, never for anon, and it
-- leaves an audit entry.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/onboarding.sql
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

-- --- Fixture ---------------------------------------------------------------
-- Two fresh users without any membership, plus one who already belongs to an
-- organisation.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'neu@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e2', 'zweit@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e3', 'bestand@example.invalid');

-- handle_new_user only fires on the real platform trigger chain; insert the
-- profiles the same way it would.
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'neu@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e2', 'zweit@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e3', 'bestand@example.invalid')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug) values
  ('00000000-0000-4000-8000-0000000000ee', 'Bestehende Organisation', 'bestehende-org');

insert into public.organization_members (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000e3', 'org_admin');

-- --- A brand-new user onboards --------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e1';

do $$
declare v_org uuid;
begin
  perform pg_temp.expect_bool('neuer Benutzer braucht Onboarding', public.needs_onboarding(), true);

  v_org := public.create_first_organization(
    'Musterbetrieb Sicherheit GmbH', 'musterbetrieb-sicherheit', 'GmbH', 'Musterstadt', 'de'
  );

  perform pg_temp.expect_bool('Organisation wurde angelegt', v_org is not null, true);

  perform pg_temp.expect(
    'genau eine Mitgliedschaft',
    (select count(*) from public.organization_members m where m.user_id = auth.uid()),
    1
  );

  perform pg_temp.expect(
    'Rolle ist org_admin',
    (select count(*) from public.organization_members m
      where m.user_id = auth.uid() and m.role = 'org_admin'),
    1
  );

  perform pg_temp.expect_bool(
    'Organisation ist keine Demo-Organisation',
    (select o.is_demo from public.organizations o where o.id = v_org),
    false
  );

  perform pg_temp.expect_bool(
    'Kennung wurde kleingeschrieben übernommen',
    (select o.slug from public.organizations o where o.id = v_org) = 'musterbetrieb-sicherheit',
    true
  );

  perform pg_temp.expect_bool(
    'Ländercode wurde großgeschrieben',
    (select o.country_code from public.organizations o where o.id = v_org) = 'DE',
    true
  );

  perform pg_temp.expect(
    'Auditeintrag geschrieben',
    (select count(*) from public.audit_log a
      where a.organization_id = v_org and a.action = 'organization.onboarded'),
    1
  );

  perform pg_temp.expect_bool(
    'Auditeintrag enthält keinen Namen',
    (select a.metadata::text from public.audit_log a
      where a.organization_id = v_org and a.action = 'organization.onboarded')
      not ilike '%Musterbetrieb%',
    true
  );

  perform pg_temp.expect_bool('kein Onboarding mehr nötig', public.needs_onboarding(), false);
end;
$$;

-- A second call by the same user must be refused.
select pg_temp.expect_error(
  'zweites Onboarding wird abgewiesen',
  $q$select public.create_first_organization('Zweitbetrieb GmbH', 'zweitbetrieb')$q$
);

-- --- Validation ------------------------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e2';

select pg_temp.expect_error(
  'leerer Name wird abgewiesen',
  $q$select public.create_first_organization('   ', 'leerer-name')$q$
);

select pg_temp.expect_error(
  'ungültige Kennung wird abgewiesen',
  $q$select public.create_first_organization('Beispiel GmbH', 'Ungültig Kennung!')$q$
);

select pg_temp.expect_error(
  'zu kurze Kennung wird abgewiesen',
  $q$select public.create_first_organization('Beispiel GmbH', 'ab')$q$
);

select pg_temp.expect_error(
  'belegte Kennung wird abgewiesen',
  $q$select public.create_first_organization('Beispiel GmbH', 'bestehende-org')$q$
);

do $$
begin
  perform pg_temp.expect(
    'nach abgewiesenen Versuchen keine Organisation angelegt',
    (select count(*) from public.organization_members m where m.user_id = auth.uid()),
    0
  );
  perform pg_temp.expect(
    'keine verwaiste Organisation zurückgeblieben',
    (select count(*) from public.organizations o where o.slug in ('leerer-name', 'ab')),
    0
  );
end;
$$;

-- --- A user who already belongs somewhere ----------------------------------

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e3';

do $$
begin
  perform pg_temp.expect_bool(
    'bestehendes Mitglied braucht kein Onboarding',
    public.needs_onboarding(),
    false
  );
end;
$$;

select pg_temp.expect_error(
  'bestehendes Mitglied kann keine zweite Organisation anlegen',
  $q$select public.create_first_organization('Nebenbetrieb GmbH', 'nebenbetrieb')$q$
);

-- --- Anonymous callers -----------------------------------------------------
-- No public self-registration: anon has no execute privilege at all.

set local role anon;
set local request.jwt.claim.sub = '';

select pg_temp.expect_error(
  'anon darf create_first_organization nicht ausführen',
  $q$select public.create_first_organization('Fremdfirma GmbH', 'fremdfirma')$q$
);

reset role;

do $$
begin
  perform pg_temp.expect(
    'anon hat kein EXECUTE-Recht',
    (select count(*) from information_schema.role_routine_grants g
      where g.routine_name = 'create_first_organization' and g.grantee = 'anon'),
    0
  );
  perform pg_temp.expect(
    'authenticated hat EXECUTE-Recht',
    (select count(distinct g.grantee) from information_schema.role_routine_grants g
      where g.routine_name = 'create_first_organization' and g.grantee = 'authenticated'),
    1
  );
end;
$$;

rollback;
