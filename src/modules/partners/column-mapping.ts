/**
 * Mapping source columns onto partner fields.
 *
 * The matching algorithm is shared with the phase-2 reference import
 * (`@/lib/import/column-matching`); only the field list and the German header
 * aliases are specific to this domain.
 */

import {
  applyMappingFor,
  findMissingFields,
  proposeMappingFor,
  toRawRecord,
  type ColumnAssignment as GenericColumnAssignment,
  type FieldMatcher,
} from '@/lib/import/column-matching';

export const PARTNER_IMPORT_FIELDS = [
  'legalName',
  'tradeName',
  'relationshipDirection',
  'partnerLevel',
  'serviceCategory',
  'country',
  'region',
  'city',
  'postalCode',
  'radiusKm',
  'contactName',
  'email',
  'phone',
  'website',
  'availableStaff',
  'availableFrom',
  'staffModel',
  'furtherSubcontracting',
  'datacenterExperience',
  'status',
  'verificationStatus',
  'seeksSubcontractor',
  'signalType',
  'projectName',
  'sourceName',
  'sourceUrl',
  'lastContactAt',
  'followUpAt',
  'note',
] as const;

export type PartnerImportField = (typeof PARTNER_IMPORT_FIELDS)[number];

export const PARTNER_IMPORT_FIELD_LABELS: Record<PartnerImportField, string> = {
  legalName: 'Firmenname',
  tradeName: 'Handelsname',
  relationshipDirection: 'Beziehungsrichtung',
  partnerLevel: 'Unternehmensebene',
  serviceCategory: 'Leistung',
  country: 'Land',
  region: 'Bundesland / Region',
  city: 'Ort',
  postalCode: 'PLZ',
  radiusKm: 'Radius (km)',
  contactName: 'Ansprechpartner',
  email: 'E-Mail',
  phone: 'Telefon',
  website: 'Website',
  availableStaff: 'Verfügbare Mitarbeiter',
  availableFrom: 'Verfügbar ab',
  staffModel: 'Eigene Mitarbeiter',
  furtherSubcontracting: 'Weitere Untervergabe',
  datacenterExperience: 'Datacenter-Erfahrung',
  status: 'Partnerstatus',
  verificationStatus: 'Verifizierungsstatus',
  seeksSubcontractor: 'Sucht Subunternehmer',
  signalType: 'Signaltyp',
  projectName: 'Projekt',
  sourceName: 'Quelle',
  sourceUrl: 'Quellen-URL',
  lastContactAt: 'Letzter Kontakt',
  followUpAt: 'Wiedervorlage',
  note: 'Notiz',
};

/** Without a company name there is nothing to create. */
export const REQUIRED_PARTNER_IMPORT_FIELDS: readonly PartnerImportField[] = [
  'legalName',
];

const FIELD_MATCHERS: readonly FieldMatcher<PartnerImportField>[] = [
  {
    field: 'legalName',
    aliases: ['firmenname', 'firma', 'unternehmen', 'name', 'firmierung', 'partner'],
  },
  { field: 'tradeName', aliases: ['handelsname', 'markenname', 'kurzname'] },
  {
    field: 'relationshipDirection',
    aliases: ['beziehungsrichtung', 'richtung', 'beziehung'],
  },
  {
    field: 'partnerLevel',
    aliases: ['unternehmensebene', 'ebene', 'stufe', 'partnerebene'],
  },
  {
    field: 'serviceCategory',
    aliases: ['leistung', 'leistungsart', 'gewerk', 'dienstleistung', 'service'],
  },
  { field: 'country', aliases: ['land', 'staat', 'country'] },
  { field: 'region', aliases: ['bundesland', 'region', 'kanton', 'bezirk'] },
  { field: 'city', aliases: ['ort', 'stadt', 'standort', 'sitz'] },
  { field: 'postalCode', aliases: ['plz', 'postleitzahl'] },
  { field: 'radiusKm', aliases: ['radius', 'einsatzradius', 'umkreis'] },
  {
    field: 'contactName',
    aliases: ['ansprechpartner', 'kontakt', 'kontaktperson', 'ansprechperson'],
  },
  { field: 'email', aliases: ['e mail', 'email', 'mail', 'e mail adresse'] },
  { field: 'phone', aliases: ['telefon', 'tel', 'telefonnummer', 'rufnummer', 'mobil'] },
  { field: 'website', aliases: ['website', 'webseite', 'homepage', 'internet', 'url'] },
  {
    field: 'availableStaff',
    aliases: ['verfugbare mitarbeiter', 'mitarbeiter', 'personal', 'kapazitat', 'anzahl mitarbeiter'],
  },
  {
    field: 'availableFrom',
    aliases: ['verfugbar ab', 'verfugbar', 'einsatzbereit ab', 'ab'],
  },
  {
    field: 'staffModel',
    aliases: ['eigene mitarbeiter', 'mitarbeitermodell', 'personalmodell'],
  },
  {
    field: 'furtherSubcontracting',
    aliases: ['weitere untervergabe', 'untervergabe', 'weitervergabe', 'nachunternehmer erlaubt'],
  },
  {
    field: 'datacenterExperience',
    aliases: ['datacenter erfahrung', 'datacenter', 'rechenzentrum', 'rz erfahrung'],
  },
  { field: 'status', aliases: ['partnerstatus', 'status'] },
  {
    field: 'verificationStatus',
    aliases: ['verifizierungsstatus', 'verifizierung', 'prufstatus', 'gepruft'],
  },
  {
    field: 'seeksSubcontractor',
    aliases: ['sucht subunternehmer', 'sucht nachunternehmer', 'sucht partner', 'sucht'],
  },
  { field: 'signalType', aliases: ['signaltyp', 'signal', 'hinweis', 'hinweistyp'] },
  { field: 'projectName', aliases: ['projekt', 'projektname', 'vorhaben', 'objekt'] },
  { field: 'sourceName', aliases: ['quelle', 'herkunft', 'fundstelle'] },
  { field: 'sourceUrl', aliases: ['quellen url', 'quelle url', 'quelllink', 'link'] },
  {
    field: 'lastContactAt',
    aliases: ['letzter kontakt', 'kontakt am', 'zuletzt kontaktiert'],
  },
  {
    field: 'followUpAt',
    aliases: ['wiedervorlage', 'nachfassen', 'follow up', 'erinnerung'],
  },
  { field: 'note', aliases: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'hinweis text'] },
] as const;

export type PartnerColumnAssignment = GenericColumnAssignment<PartnerImportField>;
export type PartnerColumnMapping = PartnerColumnAssignment[];

export function proposePartnerColumnMapping(
  headers: readonly string[],
): PartnerColumnMapping {
  return proposeMappingFor(headers, FIELD_MATCHERS);
}

export function findMissingPartnerFields(
  mapping: PartnerColumnMapping,
): PartnerImportField[] {
  return findMissingFields(mapping, REQUIRED_PARTNER_IMPORT_FIELDS);
}

export function applyPartnerMapping(
  mapping: PartnerColumnMapping,
  row: readonly string[],
): Partial<Record<PartnerImportField, string>> {
  return applyMappingFor(mapping, row);
}

export { toRawRecord };
