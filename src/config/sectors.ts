/**
 * Focus sectors SicherVergabe launches with.
 *
 * Sector keys are stable identifiers persisted in the database
 * (`tenders.sectors`). Labels are display-only and may change freely.
 */

export const SECTOR_KEYS = [
  'security_services',
  'data_center',
  'construction_site_security',
  'property_protection',
  'reception_gate_services',
  'refugee_accommodation',
  'fire_watch',
  'cleaning',
  'facility_management',
] as const;

export type SectorKey = (typeof SECTOR_KEYS)[number];

export interface SectorDefinition {
  key: SectorKey;
  label: string;
  /** Short description used in filter tooltips and the company profile. */
  description: string;
  /** CPV prefixes that typically indicate this sector. */
  cpvPrefixes: readonly string[];
}

export const SECTORS: readonly SectorDefinition[] = [
  {
    key: 'security_services',
    label: 'Sicherheitsdienstleistungen',
    description: 'Allgemeine Sicherheits- und Wachdienstleistungen.',
    // 79700000 ("Ermittlungs- und Sicherheitsdienste") is the branch root.
    // Buyers routinely file under it instead of a child code, so leaving it
    // out drops genuine security tenders from the sector.
    cpvPrefixes: ['79700000', '79710000', '79713000'],
  },
  {
    key: 'data_center',
    label: 'Rechenzentren / Data Center',
    description: 'Bewachung und Betrieb von Rechenzentren und kritischer IT-Infrastruktur.',
    cpvPrefixes: ['79711000', '72500000'],
  },
  {
    key: 'construction_site_security',
    label: 'Baustellenbewachung',
    description: 'Bewachung von Baustellen und Baustelleneinrichtungen.',
    cpvPrefixes: ['79714000'],
  },
  {
    key: 'property_protection',
    label: 'Objektschutz',
    description: 'Schutz von Gebäuden, Liegenschaften und Anlagen.',
    cpvPrefixes: ['79713000', '79714000'],
  },
  {
    key: 'reception_gate_services',
    label: 'Empfangs- und Pfortendienste',
    description: 'Empfang, Pforte, Besuchermanagement und Zutrittskontrolle.',
    cpvPrefixes: ['79992000', '98341120'],
  },
  {
    key: 'refugee_accommodation',
    label: 'Flüchtlingsunterkünfte / Notunterkünfte',
    description: 'Betreuung und Bewachung von Gemeinschafts- und Notunterkünften.',
    cpvPrefixes: ['85311000', '98341000'],
  },
  {
    key: 'fire_watch',
    label: 'Brandwache',
    description: 'Brandsicherheitswachdienst und vorbeugender Brandschutz.',
    cpvPrefixes: ['75251110'],
  },
  {
    key: 'cleaning',
    label: 'Reinigung',
    description: 'Unterhalts-, Glas- und Sonderreinigung.',
    cpvPrefixes: ['90910000', '90911200', '90919200'],
  },
  {
    key: 'facility_management',
    label: 'Facility Management',
    description: 'Technisches und infrastrukturelles Gebäudemanagement.',
    cpvPrefixes: ['79993000', '50700000'],
  },
] as const;

const SECTOR_BY_KEY = new Map<string, SectorDefinition>(
  SECTORS.map((sector) => [sector.key, sector]),
);

export function getSector(key: string): SectorDefinition | undefined {
  return SECTOR_BY_KEY.get(key);
}

export function getSectorLabel(key: string): string {
  return SECTOR_BY_KEY.get(key)?.label ?? key;
}

export function isSectorKey(value: string): value is SectorKey {
  return SECTOR_BY_KEY.has(value);
}

/**
 * Turns a CPV prefix from `SECTORS` into a comparable prefix.
 *
 * CPV codes are hierarchical and padded with trailing zeros: `90910000`
 * ("Reinigungsdienste") is the parent of `90911200` ("Gebäudereinigung").
 * Plain `startsWith` would miss that, so the padding is stripped first. The
 * final check digit is not part of the hierarchy and is never compared.
 */
function toCpvPrefix(code: string): string {
  const digits = code.split('-')[0] ?? code;
  return digits.replace(/0+$/, '');
}

/**
 * Sectors implied by a set of CPV codes.
 *
 * Used by mappers whose source classifies tenders by CPV only (TED does) to
 * fill `tenders.sectors`. Unmatched codes simply yield no sector — the field
 * stays empty rather than being filled with a guess.
 */
export function findSectorsForCpvCodes(cpvCodes: readonly string[]): SectorKey[] {
  const matched = new Set<SectorKey>();

  for (const sector of SECTORS) {
    const prefixes = sector.cpvPrefixes.map(toCpvPrefix).filter((p) => p.length > 0);
    // Only a code at or below the sector's own level counts. The reverse —
    // a tender filed under a broader parent code — is deliberately not a
    // match: `90000000` says "some cleaning-adjacent service", not "cleaning".
    const hit = cpvCodes.some((code) => {
      const normalized = toCpvPrefix(code.trim());
      return prefixes.some((prefix) => normalized.startsWith(prefix));
    });
    if (hit) matched.add(sector.key);
  }

  return [...matched];
}
