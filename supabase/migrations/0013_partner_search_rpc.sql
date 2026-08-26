-- 0013_partner_search_rpc.sql
-- Server-side search over partner companies.
--
-- Additive: one function plus supporting indexes. No table is changed and no
-- data is deleted.
--
-- Why a function. Most filters of the company list live in child tables —
-- confirmed services, covered regions, current availability, credential
-- state, open demand signals. Applying those to a page that has already been
-- fetched gives a wrong total and half-empty pages, exactly the defect the
-- reference search had before `search_reference_projects`. So the filtering
-- happens where the data is.
--
-- Security, unchanged from 0010:
--   * `security invoker` — runs with the caller's rights, RLS applies.
--   * The organisation is checked explicitly as well (`is_org_member`); a
--     foreign id returns an empty result rather than an error, so nothing can
--     be probed.
--   * No dynamic SQL. Sort field and direction come from a fixed whitelist;
--     an unknown value falls back to the default instead of reaching the
--     statement.
--   * The search text is a parameter, reduced to the shared comparison form,
--     so `%` matches a literal percent sign.
--   * `execute` is granted to `authenticated` only. The service role is never
--     used from a browser.
--
-- No geocoding. `p_min_radius_km` matches partners who state at least that
-- radius, or who work nationwide. Distances are not computed from addresses;
-- inventing a distance from data we do not have would be worse than filtering
-- on what the partner actually told us.

create index if not exists partner_documents_review_idx
  on public.partner_documents (organization_id, review_status);

