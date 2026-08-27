-- 0017_register_ted_eforms_source.sql
-- Registers TED / EU eForms as the first live tender source.
--
-- This is a SOURCE row only. No tender is inserted here: records are produced
-- by running the connector through the normal pipeline
-- (npx tsx scripts/run-ingestion.ts ted-eforms), which stores the untouched
-- payload in raw_imports first.
--
-- is_demo = false, so the trigger from 0006 will reject any record derived
-- from this source that is flagged as demo data — live and demo records stay
-- separable in every query (CLAUDE.md § Daten-Integrität).
--
-- The connector needs no credentials: the TED search API is public. Should
-- that change, the key belongs in an environment variable, never in this
-- non-secret config column.
--
-- config keys, all optional and defaulted in src/modules/connectors/
-- sources/ted-eforms/config.ts:
--   cpvCodes             CPV scope; a trailing "*" is TED's wildcard
--   countries            place of performance, ISO 3166-1 alpha-3
--   noticeTypes          optional narrowing, e.g. ["cn-standard"]
--   lookbackDays         size of the publication window per run
--   pageSize             notices per request (TED caps at 100)
--   maxNoticesPerRun     upper bound so a widened scope cannot run away
--   requestTimeoutMs     per-request timeout
--   maxRetries           retries with exponential backoff
--   minRequestIntervalMs per-source rate limit

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
  'ted-eforms',
  'TED / EU eForms',
  'api',
  'DE',
  'https://ted.europa.eu',
  'Tenders Electronic Daily — EU-weite Vergabebekanntmachungen oberhalb der Schwellenwerte im eForms-Format. Echte Live-Daten, gefiltert auf die Startbranchen und Deutschland als Erfüllungsort.',
  true,
  false,
  3600,
  jsonb_build_object(
    'cpvCodes', jsonb_build_array(
      '797*',      -- Sicherheits-, Wach-, Überwachungs- und Streifendienste
      '75251110',  -- Brandverhütung
      '90910000',  -- Reinigungsdienste
      '90911*',    -- Gebäude- und Wohnungsreinigung
      '90919*',    -- Büro- und Anlagenreinigung
      '98341*',    -- Unterbringungs- und Pförtnerdienste
      '85311000'   -- Soziale Betreuung mit Unterbringung
    ),
    'countries', jsonb_build_array('DEU'),
    'lookbackDays', 14,
    'pageSize', 100,
    'maxNoticesPerRun', 5000
  )
)
on conflict (key) do update
  set name              = excluded.name,
      source_type       = excluded.source_type,
      country_code      = excluded.country_code,
      website_url       = excluded.website_url,
      description       = excluded.description,
      -- is_active is operator-owned: a source switched off on purpose must
      -- not be switched back on by re-running this migration.
      is_demo           = false,
      updated_at        = now();
