'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, type SelectOption } from '@/components/ui/form';
import { CPV_CATALOGUE } from '@/config/cpv';
import { COUNTRIES, REGIONS } from '@/config/regions';
import { SECTORS } from '@/config/sectors';
import { TENDER_STATUS_LABELS, TENDER_STATUSES } from '@/types/tender';
import {
  TENDER_SORT_FIELDS,
  TENDER_SORT_LABELS,
  type TenderSearchQuery,
} from '@/modules/tenders/query';
import type { FilterFacets } from '@/lib/db/ports';

/**
 * The search filter panel.
 *
 * Filters are held in the URL, not in component state, so a filtered result
 * list is shareable and survives a reload. Submitting builds a fresh query
 * string and navigates; the server page re-runs the search.
 */

const SECTOR_OPTIONS: SelectOption[] = SECTORS.map((sector) => ({
  value: sector.key,
  label: sector.label,
}));

const CPV_OPTIONS: SelectOption[] = CPV_CATALOGUE.map((entry) => ({
  value: entry.code,
  label: `${entry.code} — ${entry.label}`,
}));

const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.label,
}));

const REGION_OPTIONS: SelectOption[] = REGIONS.map((region) => ({
  value: region.code,
  label: region.label,
}));

const STATUS_OPTIONS: SelectOption[] = TENDER_STATUSES.map((status) => ({
  value: status,
  label: TENDER_STATUS_LABELS[status],
}));

const SORT_OPTIONS: SelectOption[] = TENDER_SORT_FIELDS.map((field) => ({
  value: field,
  label: TENDER_SORT_LABELS[field],
}));