create or replace function public.search_partner_companies(
  p_organization_id uuid,
  p_query text default null,
  p_directions text[] default null,
  p_statuses text[] default null,
  p_services text[] default null,
  p_country text default null,
  p_region text default null,
  p_city text default null,
  p_min_radius_km integer default null,
  p_verification_statuses text[] default null,
  p_datacenter text default null,
  p_min_available_staff integer default null,
  p_available_on date default null,
  p_credential_state text default null,
  p_only_preferred boolean default false,
  p_only_blocked boolean default false,
  p_include_blocked boolean default true,
  p_include_archived boolean default false,
  p_has_open_demand_signal boolean default null,
  p_last_contact_before date default null,
  p_follow_up_before date default null,
  p_sort text default 'legal_name',
  p_direction text default 'asc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (id uuid, total_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with params as (
    select
      case
        when p_sort in ('legal_name', 'status', 'last_contact', 'follow_up', 'created_at')
          then p_sort
        else 'legal_name'
      end as sort,
      case when p_direction = 'desc' then 'desc' else 'asc' end as direction,
      nullif(public.reference_compare_form(p_query), '') as needle,
      nullif(public.reference_city_compare_form(p_city), '') as city_needle
  ),
  filtered as (
    select
      c.id,
      c.legal_name,
      c.status,
      c.last_contact_at,
      c.next_follow_up_at,
      c.created_at
    from public.partner_companies c
    cross join params
    where c.organization_id = p_organization_id
      -- Belt and braces next to RLS.
      and public.is_org_member(p_organization_id)
      and (p_include_archived or c.archived_at is null)
      and (p_include_blocked or not c.is_blocked)
      and (not p_only_preferred or c.is_preferred)
      and (not p_only_blocked or c.is_blocked)
      and (p_directions is null or array_length(p_directions, 1) is null
           or c.relationship_direction::text = any (p_directions))
      and (p_statuses is null or array_length(p_statuses, 1) is null
           or c.status::text = any (p_statuses))
      and (p_verification_statuses is null
           or array_length(p_verification_statuses, 1) is null
           or c.verification_status::text = any (p_verification_statuses))
      and (p_datacenter is null or c.datacenter_experience_status::text = p_datacenter)
      and (p_country is null or c.country = p_country)
      and (p_last_contact_before is null
           or c.last_contact_at is null
           or c.last_contact_at::date <= p_last_contact_before)
      and (p_follow_up_before is null
           or (c.next_follow_up_at is not null
               and c.next_follow_up_at::date <= p_follow_up_before))
      -- Full text over the same fields the development store searches.
      and (
        params.needle is null
        or public.reference_compare_form(
             concat_ws(' ', c.legal_name, c.trade_name, c.city, c.region,
                       c.registry_number, c.vat_id)
           ) like '%' || params.needle || '%'
      )
      -- Services: only a CONFIRMED service counts. A self-declared one is
      -- what the company told us and is not evidence.
      and (
        p_services is null or array_length(p_services, 1) is null
        or exists (
          select 1 from public.partner_services s
          where s.partner_company_id = c.id
            and s.confirmation = 'confirmed'
            and s.service_category::text = any (p_services)
        )
      )
      -- Region: the company's own address or any declared service region.
      and (
        p_region is null
        or c.region = p_region
        or exists (
          select 1 from public.partner_service_regions r
          where r.partner_company_id = c.id
            and (r.nationwide or r.region = p_region)
        )
      )
      and (
        params.city_needle is null
        or (c.city is not null
            and public.reference_city_compare_form(c.city)
                like '%' || params.city_needle || '%')
        or exists (
          select 1 from public.partner_service_regions r
          where r.partner_company_id = c.id
            and (r.nationwide
                 or (r.city is not null
                     and public.reference_city_compare_form(r.city)
                         like '%' || params.city_needle || '%'))
        )
      )
      and (
        p_min_radius_km is null
        or exists (
          select 1 from public.partner_service_regions r
          where r.partner_company_id = c.id
            and (r.nationwide or coalesce(r.radius_km, 0) >= p_min_radius_km)
        )
      )
      -- Availability on a given day, from an entry that states a window.
      and (
        p_available_on is null
        or exists (
          select 1 from public.partner_availability a
          where a.partner_company_id = c.id
            and a.status in ('available', 'partially_available')
            and (a.available_from is null or a.available_from <= p_available_on)
            and (a.available_until is null or a.available_until >= p_available_on)
        )
      )
      and (
        p_min_available_staff is null
        or exists (
          select 1 from public.partner_availability a
          where a.partner_company_id = c.id
            and coalesce(a.available_staff, 0) >= p_min_available_staff
        )
        or exists (
          select 1 from public.partner_services s
          where s.partner_company_id = c.id
            and s.confirmation = 'confirmed'
            and coalesce(s.available_staff, 0) >= p_min_available_staff
        )
      )
      -- Credential state. `valid` demands an accepted, unexpired credential;
      -- an unreviewed or undated one never counts as valid.
      and (
        p_credential_state is null
        or (p_credential_state = 'valid' and exists (
              select 1 from public.partner_qualifications q
              where q.partner_company_id = c.id
                and q.review_status = 'accepted'
                and q.valid_until is not null
                and q.valid_until > current_date + 90))
        or (p_credential_state = 'expiring' and exists (
              select 1 from public.partner_qualifications q
              where q.partner_company_id = c.id
                and q.valid_until is not null
                and q.valid_until >= current_date
                and q.valid_until <= current_date + 90))
        or (p_credential_state = 'expired' and exists (
              select 1 from public.partner_qualifications q
              where q.partner_company_id = c.id
                and q.valid_until is not null
                and q.valid_until < current_date))
        or (p_credential_state = 'pending' and exists (
              select 1 from public.partner_qualifications q
              where q.partner_company_id = c.id
                and q.review_status = 'pending'))
        or (p_credential_state = 'missing' and not exists (
              select 1 from public.partner_qualifications q
              where q.partner_company_id = c.id
                and q.review_status = 'accepted'))
      )
      -- Companies currently looking for a subcontractor, judged by an open
      -- demand signal rather than by the stored direction: the direction is a
      -- standing property, the signal is the current situation.
      and (
        p_has_open_demand_signal is null
        or (p_has_open_demand_signal and exists (
              select 1 from public.partner_signals g
              where g.partner_company_id = c.id
                and g.signal_type in ('seeks_subcontractor',
                                      'seeks_further_subcontractor',
                                      'seeks_security',
                                      'seeks_construction_support',
                                      'seeks_cleaning')
                and g.status in ('new', 'reviewed', 'relevant', 'contacted')
                and (g.valid_until is null or g.valid_until >= current_date)))
        or (not p_has_open_demand_signal and not exists (
              select 1 from public.partner_signals g
              where g.partner_company_id = c.id
                and g.signal_type in ('seeks_subcontractor',
                                      'seeks_further_subcontractor',
                                      'seeks_security',
                                      'seeks_construction_support',
                                      'seeks_cleaning')
                and g.status in ('new', 'reviewed', 'relevant', 'contacted')
                and (g.valid_until is null or g.valid_until >= current_date)))
      )
  )
  select f.id, count(*) over () as total_count
  from filtered f
  cross join params
  order by
    (case when params.sort = 'legal_name' and params.direction = 'asc'
          then f.legal_name end) asc nulls last,
    (case when params.sort = 'legal_name' and params.direction = 'desc'
          then f.legal_name end) desc nulls last,
    (case when params.sort = 'status' and params.direction = 'asc'
          then f.status::text end) asc nulls last,
    (case when params.sort = 'status' and params.direction = 'desc'
          then f.status::text end) desc nulls last,
    (case when params.sort = 'last_contact' and params.direction = 'asc'
          then f.last_contact_at end) asc nulls last,
    (case when params.sort = 'last_contact' and params.direction = 'desc'
          then f.last_contact_at end) desc nulls last,
    (case when params.sort = 'follow_up' and params.direction = 'asc'
          then f.next_follow_up_at end) asc nulls last,
    (case when params.sort = 'follow_up' and params.direction = 'desc'
          then f.next_follow_up_at end) desc nulls last,
    (case when params.sort = 'created_at' and params.direction = 'asc'
          then f.created_at end) asc nulls last,
    (case when params.sort = 'created_at' and params.direction = 'desc'
          then f.created_at end) desc nulls last,
    -- Deterministic tie-breaker: without it two pages can show the same row.
    f.created_at desc,
    f.id
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_partner_companies is
  'Filtered, sorted and paged search over partner_companies. Runs as the '
  'caller (security invoker), so RLS applies. Returns ids plus the total '
  'count of matches before paging.';

revoke all on function public.search_partner_companies(
  uuid, text, text[], text[], text[], text, text, text, integer, text[], text,
  integer, date, text, boolean, boolean, boolean, boolean, boolean, date, date,
  text, text, integer, integer
) from public;

grant execute on function public.search_partner_companies(
  uuid, text, text[], text[], text[], text, text, text, integer, text[], text,
  integer, date, text, boolean, boolean, boolean, boolean, boolean, date, date,
  text, text, integer, integer
) to authenticated;
