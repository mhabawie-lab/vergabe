/**
 * PartnerStore backed by in-process tables.
 *
 * Used for local development and by the tests. Every method filters by
 * `organizationId` first — the same isolation Postgres enforces through RLS.
 * A read that forgot the filter would leak one organisation's partner list,
 * negotiated rates included, so the tests assert this explicitly.
 *
 * Volatile: contents are lost when the process ends. The UI says so wherever
 * partner data could be entered.
 */

import { randomUUID } from 'node:crypto';
import type { PaginatedResult } from '../ports';
import type { AuditEntry, AuditEntryInput } from '../reference-ports';
import type {
  CreatePartnerImportInput,
  CreatePartnerImportRowInput,
  CreatePartnerInput,
  ExpiringCredential,
  PartnerCompanyDetail,
  PartnerDuplicateCandidate,
  PartnerFacets,
  PartnerImportRun,
  PartnerMetrics,
  PartnerStore,
  SaveActivityInput,
  SaveAssignmentInput,
  SaveAvailabilityInput,
  SaveContactInput,
  SaveDocumentInput,
  SaveNeedInput,
  SaveQualificationInput,
  SaveRateInput,
  SaveRegionInput,
  SaveServiceInput,
  SaveSignalInput,
  UpdatePartnerInput,
} from '../partner-ports';
import { buildChainTree, validateChainLink } from '@/modules/partners/chain';
import {
  countsAsProof,
  daysUntil,
  qualificationAsCredential,
  summarizeCredentials,
} from '@/modules/partners/credentials';
import { countsAsCurrent, coversDate } from '@/modules/partners/availability';
import {
  rankCandidates,
  type MatchCandidate,
  type MatchResult,
} from '@/modules/partners/matching';
import { countsAsOpenDemand, isDemandSignal, isSignalExpired } from '@/modules/partners/signals';
import type { NeedQuery, PartnerQuery, SignalQuery } from '@/modules/partners/query';
import {
  looksLikeSameValue,
  normalizeCityName,
  normalizeForComparison,
} from '@/modules/references/normalize';
import type {
  AssignmentTreeNode,
  MatchStatus,
  PartnerActivity,
  PartnerAvailability,
  PartnerCompany,
  PartnerCompanyListItem,
  PartnerContact,
  PartnerDocument,
  PartnerQualification,
  PartnerRate,
  PartnerService,
  PartnerServiceRegion,
  PartnerSignal,
  PartnerSignalListItem,
  SubcontractorAssignment,
  SubcontractorMatch,
  SubcontractorMatchListItem,
  SubcontractorNeed,
  SubcontractorNeedListItem,
} from '@/types/partner';

export interface PartnerTables {
  companies: PartnerCompany[];
  contacts: PartnerContact[];
  services: PartnerService[];
  regions: PartnerServiceRegion[];
  availability: PartnerAvailability[];
  qualifications: PartnerQualification[];
  documents: PartnerDocument[];
  rates: PartnerRate[];
  activities: PartnerActivity[];
  signals: PartnerSignal[];
  needs: SubcontractorNeed[];
  matches: SubcontractorMatch[];
  assignments: SubcontractorAssignment[];
  imports: PartnerImportRun[];
  importRows: CreatePartnerImportRowInput[];
  /** Mirrors the audit_log table; metadata only, never partner data. */
  auditLog: AuditEntry[];
}