/** Reads a form field, returning undefined for an empty value. */
function value(form: FormData, key: string): string | undefined {
  const raw = form.get(key);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface TenderFiltersProps {
  query: TenderSearchQuery;
  facets: FilterFacets;
  activeCount: number;
}

export function TenderFilters({ query, facets, activeCount }: TenderFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Collapsed by default below lg so the result list stays reachable on phones.
  const [expanded, setExpanded] = useState(activeCount > 0);

  const sourceOptions: SelectOption[] = facets.sources.map((source) => ({
    value: source.key,
    label: source.isDemo ? `${source.name} (DEMO)` : source.name,
  }));

  const authorityOptions: SelectOption[] = facets.authorities.map((authority) => ({
    value: authority.id,
    label: authority.name,
  }));

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const key of [
      'q',
      'sectors',
      'cpv',
      'countries',
      'regions',
      'city',
      'authorityId',
      'sources',
      'statuses',
      'valueMin',
      'valueMax',
      'publishedFrom',
      'publishedTo',
      'deadlineFrom',
      'deadlineTo',
      'durationMinMonths',
      'durationMaxMonths',
      'sort',
      'direction',
      'pageSize',
    ]) {
      const entry = value(form, key);
      if (entry !== undefined) params.set(key, entry);
    }

    if (form.get('openOnly') === 'on') params.set('openOnly', 'true');

    // A new filter set always starts on page 1.
    router.push(params.size === 0 ? '/tenders' : `/tenders?${params.toString()}`);
  }

  function handleReset(): void {
    router.push('/tenders');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-subtle bg-surface-raised shadow-card"
    >
      <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Volltextsuche: Titel, Aktenzeichen, Leistungsbeschreibung …"
            aria-label="Volltextsuche"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary">
            Suchen
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            <Filter className="size-4" aria-hidden />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 rounded bg-brand px-1.5 text-[11px] text-brand-foreground">
                {activeCount}
              </span>
            )}
          </Button>
          {activeCount > 0 && (
            <Button type="button" variant="ghost" onClick={handleReset} title="Filter zurücksetzen">
              <RotateCcw className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Zurücksetzen</span>
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Field label="Branche" htmlFor="filter-sectors">
            <Select
              id="filter-sectors"
              name="sectors"
              defaultValue={query.sectors?.[0] ?? ''}
              options={SECTOR_OPTIONS}
              placeholder="Alle Branchen"
            />
          </Field>

          <Field label="CPV-Code" htmlFor="filter-cpv">
            <Select
              id="filter-cpv"
              name="cpv"
              defaultValue={query.cpv?.[0] ?? ''}
              options={CPV_OPTIONS}
              placeholder="Alle CPV-Codes"
            />
          </Field>

          <Field label="Land" htmlFor="filter-countries">
            <Select
              id="filter-countries"
              name="countries"
              defaultValue={query.countries?.[0] ?? ''}
              options={COUNTRY_OPTIONS}
              placeholder="Alle Länder"
            />
          </Field>

          <Field label="Bundesland / Region" htmlFor="filter-regions">
            <Select
              id="filter-regions"
              name="regions"
              defaultValue={query.regions?.[0] ?? ''}
              options={REGION_OPTIONS}
              placeholder="Alle Regionen"
            />
          </Field>

          <Field label="Stadt" htmlFor="filter-city">
            <Input
              id="filter-city"
              name="city"
              defaultValue={query.city ?? ''}
              placeholder="z. B. Musterstadt"
              list="filter-city-options"
            />
            <datalist id="filter-city-options">
              {facets.cities.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </Field>

          <Field label="Auftraggeber" htmlFor="filter-authority">
            <Select
              id="filter-authority"
              name="authorityId"
              defaultValue={query.authorityId ?? ''}
              options={authorityOptions}
              placeholder="Alle Auftraggeber"
            />
          </Field>

          <Field label="Quelle" htmlFor="filter-sources">
            <Select
              id="filter-sources"
              name="sources"
              defaultValue={query.sources?.[0] ?? ''}
              options={sourceOptions}
              placeholder="Alle Quellen"
            />
          </Field>

          <Field label="Status" htmlFor="filter-statuses">
            <Select
              id="filter-statuses"
              name="statuses"
              defaultValue={query.statuses?.[0] ?? ''}
              options={STATUS_OPTIONS}
              placeholder="Alle Status"
            />
          </Field>

          <Field label="Auftragswert von (EUR)" htmlFor="filter-value-min">
            <Input
              id="filter-value-min"
              name="valueMin"
              type="number"
              min={0}
              step={1000}
              defaultValue={query.valueMin ?? ''}
              placeholder="0"
            />
          </Field>

          <Field label="Auftragswert bis (EUR)" htmlFor="filter-value-max">
            <Input
              id="filter-value-max"
              name="valueMax"
              type="number"
              min={0}
              step={1000}
              defaultValue={query.valueMax ?? ''}
              placeholder="ohne Begrenzung"
            />
          </Field>

          <Field label="Veröffentlicht ab" htmlFor="filter-published-from">
            <Input
              id="filter-published-from"
              name="publishedFrom"
              type="date"
              defaultValue={query.publishedFrom ?? ''}
            />
          </Field>

          <Field label="Veröffentlicht bis" htmlFor="filter-published-to">
            <Input
              id="filter-published-to"
              name="publishedTo"
              type="date"
              defaultValue={query.publishedTo ?? ''}
            />
          </Field>

          <Field label="Angebotsfrist ab" htmlFor="filter-deadline-from">
            <Input
              id="filter-deadline-from"
              name="deadlineFrom"
              type="date"
              defaultValue={query.deadlineFrom ?? ''}
            />
          </Field>

          <Field label="Angebotsfrist bis" htmlFor="filter-deadline-to">
            <Input
              id="filter-deadline-to"
              name="deadlineTo"
              type="date"
              defaultValue={query.deadlineTo ?? ''}
            />
          </Field>

          <Field label="Laufzeit ab (Monate)" htmlFor="filter-duration-min">
            <Input
              id="filter-duration-min"
              name="durationMinMonths"
              type="number"
              min={0}
              defaultValue={query.durationMinMonths ?? ''}
              placeholder="0"
            />
          </Field>

          <Field label="Laufzeit bis (Monate)" htmlFor="filter-duration-max">
            <Input
              id="filter-duration-max"
              name="durationMaxMonths"
              type="number"
              min={0}
              defaultValue={query.durationMaxMonths ?? ''}
              placeholder="ohne Begrenzung"
            />
          </Field>

          <Field label="Sortierung" htmlFor="filter-sort">
            <Select
              id="filter-sort"
              name="sort"
              defaultValue={query.sort}
              options={SORT_OPTIONS}
            />
          </Field>

          <Field label="Reihenfolge" htmlFor="filter-direction">
            <Select
              id="filter-direction"
              name="direction"
              defaultValue={query.direction}
              options={[
                { value: 'desc', label: 'Absteigend' },
                { value: 'asc', label: 'Aufsteigend' },
              ]}
            />
          </Field>

          <div className="flex items-end pb-1">
            <Checkbox
              name="openOnly"
              label="Nur laufende Ausschreibungen"
              defaultChecked={query.openOnly === true}
            />
          </div>

          {/* Preserve the page size across filter changes. */}
          <input
            type="hidden"
            name="pageSize"
            value={searchParams.get('pageSize') ?? ''}
          />
        </div>
      )}
    </form>
  );
}
