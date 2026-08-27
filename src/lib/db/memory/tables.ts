/**
 * In-memory table definitions for local demo mode.
 *
 * Mirrors the Postgres schema closely enough that the two adapters behave
 * identically from the UI's point of view. Holds demo data only.
 */

import type {
  Award,
  ContractingAuthority,
  Tender,
  TenderDocument,
  TenderLot,
  TenderRequirement,
} from '@/types/tender';
import type {
  ConnectorRun,
  NormalizationRun,
  RawImport,
  Source,
} from '@/types/source';

export interface DuplicateCandidate {
  id: string;
  tenderId: string;
  duplicateOfId: string;
  similarityScore: number;
  detectionMethod: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

export interface MemoryTables {
  sources: Source[];
  connectorRuns: ConnectorRun[];
  rawImports: RawImport[];
  normalizationRuns: NormalizationRun[];
  authorities: ContractingAuthority[];
  tenders: Tender[];
  lots: TenderLot[];
  requirements: TenderRequirement[];
  documents: TenderDocument[];
  awards: Award[];
  duplicateCandidates: DuplicateCandidate[];
}

export function createEmptyTables(): MemoryTables {
  return {
    sources: [],
    connectorRuns: [],
    rawImports: [],
    normalizationRuns: [],
    authorities: [],
    tenders: [],
    lots: [],
    requirements: [],
    documents: [],
    awards: [],
    duplicateCandidates: [],
  };
}

/**
 * The demo source row.
 *
 * Matches supabase/migrations/0006_register_demo_source.sql, so demo mode and
 * a real database present the same source to the UI.
 */
export function createDemoSource(): Source {
  const now = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    key: 'demo',
    name: 'DEMO-Datenquelle',
    sourceType: 'manual',
    countryCode: 'DE',
    websiteUrl: null,
    description:
      'Synthetische Beispieldaten zur Entwicklung und Abnahme. Erzeugt ausschließlich Datensätze mit is_demo = true. Keine echten Ausschreibungen.',
    isActive: true,
    isDemo: true,
    pollIntervalSeconds: 86_400,
    config: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The TED / EU eForms source row.
 *
 * Matches supabase/migrations/0017_register_ted_eforms_source.sql. It is
 * seeded here too so the in-process store presents the same set of sources as
 * a real database — a connector that only exists with Supabase configured
 * would be invisible exactly where it is being developed.
 *
 * `isDemo` is false: everything this source produces is a real tender, and the
 * memory store enforces the same demo/live separation the database trigger
 * does.
 */
export function createTedEformsSource(): Source {
  const now = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000002',
    key: 'ted-eforms',
    name: 'TED / EU eForms',
    sourceType: 'api',
    countryCode: 'DE',
    websiteUrl: 'https://ted.europa.eu',
    description:
      'Tenders Electronic Daily — EU-weite Vergabebekanntmachungen oberhalb der Schwellenwerte im eForms-Format. Echte Live-Daten, gefiltert auf die Startbranchen und Deutschland als Erfüllungsort.',
    isActive: true,
    isDemo: false,
    pollIntervalSeconds: 3_600,
    config: {
      cpvCodes: [
        '797*',
        '75251110',
        '90910000',
        '90911*',
        '90919*',
        '98341*',
        '85311000',
      ],
      countries: ['DEU'],
      lookbackDays: 14,
      pageSize: 100,
      maxNoticesPerRun: 5_000,
    },
    createdAt: now,
    updatedAt: now,
  };
}