export function createEmptyPartnerTables(): PartnerTables {
  return {
    companies: [],
    contacts: [],
    services: [],
    regions: [],
    availability: [],
    qualifications: [],
    documents: [],
    rates: [],
    activities: [],
    signals: [],
    needs: [],
    matches: [],
    assignments: [],
    imports: [],
    importRows: [],
    auditLog: [],
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    total,
    page: currentPage,
    pageSize,
    pageCount,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class MemoryPartnerStore implements PartnerStore {
  constructor(private readonly tables: PartnerTables) {}

  // --- Internal helpers --------------------------------------------------

  private companiesOf(organizationId: string): PartnerCompany[] {
    return this.tables.companies.filter(
      (company) => company.organizationId === organizationId,
    );
  }

  private ownCompany(organizationId: string, id: string): PartnerCompany | undefined {
    return this.tables.companies.find(
      (company) => company.id === id && company.organizationId === organizationId,
    );
  }

  private servicesOf(companyId: string): PartnerService[] {
    return this.tables.services.filter(
      (service) => service.partnerCompanyId === companyId,
    );
  }

  private toListItem(company: PartnerCompany, now: Date): PartnerCompanyListItem {
    const services = this.servicesOf(company.id);
    const regions = this.tables.regions.filter(
      (region) => region.partnerCompanyId === company.id,
    );
    const availability = this.tables.availability.filter(
      (entry) => entry.partnerCompanyId === company.id,
    );
    const qualifications = this.tables.qualifications.filter(
      (entry) => entry.partnerCompanyId === company.id,
    );

    // Only availability that still counts as current contributes a figure.
    const staffFigures = availability
      .filter((entry) => countsAsCurrent(entry, now))
      .map((entry) => entry.availableStaff)
      .filter((value): value is number => value !== null);

    return {
      id: company.id,
      legalName: company.legalName,
      tradeName: company.tradeName,
      relationshipDirection: company.relationshipDirection,
      partnerLevel: company.partnerLevel,
      status: company.status,
      verificationStatus: company.verificationStatus,
      country: company.country,
      region: company.region,
      city: company.city,
      isPreferred: company.isPreferred,
      isBlocked: company.isBlocked,
      datacenterExperienceStatus: company.datacenterExperienceStatus,
      confirmedServices: [
        ...new Set(
          services
            .filter((service) => service.confirmation === 'confirmed')
            .map((service) => service.serviceCategory),
        ),
      ],
      declaredServices: [
        ...new Set(
          services
            .filter((service) => service.confirmation === 'self_declared')
            .map((service) => service.serviceCategory),
        ),
      ],
      regions: [
        ...new Set(
          regions.flatMap((region) =>
            region.nationwide
              ? ['bundesweit']
              : [region.city, region.region].filter(
                  (value): value is string => value !== null,
                ),
          ),
        ),
      ],
      availableStaff: staffFigures.length > 0 ? Math.max(...staffFigures) : null,
      credentialSummary: summarizeCredentials(
        qualifications.map(qualificationAsCredential),
        now,
      ),
      hasOpenDemandSignal: this.tables.signals.some(
        (signal) =>
          signal.partnerCompanyId === company.id && countsAsOpenDemand(signal, now),
      ),
      lastContactAt: company.lastContactAt,
      nextFollowUpAt: company.nextFollowUpAt,
    };
  }

  // --- Companies ---------------------------------------------------------

  async listCompanies(
    organizationId: string,
    query: PartnerQuery,
  ): Promise<PaginatedResult<PartnerCompanyListItem>> {
    const now = new Date();
    const companies = this.companiesOf(organizationId);

    const filtered = companies.filter((company) => {
      if (!query.includeArchived && company.archivedAt !== null) return false;
      if (query.blocked === true && !company.isBlocked) return false;
      if (query.blocked === false && company.isBlocked) return false;
      if (query.preferred === true && !company.isPreferred) return false;
      if (query.preferred === false && company.isPreferred) return false;

      if (query.q !== undefined) {
        // Same haystack and comparison form as `search_partner_companies`.
        const needle = normalizeForComparison(query.q);
        const haystack = normalizeForComparison(
          [
            company.legalName,
            company.tradeName ?? '',
            company.city ?? '',
            company.region ?? '',
            company.registryNumber ?? '',
            company.vatId ?? '',
          ].join(' '),
        );
        if (!haystack.includes(needle)) return false;
      }

      if (
        query.directions !== undefined &&
        query.directions.length > 0 &&
        !query.directions.includes(company.relationshipDirection)
      ) {
        return false;
      }

      if (
        query.statuses !== undefined &&
        query.statuses.length > 0 &&
        !query.statuses.includes(company.status)
      ) {
        return false;
      }

      if (
        query.verifications !== undefined &&
        query.verifications.length > 0 &&
        !query.verifications.includes(company.verificationStatus)
      ) {
        return false;
      }

      if (query.datacenter !== undefined &&
          company.datacenterExperienceStatus !== query.datacenter) {
        return false;
      }

      if (query.country !== undefined && company.country !== query.country) return false;

      if (query.services !== undefined && query.services.length > 0) {
        // Only confirmed services count — a self-declared one is not evidence.
        const confirmed = this.servicesOf(company.id).filter(
          (service) => service.confirmation === 'confirmed',
        );
        if (!confirmed.some((service) => query.services?.includes(service.serviceCategory))) {
          return false;
        }
      }

      const regions = this.tables.regions.filter(
        (region) => region.partnerCompanyId === company.id,
      );

      if (query.region !== undefined) {
        const matches =
          company.region === query.region ||
          regions.some(
            (region) => region.nationwide || region.region === query.region,
          );
        if (!matches) return false;
      }

      if (query.city !== undefined) {
        const needle = normalizeCityName(query.city);
        const matches =
          (company.city !== null && normalizeCityName(company.city).includes(needle)) ||
          regions.some(
            (region) =>
              region.nationwide ||
              (region.city !== null && normalizeCityName(region.city).includes(needle)),
          );
        if (!matches) return false;
      }

      if (query.minRadiusKm !== undefined) {
        const matches = regions.some(
          (region) =>
            region.nationwide || (region.radiusKm ?? 0) >= (query.minRadiusKm ?? 0),
        );
        if (!matches) return false;
      }

      const availability = this.tables.availability.filter(
        (entry) => entry.partnerCompanyId === company.id,
      );

      if (query.availableOn !== undefined) {
        const day = query.availableOn;
        const matches = availability.some(
          (entry) =>
            (entry.status === 'available' || entry.status === 'partially_available') &&
            coversDate(entry, day),
        );
        if (!matches) return false;
      }

      if (query.minAvailableStaff !== undefined) {
        const minimum = query.minAvailableStaff;
        const matches =
          availability.some((entry) => (entry.availableStaff ?? 0) >= minimum) ||
          this.servicesOf(company.id).some(
            (service) =>
              service.confirmation === 'confirmed' &&
              (service.availableStaff ?? 0) >= minimum,
          );
        if (!matches) return false;
      }

      if (query.credentialState !== undefined) {
        const qualifications = this.tables.qualifications.filter(
          (entry) => entry.partnerCompanyId === company.id,
        );
        const matches = qualifications.some((qualification) => {
          const remaining =
            qualification.validUntil === null
              ? null
              : daysUntil(qualification.validUntil, now);
          switch (query.credentialState) {
            case 'valid':
              return (
                qualification.reviewStatus === 'accepted' &&
                remaining !== null &&
                remaining > 90
              );
            case 'expiring':
              return remaining !== null && remaining >= 0 && remaining <= 90;
            case 'expired':
              return remaining !== null && remaining < 0;
            case 'pending':
              return qualification.reviewStatus === 'pending';
            default:
              return false;
          }
        });

        if (query.credentialState === 'missing') {
          if (qualifications.some((entry) => entry.reviewStatus === 'accepted')) {
            return false;
          }
        } else if (!matches) {
          return false;
        }
      }

      if (query.demand !== undefined) {
        const hasDemand = this.tables.signals.some(
          (signal) =>
            signal.partnerCompanyId === company.id && countsAsOpenDemand(signal, now),
        );
        if (hasDemand !== query.demand) return false;
      }

      if (query.lastContactBefore !== undefined) {
        if (
          company.lastContactAt !== null &&
          company.lastContactAt.slice(0, 10) > query.lastContactBefore
        ) {
          return false;
        }
      }

      if (query.followUpBefore !== undefined) {
        if (
          company.nextFollowUpAt === null ||
          company.nextFollowUpAt.slice(0, 10) > query.followUpBefore
        ) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const primary = ((): number => {
        switch (query.sort) {
          case 'status':
            return a.status.localeCompare(b.status);
          case 'last_contact':
            return (a.lastContactAt ?? '').localeCompare(b.lastContactAt ?? '');
          case 'follow_up':
            return (a.nextFollowUpAt ?? '').localeCompare(b.nextFollowUpAt ?? '');
          case 'created_at':
            return a.createdAt.localeCompare(b.createdAt);
          case 'legal_name':
          default:
            return a.legalName.localeCompare(b.legalName, 'de');
        }
      })();

      const directed = query.direction === 'desc' ? -primary : primary;
      if (directed !== 0) return directed;
      // Deterministic tie-break, matching the SQL search.
      const byCreated = b.createdAt.localeCompare(a.createdAt);
      return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
    });

    const page = paginate(sorted, query.page, query.pageSize);
    return { ...page, items: page.items.map((company) => this.toListItem(company, now)) };
  }

  async findCompanyById(
    organizationId: string,
    id: string,
  ): Promise<PartnerCompanyDetail | null> {
    const company = this.ownCompany(organizationId, id);
    if (company === undefined) return null;

    const now = new Date();
    const qualifications = this.tables.qualifications.filter(
      (entry) => entry.partnerCompanyId === id,
    );

    return {
      company,
      contacts: this.tables.contacts.filter((entry) => entry.partnerCompanyId === id),
      services: this.servicesOf(id),
      regions: this.tables.regions.filter((entry) => entry.partnerCompanyId === id),
      availability: this.tables.availability.filter(
        (entry) => entry.partnerCompanyId === id,
      ),
      qualifications,
      documents: this.tables.documents.filter((entry) => entry.partnerCompanyId === id),
      activities: [...this.tables.activities]
        .filter((entry) => entry.partnerCompanyId === id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      signals: this.tables.signals.filter((entry) => entry.partnerCompanyId === id),
      assignments: this.tables.assignments.filter(
        (entry) => entry.partnerCompanyId === id,
      ),
      credentialSummary: summarizeCredentials(
        qualifications.map(qualificationAsCredential),
        now,
      ),
      duplicateCandidates: this.companiesOf(organizationId)
        .filter(
          (other) =>
            other.id !== id &&
            looksLikeSameValue(other.normalizedName, company.normalizedName),
        )
        .map((other) => ({ id: other.id, legalName: other.legalName })),
    };
  }

  async findCompanyRecord(
    organizationId: string,
    id: string,
  ): Promise<PartnerCompany | null> {
    return this.ownCompany(organizationId, id) ?? null;
  }

  async listDuplicateCandidates(
    organizationId: string,
  ): Promise<PartnerDuplicateCandidate[]> {
    return this.companiesOf(organizationId).map((company) => ({
      id: company.id,
      legalName: company.legalName,
      normalizedName: company.normalizedName,
      country: company.country,
      registryNumber: company.registryNumber,
      vatId: company.vatId,
      website: company.website,
      email: company.email,
      phone: company.phone,
      city: company.city,
      address: company.address,
    }));
  }

  async createCompany(input: CreatePartnerInput): Promise<PartnerCompany> {
    const clash = this.tables.companies.find(
      (company) =>
        company.organizationId === input.organizationId &&
        company.normalizedName === input.normalizedName,
    );
    if (clash !== undefined) {
      // Mirrors the unique constraint in the database.
      throw new Error(`Ein Partner mit dem Namen „${input.legalName}" existiert bereits.`);
    }

    const now = new Date().toISOString();
    const company: PartnerCompany = {
      id: randomUUID(),
      organizationId: input.organizationId,
      legalName: input.legalName,
      normalizedName: input.normalizedName,
      tradeName: input.tradeName,
      relationshipDirection: input.relationshipDirection,
      partnerLevel: input.partnerLevel,
      status: input.status,
      verificationStatus: input.verificationStatus,
      country: input.country,
      region: input.region,
      city: input.city,
      postalCode: input.postalCode,
      address: input.address,
      website: input.website,
      email: input.email,
      phone: input.phone,
      registryName: input.registryName,
      registryNumber: input.registryNumber,
      vatId: input.vatId,
      lei: input.lei,
      staffModel: input.staffModel,
      furtherSubcontractingStatus: input.furtherSubcontractingStatus,
      datacenterExperienceStatus: input.datacenterExperienceStatus,
      isPreferred: input.isPreferred,
      isBlocked: input.isBlocked,
      blockedReason: input.blockedReason,
      internalRating: input.internalRating,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      firstObservedAt: now,
      lastVerifiedAt: null,
      lastContactAt: input.lastContactAt,
      nextFollowUpAt: input.nextFollowUpAt,
      internalNotes: input.internalNotes,
      linkedBusinessClientId: input.linkedBusinessClientId,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    this.tables.companies.push(company);
    return company;
  }

  async updateCompany(
    organizationId: string,
    id: string,
    patch: UpdatePartnerInput,
  ): Promise<PartnerCompany | null> {
    const company = this.ownCompany(organizationId, id);
    if (company === undefined) return null;

    Object.assign(company, patch);
    if (patch.status === 'archived' && company.archivedAt === null) {
      company.archivedAt = new Date().toISOString();
    }
    if (patch.status !== undefined && patch.status !== 'archived') {
      company.archivedAt = null;
    }
    company.updatedAt = new Date().toISOString();
    return company;
  }

  // --- Sub-records -------------------------------------------------------

  async saveContact(input: SaveContactInput): Promise<PartnerContact | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.contacts.find(
            (entry) => entry.id === input.id && entry.organizationId === input.organizationId,
          );

    if (existing !== undefined) {
      Object.assign(existing, {
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        businessEmail: input.businessEmail,
        businessPhone: input.businessPhone,
        preferredChannel: input.preferredChannel,
        sourceType: input.sourceType,
        internalNote: input.internalNote,
        isActive: input.isActive,
        updatedAt: now,
      });
      return existing;
    }

    const contact: PartnerContact = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      businessEmail: input.businessEmail,
      businessPhone: input.businessPhone,
      preferredChannel: input.preferredChannel,
      sourceType: input.sourceType,
      lastVerifiedAt: null,
      internalNote: input.internalNote,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.contacts.push(contact);
    return contact;
  }

  async saveService(input: SaveServiceInput): Promise<PartnerService | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing = this.tables.services.find(
      (service) =>
        service.partnerCompanyId === input.partnerCompanyId &&
        service.serviceCategory === input.serviceCategory,
    );

    if (existing !== undefined) {
      Object.assign(existing, {
        serviceLabel: input.serviceLabel,
        confirmation: input.confirmation,
        confirmationSource: input.confirmationSource,
        capacityNote: input.capacityNote,
        availableStaff: input.availableStaff,
        deliveryMode: input.deliveryMode,
        note: input.note,
        updatedAt: now,
      });
      return existing;
    }

    const service: PartnerService = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      serviceCategory: input.serviceCategory,
      serviceLabel: input.serviceLabel,
      confirmation: input.confirmation,
      confirmationSource: input.confirmationSource,
      capacityNote: input.capacityNote,
      availableStaff: input.availableStaff,
      deliveryMode: input.deliveryMode,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.services.push(service);
    return service;
  }

  async saveRegion(input: SaveRegionInput): Promise<PartnerServiceRegion | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.regions.find(
            (entry) => entry.id === input.id && entry.organizationId === input.organizationId,
          );

    if (existing !== undefined) {
      Object.assign(existing, { ...input, id: existing.id, updatedAt: now });
      return existing;
    }

    const region: PartnerServiceRegion = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      country: input.country,
      region: input.region,
      city: input.city,
      radiusKm: input.radiusKm,
      nationwide: input.nationwide,
      willingToTravel: input.willingToTravel,
      isConfirmed: input.isConfirmed,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.regions.push(region);
    return region;
  }

  async saveAvailability(
    input: SaveAvailabilityInput,
  ): Promise<PartnerAvailability | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.availability.find(
            (entry) => entry.id === input.id && entry.organizationId === input.organizationId,
          );

    const confirmedAt = input.confirmNow ? now : (existing?.lastConfirmedAt ?? null);

    if (existing !== undefined) {
      Object.assign(existing, {
        serviceCategory: input.serviceCategory,
        availableFrom: input.availableFrom,
        availableUntil: input.availableUntil,
        status: input.status,
        availableStaff: input.availableStaff,
        shiftModel: input.shiftModel,
        nightShift: input.nightShift,
        weekend: input.weekend,
        aroundTheClock: input.aroundTheClock,
        shortNotice: input.shortNotice,
        note: input.note,
        lastConfirmedAt: confirmedAt,
        updatedAt: now,
      });
      return existing;
    }

    const availability: PartnerAvailability = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      serviceCategory: input.serviceCategory,
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
      status: input.status,
      availableStaff: input.availableStaff,
      shiftModel: input.shiftModel,
      nightShift: input.nightShift,
      weekend: input.weekend,
      aroundTheClock: input.aroundTheClock,
      shortNotice: input.shortNotice,
      note: input.note,
      lastConfirmedAt: confirmedAt,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.availability.push(availability);
    return availability;
  }

  async saveQualification(
    input: SaveQualificationInput,
  ): Promise<PartnerQualification | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.qualifications.find(
            (entry) => entry.id === input.id && entry.organizationId === input.organizationId,
          );

    const reviewedAt =
      input.reviewStatus === 'pending' ? null : (existing?.reviewedAt ?? now);

    if (existing !== undefined) {
      Object.assign(existing, {
        credentialType: input.credentialType,
        title: input.title,
        issuer: input.issuer,
        documentNumber: input.documentNumber,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        reviewStatus: input.reviewStatus,
        reviewedBy: input.reviewStatus === 'pending' ? null : input.reviewedBy,
        reviewedAt,
        note: input.note,
        updatedAt: now,
      });
      return existing;
    }

    const qualification: PartnerQualification = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      credentialType: input.credentialType,
      title: input.title,
      issuer: input.issuer,
      documentNumber: input.documentNumber,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      reviewStatus: input.reviewStatus,
      reviewedBy: input.reviewStatus === 'pending' ? null : input.reviewedBy,
      reviewedAt,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.qualifications.push(qualification);
    return qualification;
  }

  // --- Documents ---------------------------------------------------------

  async saveDocument(input: SaveDocumentInput): Promise<PartnerDocument | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const document: PartnerDocument = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      partnerQualificationId: input.partnerQualificationId,
      credentialType: input.credentialType,
      storagePath: input.storagePath,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      checksum: input.checksum,
      confidentiality: input.confidentiality,
      // No scanner is wired up. Saying anything else would be a lie the user
      // might act on.
      scanStatus: 'not_scanned',
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      reviewStatus: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      note: input.note,
      uploadedBy: input.uploadedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.documents.push(document);
    return document;
  }

  async listDocuments(
    organizationId: string,
    partnerCompanyId: string,
  ): Promise<PartnerDocument[]> {
    return this.tables.documents.filter(
      (document) =>
        document.organizationId === organizationId &&
        document.partnerCompanyId === partnerCompanyId,
    );
  }

  async findDocument(
    organizationId: string,
    id: string,
  ): Promise<PartnerDocument | null> {
    return (
      this.tables.documents.find(
        (document) => document.id === id && document.organizationId === organizationId,
      ) ?? null
    );
  }

  async reviewDocument(
    organizationId: string,
    id: string,
    review: {
      reviewStatus: PartnerDocument['reviewStatus'];
      reviewedBy: string | null;
      note: string | null;
    },
  ): Promise<PartnerDocument | null> {
    const document = this.tables.documents.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (document === undefined) return null;

    document.reviewStatus = review.reviewStatus;
    document.reviewedBy = review.reviewedBy;
    document.reviewedAt = new Date().toISOString();
    if (review.note !== null) document.note = review.note;
    document.updatedAt = new Date().toISOString();
    return document;
  }

  // --- Rates -------------------------------------------------------------

  async listRates(
    organizationId: string,
    partnerCompanyId: string,
  ): Promise<PartnerRate[]> {
    return this.tables.rates.filter(
      (rate) =>
        rate.organizationId === organizationId &&
        rate.partnerCompanyId === partnerCompanyId,
    );
  }

  async saveRate(input: SaveRateInput): Promise<PartnerRate | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.rates.find(
            (entry) => entry.id === input.id && entry.organizationId === input.organizationId,
          );

    if (existing !== undefined) {
      Object.assign(existing, { ...input, id: existing.id, updatedAt: now });
      return existing;
    }

    const rate: PartnerRate = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      serviceCategory: input.serviceCategory,
      region: input.region,
      rateModel: input.rateModel,
      unit: input.unit,
      netAmount: input.netAmount,
      currency: input.currency,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      surcharges: input.surcharges,
      negotiationStatus: input.negotiationStatus,
      internalNote: input.internalNote,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.rates.push(rate);
    return rate;
  }

  // --- Activities --------------------------------------------------------

  async saveActivity(input: SaveActivityInput): Promise<PartnerActivity | null> {
    const company = this.ownCompany(input.organizationId, input.partnerCompanyId);
    if (company === undefined) return null;

    const now = new Date().toISOString();
    const activity: PartnerActivity = {
      id: randomUUID(),
      partnerCompanyId: input.partnerCompanyId,
      organizationId: input.organizationId,
      partnerContactId: input.partnerContactId,
      activityType: input.activityType,
      occurredAt: input.occurredAt,
      summary: input.summary,
      outcome: input.outcome,
      nextAction: input.nextAction,
      followUpAt: input.followUpAt,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.activities.push(activity);

    // Keep the company's own follow-up fields in step, so the list view does
    // not need to join the activity table.
    company.lastContactAt = input.occurredAt;
    if (input.followUpAt !== null) company.nextFollowUpAt = input.followUpAt;
    company.updatedAt = now;

    return activity;
  }

  async listActivities(
    organizationId: string,
    options: { partnerCompanyId?: string; limit: number },
  ): Promise<Array<PartnerActivity & { companyName: string }>> {
    const names = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company.legalName]),
    );

    return this.tables.activities
      .filter(
        (activity) =>
          activity.organizationId === organizationId &&
          (options.partnerCompanyId === undefined ||
            activity.partnerCompanyId === options.partnerCompanyId),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, options.limit)
      .map((activity) => ({
        ...activity,
        companyName: names.get(activity.partnerCompanyId) ?? '—',
      }));
  }

  async listDueFollowUps(
    organizationId: string,
    until: string,
  ): Promise<Array<PartnerActivity & { companyName: string }>> {
    const names = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company.legalName]),
    );

    return this.tables.activities
      .filter(
        (activity) =>
          activity.organizationId === organizationId &&
          activity.followUpAt !== null &&
          activity.followUpAt.slice(0, 10) <= until,
      )
      .sort((a, b) => (a.followUpAt ?? '').localeCompare(b.followUpAt ?? ''))
      .map((activity) => ({
        ...activity,
        companyName: names.get(activity.partnerCompanyId) ?? '—',
      }));
  }

  // --- Signals -----------------------------------------------------------

  async listSignals(
    organizationId: string,
    query: SignalQuery,
  ): Promise<PaginatedResult<PartnerSignalListItem>> {
    const now = new Date();
    const names = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company.legalName]),
    );

    const filtered = this.tables.signals
      .filter((signal) => signal.organizationId === organizationId)
      .filter((signal) => {
        if (query.demandOnly === true && !isDemandSignal(signal.signalType)) return false;
        if (query.includeExpired !== true && isSignalExpired(signal, now)) return false;
        if (
          query.types !== undefined &&
          query.types.length > 0 &&
          !query.types.includes(signal.signalType)
        ) {
          return false;
        }
        if (
          query.statuses !== undefined &&
          query.statuses.length > 0 &&
          !query.statuses.includes(signal.status)
        ) {
          return false;
        }
        if (query.services !== undefined && query.services.length > 0) {
          if (
            signal.serviceCategory === null ||
            !query.services.includes(signal.serviceCategory)
          ) {
            return false;
          }
        }
        if (query.q !== undefined) {
          const needle = normalizeForComparison(query.q);
          const haystack = normalizeForComparison(
            [
              signal.companyNameRaw ?? '',
              names.get(signal.partnerCompanyId ?? '') ?? '',
              signal.projectName ?? '',
              signal.description ?? '',
              signal.city ?? '',
            ].join(' '),
          );
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

    const page = paginate(filtered, query.page, query.pageSize);
    return {
      ...page,
      items: page.items.map((signal) => ({
        ...signal,
        companyName:
          signal.partnerCompanyId === null
            ? signal.companyNameRaw
            : (names.get(signal.partnerCompanyId) ?? signal.companyNameRaw),
        assignedToName: null,
      })),
    };
  }

  async findSignalById(
    organizationId: string,
    id: string,
  ): Promise<PartnerSignal | null> {
    return (
      this.tables.signals.find(
        (signal) => signal.id === id && signal.organizationId === organizationId,
      ) ?? null
    );
  }

  async saveSignal(input: SaveSignalInput): Promise<PartnerSignal | null> {
    if (
      input.partnerCompanyId !== null &&
      this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.signals.find(
            (signal) => signal.id === input.id && signal.organizationId === input.organizationId,
          );

    if (input.id !== undefined && existing === undefined) return null;

    if (existing !== undefined) {
      Object.assign(existing, { ...input, id: existing.id, updatedAt: now });
      return existing;
    }

    const signal: PartnerSignal = {
      id: randomUUID(),
      organizationId: input.organizationId,
      partnerCompanyId: input.partnerCompanyId,
      companyNameRaw: input.companyNameRaw,
      signalType: input.signalType,
      serviceCategory: input.serviceCategory,
      projectName: input.projectName,
      country: input.country,
      region: input.region,
      city: input.city,
      description: input.description,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      observedAt: input.observedAt,
      validUntil: input.validUntil,
      confidence: input.confidence,
      status: input.status,
      assignedTo: input.assignedTo,
      nextAction: input.nextAction,
      followUpAt: input.followUpAt,
      internalNote: input.internalNote,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.signals.push(signal);
    return signal;
  }

  // --- Needs and matches -------------------------------------------------

  async listNeeds(
    organizationId: string,
    query: NeedQuery,
  ): Promise<PaginatedResult<SubcontractorNeedListItem>> {
    const filtered = this.tables.needs
      .filter((need) => need.organizationId === organizationId)
      .filter((need) => {
        if (
          query.statuses !== undefined &&
          query.statuses.length > 0 &&
          !query.statuses.includes(need.status)
        ) {
          return false;
        }
        if (
          query.services !== undefined &&
          query.services.length > 0 &&
          !query.services.includes(need.serviceCategory)
        ) {
          return false;
        }
        if (query.q !== undefined) {
          const needle = normalizeForComparison(query.q);
          const haystack = normalizeForComparison(
            [need.title, need.city ?? '', need.region ?? '', need.projectType ?? ''].join(' '),
          );
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const page = paginate(filtered, query.page, query.pageSize);
    return {
      ...page,
      items: page.items.map((need) => {
        const matches = this.tables.matches.filter((match) => match.needId === need.id);
        return {
          ...need,
          matchCount: matches.length,
          shortlistedCount: matches.filter((match) => match.status === 'shortlisted').length,
        };
      }),
    };
  }

  async findNeedById(
    organizationId: string,
    id: string,
  ): Promise<SubcontractorNeed | null> {
    return (
      this.tables.needs.find(
        (need) => need.id === id && need.organizationId === organizationId,
      ) ?? null
    );
  }

  async saveNeed(input: SaveNeedInput): Promise<SubcontractorNeed | null> {
    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : this.tables.needs.find(
            (need) => need.id === input.id && need.organizationId === input.organizationId,
          );

    if (input.id !== undefined && existing === undefined) return null;

    if (existing !== undefined) {
      Object.assign(existing, { ...input, id: existing.id, updatedAt: now });
      return existing;
    }

    const need: SubcontractorNeed = {
      id: randomUUID(),
      organizationId: input.organizationId,
      title: input.title,
      referenceProjectId: input.referenceProjectId,
      tenderId: input.tenderId,
      projectType: input.projectType,
      serviceCategory: input.serviceCategory,
      country: input.country,
      region: input.region,
      city: input.city,
      siteAddress: input.siteAddress,
      radiusKm: input.radiusKm,
      startDate: input.startDate,
      endDate: input.endDate,
      requiredStaff: input.requiredStaff,
      shiftModel: input.shiftModel,
      aroundTheClock: input.aroundTheClock,
      nightWork: input.nightWork,
      weekendWork: input.weekendWork,
      requiredQualifications: input.requiredQualifications,
      requiredCredentials: input.requiredCredentials,
      furtherSubcontractingAllowed: input.furtherSubcontractingAllowed,
      targetBudget: input.targetBudget,
      currency: input.currency,
      confidentiality: input.confidentiality,
      status: input.status,
      internalNote: input.internalNote,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.needs.push(need);
    return need;
  }

  async recomputeMatches(
    organizationId: string,
    needId: string,
  ): Promise<MatchResult[] | null> {
    const need = await this.findNeedById(organizationId, needId);
    if (need === null) return null;

    const candidates: MatchCandidate[] = this.companiesOf(organizationId).map(
      (company) => ({
        company,
        services: this.servicesOf(company.id),
        regions: this.tables.regions.filter(
          (region) => region.partnerCompanyId === company.id,
        ),
        availability: this.tables.availability.filter(
          (entry) => entry.partnerCompanyId === company.id,
        ),
        qualifications: this.tables.qualifications.filter(
          (entry) => entry.partnerCompanyId === company.id,
        ),
      }),
    );

    const results = rankCandidates(candidates, need);
    const now = new Date().toISOString();

    for (const result of results) {
      const existing = this.tables.matches.find(
        (match) =>
          match.needId === needId && match.partnerCompanyId === result.partnerCompanyId,
      );

      const componentOf = (key: string): number =>
        result.components.find((entry) => entry.key === key)?.points ?? 0;

      const payload = {
        totalScore: result.totalScore,
        scoreVersion: result.scoreVersion,
        serviceScore: componentOf('service'),
        regionScore: componentOf('region'),
        availabilityScore: componentOf('availability'),
        capacityScore: componentOf('capacity'),
        credentialScore: componentOf('credentials'),
        datacenterScore: componentOf('datacenter'),
        exclusionReason: result.exclusionReason,
        missingInformation: result.missingInformation,
        reasoning: result.components,
        updatedAt: now,
      };

      if (existing !== undefined) {
        // A human decision on the match is kept: recomputing the score must
        // not silently un-shortlist somebody.
        Object.assign(existing, payload);
      } else {
        this.tables.matches.push({
          id: randomUUID(),
          organizationId,
          needId,
          partnerCompanyId: result.partnerCompanyId,
          status: 'proposed',
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          ...payload,
        });
      }
    }

    return results;
  }

  async listMatches(
    organizationId: string,
    needId: string,
  ): Promise<SubcontractorMatchListItem[]> {
    const companies = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company]),
    );

    return this.tables.matches
      .filter(
        (match) => match.organizationId === organizationId && match.needId === needId,
      )
      .map((match) => {
        const company = companies.get(match.partnerCompanyId);
        return {
          ...match,
          companyName: company?.legalName ?? '—',
          companyStatus: company?.status ?? 'prospect',
          companyIsBlocked: company?.isBlocked ?? false,
        };
      })
      .sort((a, b) => {
        if (a.exclusionReason !== null && b.exclusionReason === null) return 1;
        if (a.exclusionReason === null && b.exclusionReason !== null) return -1;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.partnerCompanyId.localeCompare(b.partnerCompanyId);
      });
  }

  async updateMatchStatus(
    organizationId: string,
    matchId: string,
    status: MatchStatus,
    reviewedBy: string | null,
  ): Promise<SubcontractorMatchListItem | null> {
    const match = this.tables.matches.find(
      (entry) => entry.id === matchId && entry.organizationId === organizationId,
    );
    if (match === undefined) return null;

    match.status = status;
    match.reviewedBy = reviewedBy;
    match.reviewedAt = new Date().toISOString();
    match.updatedAt = match.reviewedAt;

    const company = this.ownCompany(organizationId, match.partnerCompanyId);
    return {
      ...match,
      companyName: company?.legalName ?? '—',
      companyStatus: company?.status ?? 'prospect',
      companyIsBlocked: company?.isBlocked ?? false,
    };
  }

  // --- Assignments -------------------------------------------------------

  async listAssignments(
    organizationId: string,
    options: { partnerCompanyId?: string; referenceProjectId?: string },
  ): Promise<AssignmentTreeNode[]> {
    const companies = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company]),
    );

    const scoped = this.tables.assignments.filter(
      (assignment) =>
        assignment.organizationId === organizationId &&
        (options.referenceProjectId === undefined ||
          assignment.referenceProjectId === options.referenceProjectId),
    );

    // When one company is asked for, the whole chain it belongs to is still
    // returned: a subcontractor without its parent is not a chain.
    const relevant =
      options.partnerCompanyId === undefined
        ? scoped
        : (() => {
            const wanted = new Set<string>();
            const byId = new Map(scoped.map((entry) => [entry.id, entry]));
            for (const entry of scoped) {
              if (entry.partnerCompanyId !== options.partnerCompanyId) continue;
              let cursor: SubcontractorAssignment | undefined = entry;
              let hops = 0;
              while (cursor !== undefined && hops <= 8) {
                wanted.add(cursor.id);
                cursor =
                  cursor.parentAssignmentId === null
                    ? undefined
                    : byId.get(cursor.parentAssignmentId);
                hops += 1;
              }
            }
            return scoped.filter((entry) => wanted.has(entry.id));
          })();

    return buildChainTree(
      relevant.map((assignment) => ({
        assignment,
        companyName: companies.get(assignment.partnerCompanyId)?.legalName ?? '—',
        // A blocked partner stays visible in a chain it is part of: removing
        // it would rewrite the record of who was on site.
        companyIsBlocked: companies.get(assignment.partnerCompanyId)?.isBlocked ?? false,
      })),
    );
  }

  async findAssignmentById(
    organizationId: string,
    id: string,
  ): Promise<SubcontractorAssignment | null> {
    return (
      this.tables.assignments.find(
        (assignment) =>
          assignment.id === id && assignment.organizationId === organizationId,
      ) ?? null
    );
  }

  async saveAssignment(
    input: SaveAssignmentInput,
  ): Promise<SubcontractorAssignment | null> {
    if (this.ownCompany(input.organizationId, input.partnerCompanyId) === undefined) {
      return null;
    }

    const existingList = this.tables.assignments.filter(
      (assignment) => assignment.organizationId === input.organizationId,
    );

    // Throws ChainRuleError on a cycle or an over-deep chain; the route turns
    // that into a validation error.
    const { chainLevel } = validateChainLink({
      assignmentId: input.id ?? null,
      parentAssignmentId: input.parentAssignmentId,
      existing: existingList,
    });

    const now = new Date().toISOString();
    const existing =
      input.id === undefined
        ? undefined
        : existingList.find((assignment) => assignment.id === input.id);

    if (input.id !== undefined && existing === undefined) return null;

    if (existing !== undefined) {
      Object.assign(existing, { ...input, id: existing.id, chainLevel, updatedAt: now });
      return existing;
    }

    const assignment: SubcontractorAssignment = {
      id: randomUUID(),
      organizationId: input.organizationId,
      partnerCompanyId: input.partnerCompanyId,
      referenceProjectId: input.referenceProjectId,
      needId: input.needId,
      role: input.role,
      parentAssignmentId: input.parentAssignmentId,
      chainLevel,
      contractPartnerCompanyId: input.contractPartnerCompanyId,
      scope: input.scope,
      staffCount: input.staffCount,
      startDate: input.startDate,
      endDate: input.endDate,
      furtherSubcontractingAllowed: input.furtherSubcontractingAllowed,
      status: input.status,
      internalRating: input.internalRating,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.tables.assignments.push(assignment);
    return assignment;
  }

  // --- Credentials -------------------------------------------------------

  async listExpiringCredentials(
    organizationId: string,
    withinDays: number,
  ): Promise<ExpiringCredential[]> {
    const now = new Date();
    const names = new Map(
      this.companiesOf(organizationId).map((company) => [company.id, company.legalName]),
    );

    return this.tables.qualifications
      .filter((qualification) => qualification.organizationId === organizationId)
      .filter((qualification) => {
        if (qualification.validUntil === null) return false;
        const remaining = daysUntil(qualification.validUntil, now);
        return remaining <= withinDays;
      })
      .sort((a, b) => (a.validUntil ?? '').localeCompare(b.validUntil ?? ''))
      .map((qualification) => ({
        partnerCompanyId: qualification.partnerCompanyId,
        companyName: names.get(qualification.partnerCompanyId) ?? '—',
        qualification,
      }));
  }

  // --- Import ------------------------------------------------------------

  async createImport(input: CreatePartnerImportInput): Promise<PartnerImportRun> {
    const now = new Date().toISOString();
    const run: PartnerImportRun = {
      id: randomUUID(),
      organizationId: input.organizationId,
      fileName: input.fileName,
      fileType: input.fileType,
      status: input.status,
      totalRows: input.totalRows,
      validRows: input.validRows,
      warningRows: input.warningRows,
      errorRows: input.errorRows,
      importedRows: input.importedRows,
      createdBy: input.createdBy,
      createdAt: now,
      completedAt: input.status === 'dry_run' ? null : now,
    };
    this.tables.imports.push(run);
    return run;
  }

  async addImportRows(rows: readonly CreatePartnerImportRowInput[]): Promise<void> {
    this.tables.importRows.push(...rows);
  }

  async listImports(
    organizationId: string,
    limit: number,
  ): Promise<PartnerImportRun[]> {
    return this.tables.imports
      .filter((run) => run.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // --- Audit -------------------------------------------------------------

  async recordAuditEntry(input: AuditEntryInput): Promise<void> {
    this.tables.auditLog.push({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      userName: null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    });
  }

  async listAuditEntries(
    organizationId: string,
    resourceType: string,
    resourceIds: readonly string[],
    limit: number,
  ): Promise<AuditEntry[]> {
    const wanted = new Set(resourceIds);
    return this.tables.auditLog
      .filter(
        (entry) =>
          entry.organizationId === organizationId &&
          entry.resourceType === resourceType &&
          entry.resourceId !== null &&
          wanted.has(entry.resourceId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // --- Aggregates --------------------------------------------------------

  async getMetrics(organizationId: string): Promise<PartnerMetrics> {
    const now = new Date();
    const day = today();
    const companies = this.companiesOf(organizationId).filter(
      (company) => company.archivedAt === null,
    );

    const availableNow = companies.filter((company) =>
      this.tables.availability.some(
        (entry) =>
          entry.partnerCompanyId === company.id &&
          countsAsCurrent(entry, now) &&
          (entry.status === 'available' || entry.status === 'partially_available') &&
          coversDate(entry, day),
      ),
    ).length;

    const expiringCredentials = this.tables.qualifications.filter((qualification) => {
      if (qualification.organizationId !== organizationId) return false;
      if (qualification.validUntil === null) return false;
      return daysUntil(qualification.validUntil, now) <= 90;
    }).length;

    return {
      qualifiedPartners: companies.filter(
        (company) =>
          !company.isBlocked &&
          (company.status === 'qualified' || company.status === 'preferred'),
      ).length,
      availableNow,
      companiesSeekingSubcontractors: companies.filter((company) =>
        this.tables.signals.some(
          (signal) =>
            signal.partnerCompanyId === company.id && countsAsOpenDemand(signal, now),
        ),
      ).length,
      dueFollowUps: this.tables.activities.filter(
        (activity) =>
          activity.organizationId === organizationId &&
          activity.followUpAt !== null &&
          activity.followUpAt.slice(0, 10) <= day,
      ).length,
      expiringCredentials,
      openNeeds: this.tables.needs.filter(
        (need) =>
          need.organizationId === organizationId &&
          (need.status === 'active' || need.status === 'in_review'),
      ).length,
    };
  }

  async listFacets(organizationId: string): Promise<PartnerFacets> {
    const companies = this.companiesOf(organizationId);
    const regions = this.tables.regions.filter(
      (region) => region.organizationId === organizationId,
    );

    const collect = (values: Array<string | null>): string[] =>
      [...new Set(values.filter((value): value is string => value !== null))].sort(
        (a, b) => a.localeCompare(b, 'de'),
      );

    return {
      countries: collect(companies.map((company) => company.country)),
      regions: collect([
        ...companies.map((company) => company.region),
        ...regions.map((region) => region.region),
      ]),
      cities: collect([
        ...companies.map((company) => company.city),
        ...regions.map((region) => region.city),
      ]),
    };
  }
}

/** Re-exported so tests can assert on evidence rules without a second import. */
export { countsAsProof };
