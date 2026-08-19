/**
 * Normalizer contract.
 *
 * A mapper turns one source's raw payload into a source-agnostic draft. The
 * draft is what the store persists; from here on no code knows which source a
 * record came from, other than through its provenance fields.
 */

import type { Logger } from '@/lib/logging';
import type {
  ProcedureType,
  ProcurementType,
  RequirementCategory,
  TenderStatus,
} from '@/types/tender';

export interface AuthorityDraft {
  externalId: string | null;
  name: string;
  authorityType: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  regionCode: string | null;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface LotDraft {
  lotNumber: string;
  title: string;
  description: string | null;
  estimatedValueNet: number | null;
  cpvCodes: string[];
}

export interface RequirementDraft {
  category: RequirementCategory;
  label: string;
  description: string | null;
  mandatory: boolean;
}

export interface DocumentDraft {
  title: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  sourceUrl: string | null;
}

/** Award data delivered alongside an already-decided tender. */
export interface AwardDraft {
  externalId: string | null;
  winnerName: string;
  winnerCity: string | null;
  awardValueNet: number | null;
  currency: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  awardDate: string | null;
  bidderCount: number | null;
  sourceUrl: string | null;
}

/** A fully normalised tender, ready to be written to the database. */
export interface TenderDraft {
  externalId: string;
  title: string;
  summary: string | null;
  description: string | null;
  referenceNumber: string | null;
  procurementType: ProcurementType;
  procedureType: ProcedureType | null;
  cpvCodes: string[];
  sectors: string[];
  nutsCodes: string[];
  countryCode: string | null;
  regionCode: string | null;
  city: string | null;
  postalCode: string | null;
  /** ISO-8601 timestamps, or null when the source omits the date. */
  publicationDate: string | null;
  submissionDeadline: string | null;
  questionDeadline: string | null;
  bindingPeriodEnd: string | null;
  /** ISO-8601 dates (YYYY-MM-DD). */
  contractStart: string | null;
  contractEnd: string | null;
  durationMonths: number | null;
  estimatedValueNet: number | null;
  currency: string;
  status: TenderStatus;
  sourceUrl: string | null;
  originalLanguage: string;
  /** Source fields with no place in the unified model. */
  sourceExtras: Record<string, unknown>;
  authority: AuthorityDraft | null;
  lots: LotDraft[];
  requirements: RequirementDraft[];
  documents: DocumentDraft[];
  /** Present only once the source reports the contract as awarded. */
  award: AwardDraft | null;
}

export interface MapperContext {
  sourceKey: string;
  logger: Logger;
}

export interface TenderMapper {
  /** Must equal `sources.key`. */
  readonly sourceKey: string;
  /**
   * Bumped whenever the mapping logic changes. Recorded on every
   * normalization run so records can be reprocessed selectively.
   */
  readonly version: string;
  /**
   * Maps one raw payload. Throws when the payload cannot be interpreted —
   * the runner records the failure and continues with the next record.
   */
  map(payload: Record<string, unknown>, context: MapperContext): TenderDraft;
}
