-- ---------------------------------------------------------------------------
-- 0010 — Server-side search for reference projects
--
-- Purely additive: adds one function and two indexes, changes no table and
-- deletes no data.
--
-- Why a function at all: the service filters ("has a confirmed service of this
-- category", "only untouched proposals") live in a child table and cannot be
-- expressed through PostgREST together with paging. Applying them to the page
-- that was already fetched produces wrong totals and wrong pages — a page of
-- 25 rows filtered down to 4 while the counter still says 25. So the filtering
-- happens where the data is.
--
-- Security:
--   * `security invoker` — the function runs with the caller's rights, so
--     Row Level Security on `reference_projects` applies unchanged. It grants
--     no access that a direct query would not.
--   * The organisation is checked explicitly as well (`is_org_member`), so a
--     foreign `organization_id` returns an empty result instead of an error —
--     nothing to probe.
--   * No dynamic SQL. Sort field and direction are matched against a fixed
--     whitelist; an unknown value falls back to the default rather than
--     reaching the query.
--   * Search text is used as a parameter and its LIKE metacharacters are
--     escaped, so `%` in a search term matches a literal percent sign.
--
-- The function returns ids and the total count only. The rows themselves are
-- read through the existing table select, so the mapping to the application
-- types stays in one place.
-- ---------------------------------------------------------------------------

-- Supports the "has a service of category X" lookups below.
create index if not exists reference_project_services_project_category_idx
  on public.reference_project_services (reference_project_id, service_category);

create index if not exists reference_project_services_project_status_idx
  on public.reference_project_services (reference_project_id, confirmation_status);

-- ---------------------------------------------------------------------------
-- Comparison forms
--
-- These mirror `normalizeForComparison` and `normalizeCityName` in
-- `src/modules/references/normalize.ts` so the database search and the
-- in-process development store answer the same question the same way. Without
-- them "Musterstadt" and "Musterstädt" would match in one adapter and not in
-- the other, and a test against the memory store would prove nothing about
-- production.
--
-- `stable`, not `immutable`, because `unaccent` is stable — so these cannot
-- back an index. Reference data is a few thousand rows per organisation; the
-- sequential scan is the cheaper trade against two diverging behaviours.
-- ---------------------------------------------------------------------------
create or replace function public.reference_compare_form(value text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select btrim(
    regexp_replace(unaccent(lower(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g')
  );
$$;

create or replace function public.reference_city_compare_form(value text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(public.reference_compare_form(value), '\ma\s*m\M', 'am', 'g'),
        '\mst\M', 'sankt', 'g'),
      '\mstr\M', 'strasse', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function public.search_reference_projects(
  p_organization_id uuid,
  p_query text default null,
  p_client_id uuid default null,
  p_city text default null,
  p_region text default null,
  p_object_type text default null,
  p_services text[] default null,
  p_statuses text[] default null,
  p_reference_status text default null,
  p_confirmation_status text default null,
  p_period_from date default null,
  p_period_to date default null,
  p_sort text default 'start_date',
  p_direction text default 'desc',
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
      -- Whitelist. Anything unexpected becomes the default; the value never
      -- becomes part of the statement itself.
      case
        when p_sort in ('project_name', 'client', 'start_date') then p_sort
        else 'start_date'
      end as sort,
      case when p_direction = 'asc' then 'asc' else 'desc' end as direction,
      -- Folded to the comparison form; LIKE metacharacters do not survive
      -- that, so a search for "%" is an empty search rather than a wildcard.
      nullif(public.reference_compare_form(p_query), '') as needle,
      nullif(public.reference_city_compare_form(p_city), '') as city_needle
  ),
  filtered as (
    select
      p.id,
      p.project_name,
      p.start_date,
      p.created_at,
      coalesce(c.name, '') as client_name
    from public.reference_projects p
    left join public.business_clients c on c.id = p.business_client_id
    cross join params
    where p.organization_id = p_organization_id
      -- Belt and braces next to RLS: a foreign organisation yields nothing.
      and public.is_org_member(p_organization_id)
      and (p_client_id is null or p.business_client_id = p_client_id)
      and (
        params.city_needle is null
        or (p.city is not null
            and public.reference_city_compare_form(p.city)
                like '%' || params.city_needle || '%')
      )
      and (p_region is null or p.region = p_region)
      and (p_object_type is null or p.object_type = p_object_type)
      and (p_statuses is null or array_length(p_statuses, 1) is null
           or p.project_status::text = any (p_statuses))
      -- One haystack over the same fields the development store searches.
      and (
        params.needle is null
        or public.reference_compare_form(
             concat_ws(' ', p.project_name, p.external_object_number,
                       c.name, p.city, p.object_type)
           ) like '%' || params.needle || '%'
      )
      -- An open-ended project matches every period: a missing date is not
      -- evidence that the project lies outside the window.
      and (p_period_from is null or p.end_date is null or p.end_date >= p_period_from)
      and (p_period_to is null or p.start_date is null or p.start_date <= p_period_to)
      and (
        p_services is null or array_length(p_services, 1) is null
        or exists (
          select 1 from public.reference_project_services s
          where s.reference_project_id = p.id
            and s.service_category::text = any (p_services)
        )
      )
      -- Reference status: is anything still undecided on this project?
      and (
        p_reference_status is null
        or (p_reference_status = 'open' and exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id
                and s.confirmation_status = 'proposed'))
        or (p_reference_status = 'confirmed' and not exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id
                and s.confirmation_status = 'proposed'))
      )
      -- Confirmation status. Only `confirmed` and `manual` count as evidence;
      -- `rejected` and `unknown` are decisions, but not proof of a service.
      and (
        p_confirmation_status is null
        or (p_confirmation_status = 'evidence' and exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id
                and s.confirmation_status in ('confirmed', 'manual')))
        or (p_confirmation_status = 'undecided' and exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id
                and s.confirmation_status = 'proposed'))
        or (p_confirmation_status = 'proposed' and exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id)
            and not exists (
              select 1 from public.reference_project_services s
              where s.reference_project_id = p.id
                and s.confirmation_status in ('confirmed', 'manual')))
      )
  )
  select
    f.id,
    count(*) over () as total_count
  from filtered f
  cross join params
  order by
    (case when params.sort = 'project_name' and params.direction = 'asc'
          then f.project_name end) asc nulls last,
    (case when params.sort = 'project_name' and params.direction = 'desc'
          then f.project_name end) desc nulls last,
    (case when params.sort = 'client' and params.direction = 'asc'
          then f.client_name end) asc nulls last,
    (case when params.sort = 'client' and params.direction = 'desc'
          then f.client_name end) desc nulls last,
    (case when params.sort = 'start_date' and params.direction = 'asc'
          then f.start_date end) asc nulls last,
    (case when params.sort = 'start_date' and params.direction = 'desc'
          then f.start_date end) desc nulls last,
    -- Deterministic tie-breaker: without it two pages can show the same row.
    f.created_at desc,
    f.id
  -- Bounded here as well: a caller cannot ask for an unlimited page.
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_reference_projects is
  'Filtered, sorted and paged search over reference_projects. Runs as the '
  'caller (security invoker), so RLS applies. Returns ids plus the total '
  'count of matches before paging.';

revoke all on function public.search_reference_projects(
  uuid, text, uuid, text, text, text, text[], text[], text, text, date, date,
  text, text, integer, integer
) from public;

grant execute on function public.search_reference_projects(
  uuid, text, uuid, text, text, text, text[], text[], text, text, date, date,
  text, text, integer, integer
) to authenticated;
