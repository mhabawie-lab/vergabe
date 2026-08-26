-- 0016_organization_onboarding.sql
-- First-organisation onboarding for a newly signed-up user.
--
-- Additive: no existing object is dropped or altered destructively.
--
-- Until now a user could authenticate but had no organisation, and the
-- application treated that as "no session" — a dead end. This migration adds
-- the one narrow path out of it: a signed-in user with no membership creates
-- exactly one organisation and becomes its org_admin.
--
-- Deliberate boundaries (CLAUDE.md § 11):
--   * This is **not** public self-registration for external partner firms.
--     Partner companies remain notes one organisation keeps about third
--     parties; they never get accounts. This function only serves a user who
--     already authenticated and belongs nowhere yet.
--   * A user who is already a member of any organisation is rejected. There is
--     no second onboarding, and no way to use this to join or create more.
--   * Everything happens in one function call, so it is one transaction: either
--     organisation, membership and audit entry all exist, or none of them do.

-- ---------------------------------------------------------------------------
-- create_first_organization
--
-- SECURITY DEFINER because the caller has, by definition, no membership yet
-- and therefore cannot satisfy any of the tenant policies on organizations,
-- organization_members or audit_log. The privilege is bounded by the
-- membership check below: it can only ever act for auth.uid(), and only once.
-- ---------------------------------------------------------------------------
create or replace function public.create_first_organization(
  p_name         text,
  p_slug         text,
  p_legal_form   text default null,
  p_city         text default null,
  p_country_code text default 'DE'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_slug   text := lower(btrim(coalesce(p_slug, '')));
  v_org    uuid;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  -- Serialises concurrent onboarding attempts by the same user. Two parallel
  -- requests would otherwise both pass the membership check below.
  perform pg_advisory_xact_lock(hashtext('onboarding:' || v_user::text));

  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'Für dieses Konto existiert kein Profil.' using errcode = '42501';
  end if;

  if exists (select 1 from public.organization_members m where m.user_id = v_user) then
    raise exception 'Dieses Konto gehört bereits zu einer Organisation.'
      using errcode = '23505';
  end if;

  if length(v_name) = 0 then
    raise exception 'Der Name der Organisation fehlt.' using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' then
    raise exception 'Die Kennung ist ungültig. Erlaubt sind 3 bis 50 Zeichen: a–z, 0–9 und Bindestrich.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'Diese Kennung ist bereits vergeben.' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug, legal_form, city, country_code, is_demo)
  values (
    v_name,
    v_slug,
    nullif(btrim(coalesce(p_legal_form, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(upper(btrim(coalesce(p_country_code, ''))), '')::char(2),
    -- Never a demo tenant: demo data is created by the demo connector, not by
    -- a real person signing up (CLAUDE.md § 4).
    false
  )
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'org_admin');

  -- Metadata only, never data content (CLAUDE.md § 10).
  insert into public.audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
  values (
    v_org,
    v_user,
    'organization.onboarded',
    'organizations',
    v_org::text,
    jsonb_build_object('role', 'org_admin', 'via', 'first_organization')
  );

  return v_org;
end;
$$;

comment on function public.create_first_organization(text, text, text, text, text) is
  'Creates the first organisation for a signed-in user without a membership and makes them org_admin. Rejects a second call. Not public partner self-registration.';

-- Only an authenticated user may call this. anon must not reach it: that would
-- turn it into open self-registration.
revoke all on function public.create_first_organization(text, text, text, text, text) from public;
revoke all on function public.create_first_organization(text, text, text, text, text) from anon;
grant execute on function public.create_first_organization(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- needs_onboarding
--
-- Lets the application ask "does this user still have to onboard?" without
-- reading organization_members through a policy that would hide the answer.
-- ---------------------------------------------------------------------------
create or replace function public.needs_onboarding()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.organization_members m where m.user_id = auth.uid()
     );
$$;

comment on function public.needs_onboarding() is
  'True when the caller is signed in but belongs to no organisation yet.';

revoke all on function public.needs_onboarding() from public;
grant execute on function public.needs_onboarding() to authenticated;
