/**
 * Geographic reference data used by the tender filters.
 *
 * Country codes follow ISO 3166-1 alpha-2, region codes follow the German
 * federal state abbreviations. Both are stored verbatim on `tenders` so
 * filters stay stable when display labels change.
 */

export interface CountryDefinition {
  code: string;
  label: string;
}

export const COUNTRIES: readonly CountryDefinition[] = [
  { code: 'DE', label: 'Deutschland' },
  { code: 'AT', label: 'Österreich' },
  { code: 'CH', label: 'Schweiz' },
  { code: 'NL', label: 'Niederlande' },
  { code: 'BE', label: 'Belgien' },
  { code: 'FR', label: 'Frankreich' },
  { code: 'LU', label: 'Luxemburg' },
  { code: 'PL', label: 'Polen' },
] as const;

export interface RegionDefinition {
  code: string;
  label: string;
  countryCode: string;
}

/** German federal states — the primary region dimension at launch. */
export const REGIONS: readonly RegionDefinition[] = [
  { code: 'BW', label: 'Baden-Württemberg', countryCode: 'DE' },
  { code: 'BY', label: 'Bayern', countryCode: 'DE' },
  { code: 'BE', label: 'Berlin', countryCode: 'DE' },
  { code: 'BB', label: 'Brandenburg', countryCode: 'DE' },
  { code: 'HB', label: 'Bremen', countryCode: 'DE' },
  { code: 'HH', label: 'Hamburg', countryCode: 'DE' },
  { code: 'HE', label: 'Hessen', countryCode: 'DE' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern', countryCode: 'DE' },
  { code: 'NI', label: 'Niedersachsen', countryCode: 'DE' },
  { code: 'NW', label: 'Nordrhein-Westfalen', countryCode: 'DE' },
  { code: 'RP', label: 'Rheinland-Pfalz', countryCode: 'DE' },
  { code: 'SL', label: 'Saarland', countryCode: 'DE' },
  { code: 'SN', label: 'Sachsen', countryCode: 'DE' },
  { code: 'ST', label: 'Sachsen-Anhalt', countryCode: 'DE' },
  { code: 'SH', label: 'Schleswig-Holstein', countryCode: 'DE' },
  { code: 'TH', label: 'Thüringen', countryCode: 'DE' },
] as const;

const COUNTRY_BY_CODE = new Map<string, CountryDefinition>(
  COUNTRIES.map((country) => [country.code, country]),
);

const REGION_BY_CODE = new Map<string, RegionDefinition>(
  REGIONS.map((region) => [region.code, region]),
);

export function getCountryLabel(code: string | null): string {
  if (code === null) return '—';
  return COUNTRY_BY_CODE.get(code)?.label ?? code;
}

export function getRegionLabel(code: string | null): string {
  if (code === null) return '—';
  return REGION_BY_CODE.get(code)?.label ?? code;
}
