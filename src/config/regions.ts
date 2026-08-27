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

// ---------------------------------------------------------------------------
// Code translation for external sources
// ---------------------------------------------------------------------------

/**
 * ISO 3166-1 alpha-3 → alpha-2.
 *
 * TED and other EU sources publish alpha-3 codes; the internal model stores
 * alpha-2 (see `COUNTRIES`). Limited to the countries the platform covers —
 * an unknown code stays unmapped rather than being guessed at.
 */
const ALPHA2_BY_ALPHA3: Record<string, string> = {
  AUT: 'AT',
  BEL: 'BE',
  BGR: 'BG',
  CHE: 'CH',
  CYP: 'CY',
  CZE: 'CZ',
  DEU: 'DE',
  DNK: 'DK',
  ESP: 'ES',
  EST: 'EE',
  FIN: 'FI',
  FRA: 'FR',
  GRC: 'GR',
  HRV: 'HR',
  HUN: 'HU',
  IRL: 'IE',
  ISL: 'IS',
  ITA: 'IT',
  LIE: 'LI',
  LTU: 'LT',
  LUX: 'LU',
  LVA: 'LV',
  MLT: 'MT',
  NLD: 'NL',
  NOR: 'NO',
  POL: 'PL',
  PRT: 'PT',
  ROU: 'RO',
  SVK: 'SK',
  SVN: 'SI',
  SWE: 'SE',
};

/**
 * Translates an ISO 3166-1 alpha-3 country code into the alpha-2 code the
 * internal model uses. Returns `null` for anything not in the table — a
 * missing country is preferable to an invented one.
 */
export function alpha3ToAlpha2(code: string | null): string | null {
  if (code === null) return null;
  return ALPHA2_BY_ALPHA3[code.trim().toUpperCase()] ?? null;
}

/**
 * German NUTS level 1 code → federal state abbreviation.
 *
 * NUTS-1 is the first three characters of any German NUTS code, so a NUTS-2
 * or NUTS-3 code such as `DE40E` resolves through its `DE4` prefix.
 */
const REGION_CODE_BY_NUTS1: Record<string, string> = {
  DE1: 'BW',
  DE2: 'BY',
  DE3: 'BE',
  DE4: 'BB',
  DE5: 'HB',
  DE6: 'HH',
  DE7: 'HE',
  DE8: 'MV',
  DE9: 'NI',
  DEA: 'NW',
  DEB: 'RP',
  DEC: 'SL',
  DED: 'SN',
  DEE: 'ST',
  DEF: 'SH',
  DEG: 'TH',
};

/**
 * Resolves a NUTS code to a German federal state abbreviation.
 *
 * Only German codes resolve; every other country's NUTS codes return `null`
 * because `REGIONS` is a German catalogue and no equivalent exists yet.
 */
export function nutsToRegionCode(nuts: string | null): string | null {
  if (nuts === null) return null;
  const normalized = nuts.trim().toUpperCase();
  if (normalized.length < 3 || !normalized.startsWith('DE')) return null;
  return REGION_CODE_BY_NUTS1[normalized.slice(0, 3)] ?? null;
}
