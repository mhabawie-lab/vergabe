/**
 * Filter bar of the partner list.
 *
 * A plain form that submits to the same route, so every filter ends up in the
 * URL: a colleague can be sent a link and sees the same list. The filtering
 * itself happens server-side before pagination — see
 * `search_partner_companies` (migration 0013).
 */

import { LinkButton } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import type { PartnerFacets } from '@/lib/db/partner-ports';
import {
  CREDENTIAL_FILTER_LABELS,
  CREDENTIAL_FILTER_STATES,
  type PartnerQuery,
} from '@/modules/partners/query';
import {
  DATACENTER_EXPERIENCE_LABELS,
  DATACENTER_EXPERIENCE_STATUSES,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  RELATIONSHIP_DIRECTIONS,
  RELATIONSHIP_DIRECTION_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
} from '@/types/partner';

export function PartnerFilters({
  query,
  facets,
}: {
  query: PartnerQuery;
  facets: PartnerFacets;
}) {
  return (
    <form
      action="/subcontractors"
      className="grid grid-cols-1 gap-3 border-b border-border-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Input
        name="q"
        type="search"
        defaultValue={query.q ?? ''}
        placeholder="Firma, Ort, Registernummer …"
        aria-label="Volltextsuche"
        className="sm:col-span-2"
      />

      <Select
        name="directions"
        defaultValue={query.directions?.[0] ?? ''}
        aria-label="Beziehungsrichtung"
        placeholder="Beide Richtungen"
        options={RELATIONSHIP_DIRECTIONS.map((direction) => ({
          value: direction,
          label: RELATIONSHIP_DIRECTION_LABELS[direction],
        }))}
      />

      <Select
        name="services"
        defaultValue={query.services?.[0] ?? ''}
        aria-label="Leistung"
        placeholder="Alle Leistungen"
        options={PARTNER_SERVICE_CATEGORIES.filter(
          (category) => category !== 'unknown',
        ).map((category) => ({
          value: category,
          label: PARTNER_SERVICE_CATEGORY_LABELS[category],
        }))}
      />

      <Select
        name="country"
        defaultValue={query.country ?? ''}
        aria-label="Land"
        placeholder="Alle Länder"
        options={facets.countries.map((country) => ({ value: country, label: country }))}
      />

      <Select
        name="region"
        defaultValue={query.region ?? ''}
        aria-label="Region"
        placeholder="Alle Regionen"
        options={facets.regions.map((region) => ({ value: region, label: region }))}
      />

      <Input
        name="city"
        defaultValue={query.city ?? ''}
        placeholder="Ort"
        aria-label="Ort"
      />

      <Input
        name="minRadiusKm"
        type="number"
        min={0}
        defaultValue={query.minRadiusKm ?? ''}
        placeholder="Radius ab … km"
        aria-label="Mindestradius in Kilometern"
      />

      <Input
        name="availableOn"
        type="date"
        defaultValue={query.availableOn ?? ''}
        aria-label="Verfügbar am"
      />

      <Input
        name="minAvailableStaff"
        type="number"
        min={0}
        defaultValue={query.minAvailableStaff ?? ''}
        placeholder="Mitarbeiter ab …"
        aria-label="Verfügbare Mitarbeiter mindestens"
      />

      <Select
        name="datacenter"
        defaultValue={query.datacenter ?? ''}
        aria-label="Datacenter-Erfahrung"
        placeholder="Datacenter: egal"
        options={DATACENTER_EXPERIENCE_STATUSES.map((status) => ({
          value: status,
          label: DATACENTER_EXPERIENCE_LABELS[status],
        }))}
      />

      <Select
        name="verifications"
        defaultValue={query.verifications?.[0] ?? ''}
        aria-label="Verifizierungsstatus"
        placeholder="Verifizierung: egal"
        options={VERIFICATION_STATUSES.map((status) => ({
          value: status,
          label: VERIFICATION_STATUS_LABELS[status],
        }))}
      />

      <Select
        name="credentialState"
        defaultValue={query.credentialState ?? ''}
        aria-label="Nachweise"
        placeholder="Nachweise: egal"
        options={CREDENTIAL_FILTER_STATES.map((state) => ({
          value: state,
          label: CREDENTIAL_FILTER_LABELS[state],
        }))}
      />

      <Select
        name="statuses"
        defaultValue={query.statuses?.[0] ?? ''}
        aria-label="Partnerstatus"
        placeholder="Alle Status"
        options={PARTNER_STATUSES.map((status) => ({
          value: status,
          label: PARTNER_STATUS_LABELS[status],
        }))}
      />

      <Select
        name="demand"
        defaultValue={query.demand === undefined ? '' : query.demand ? 'true' : 'false'}
        aria-label="Sucht Subunternehmer"
        placeholder="Bedarf: egal"
        options={[
          { value: 'true', label: 'Sucht aktuell Subunternehmer' },
          { value: 'false', label: 'Kein offener Bedarf' },
        ]}
      />

      <Select
        name="preferred"
        defaultValue={
          query.preferred === undefined ? '' : query.preferred ? 'true' : 'false'
        }
        aria-label="Bevorzugt"
        placeholder="Bevorzugt: egal"
        options={[
          { value: 'true', label: 'Nur bevorzugte' },
          { value: 'false', label: 'Ohne bevorzugte' },
        ]}
      />

      <Select
        name="blocked"
        defaultValue={query.blocked === undefined ? '' : query.blocked ? 'true' : 'false'}
        aria-label="Gesperrt"
        placeholder="Gesperrte einschließen"
        options={[
          { value: 'true', label: 'Nur gesperrte' },
          { value: 'false', label: 'Gesperrte ausblenden' },
        ]}
      />

      <Input
        name="lastContactBefore"
        type="date"
        defaultValue={query.lastContactBefore ?? ''}
        aria-label="Letzter Kontakt vor"
      />

      <Input
        name="followUpBefore"
        type="date"
        defaultValue={query.followUpBefore ?? ''}
        aria-label="Wiedervorlage bis"
      />

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          Filtern
        </button>
        <LinkButton href="/subcontractors" size="md">
          Zurücksetzen
        </LinkButton>
      </div>
    </form>
  );
}
