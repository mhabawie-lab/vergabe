-- 0006_register_demo_source.sql
-- Registers the demo source.
--
-- This inserts the SOURCE row only — no tenders. Demo tender records are
-- produced by running the demo connector through the normal pipeline
-- (npm run ingest:demo), which flags every record is_demo = true.
--
-- No live source is registered in phase 1. TED and the German portals follow
-- in phase 2.

insert into public.sources (
  key,
  name,
  source_type,
  country_code,
  website_url,
  description,
  is_active,
  is_demo,
  poll_interval_seconds,
  config
)
values (
  'demo',
  'DEMO-Datenquelle',
  'manual',
  'DE',
  null,
  'Synthetische Beispieldaten zur Entwicklung und Abnahme. Erzeugt ausschließlich Datensätze mit is_demo = true. Keine echten Ausschreibungen.',
  true,
  true,
  86400,
  '{}'::jsonb
)
on conflict (key) do update
  set name        = excluded.name,
      description = excluded.description,
      is_demo     = true;

-- A demo source may never produce live-looking records. Enforced in the
-- database so no connector or migration can bypass it.
create or replace function public.enforce_demo_source_flag()
returns trigger
language plpgsql
as $$
declare
  source_is_demo boolean;
begin
  select s.is_demo into source_is_demo
  from public.sources s
  where s.id = new.source_id;

  if source_is_demo and not new.is_demo then
    raise exception
      'Source % is a demo source; % records must be flagged is_demo',
      new.source_id, tg_table_name;
  end if;

  return new;
end;
$$;

comment on function public.enforce_demo_source_flag() is
  'Guarantees records originating from a demo source are always flagged is_demo (CLAUDE.md § Daten-Integrität).';

create trigger tenders_enforce_demo_flag
  before insert or update on public.tenders
  for each row execute function public.enforce_demo_source_flag();

create trigger raw_imports_enforce_demo_flag
  before insert or update on public.raw_imports
  for each row execute function public.enforce_demo_source_flag();

create trigger contracting_authorities_enforce_demo_flag
  before insert or update on public.contracting_authorities
  for each row execute function public.enforce_demo_source_flag();

create trigger awards_enforce_demo_flag
  before insert or update on public.awards
  for each row execute function public.enforce_demo_source_flag();
