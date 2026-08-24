/**
 * ReferenceStore backed by in-process tables.
 *
 * Used for local development and by the tests. Every method filters by
 * `organizationId` first — the same isolation Postgres enforces through RLS.
 * A read that forgot the filter would leak one customer's data to another
 * tenant, so the tests assert this explicitly.
 *
 * Volatile: contents are lost when the process ends. Real customer data must
 * therefore never be imported here without the UI saying so.
 */

import { randomUUID } from 'node:crypto';
import type { PaginatedResult } from '../ports';
import type {
  AuditEntry,
  AuditEntryInput,
  ClientDetail,
  CreateClientInput,
  CreateImportInput,
  CreateImportRowInput,
  CreateProjectInput,
  ReferenceFacets,
  ReferenceMetrics,
  ReferenceStore,
  ServiceDecisionInput,
  ServiceDecisionResult,
} from '../reference-ports';
import {
  applyConfirmationAction,
  countsAsEvidence,
} from '@/modules/references/confirmation';
import type { DuplicateCandidateSource } from '@/modules/references/dedupe';
import {
  looksLikeSameValue,
  normalizeCityName,
  normalizeClientName,
  normalizeForComparison,
} from '@/modules/references/normalize';
import type { ClientQuery, ReferenceQuery } from '@/modules/references/query';
import type {
  BusinessClient,
  BusinessClientListItem,
  ReferenceImport,
  ReferenceImportRow,
  ReferenceProject,
  ReferenceProjectListItem,
  ReferenceProjectService,
  ReferenceServiceCategory,
} from '@/types/reference';

export interface ReferenceTables {
  clients: BusinessClient[];
  projects: ReferenceProject[];
  services: ReferenceProjectService[];
  imports: ReferenceImport[];
  importRows: ReferenceImportRow[];
  /** Mirrors the audit_log table; metadata only, never customer data. */
  auditLog: AuditEntry[];
}

export function createEmptyReferenceTables(): ReferenceTables {
  return {
    clients: [],
    projects: [],
    services: [],
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

function compareNullableString(
  a: string | null,
  b: string | null,
  direction: 'asc' | 'desc',
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a.localeCompare(b, 'de') : b.localeCompare(a, 'de');
}

export class MemoryReferenceStore implements ReferenceStore {
  constructor(private readonly tables: ReferenceTables) {}

  // --- Internal helpers --------------------------------------------------

  private projectsOf(organizationId: string): ReferenceProject[] {
    return this.tables.projects.filter(
      (project) => project.organizationId === organizationId,
    );
  }

  private servicesOf(projectId: string): ReferenceProjectService[] {
    return this.tables.services.filter(
      (service) => service.referenceProjectId === projectId,
    );
  }

  private toListItem(project: ReferenceProject): ReferenceProjectListItem {
    const services = this.servicesOf(project.id);
    const client = this.tables.clients.find(
      (entry) => entry.id === project.businessClientId,
    );

    return {
      id: project.id,
      externalObjectNumber: project.externalObjectNumber,
      projectName: project.projectName,
      businessClientId: project.businessClientId,
      businessClientName: client?.name ?? null,
      objectType: project.objectType,
      country: project.country,
      region: project.region,
      city: project.city,
      startDate: project.startDate,
      endDate: project.endDate,
      projectStatus: project.projectStatus,
      invoiceStatus: project.invoiceStatus,
      shiftSummaryRaw: project.shiftSummaryRaw,
      serviceCategories: services.map((service) => service.serviceCategory),
      hasUnconfirmedServices: services.some(
        (service) => service.confirmationStatus === 'proposed',
      ),
      hasOnlyProposals:
        services.length > 0 &&
        !services.some((service) => countsAsEvidence(service.confirmationStatus)),
      confirmedServiceCategories: [
        ...new Set(
          services
            .filter((service) => countsAsEvidence(service.confirmationStatus))
            .map((service) => service.serviceCategory),
        ),
      ],
      openProposals: services
        .filter((service) => service.confirmationStatus === 'proposed')
        .map((service) => ({
          serviceId: service.id,
          serviceCategory: service.serviceCategory,
        })),
      confidentialityLevel: project.confidentialityLevel,
    };
  }

  // --- Clients -----------------------------------------------------------

  async listClients(
    organizationId: string,
    query: ClientQuery,
  ): Promise<PaginatedResult<BusinessClientListItem>> {
    const clients = this.tables.clients.filter(
      (client) => client.organizationId === organizationId,
    );

    const items: BusinessClientListItem[] = clients.map((client) => {
      const projects = this.projectsOf(organizationId).filter(
        (project) => project.businessClientId === client.id,
      );
      const services = projects.flatMap((project) => this.servicesOf(project.id));

      const confirmed = [
        ...new Set(
          services
            .filter((service) => countsAsEvidence(service.confirmationStatus))
            .map((service) => service.serviceCategory),
        ),
      ];

      const cities = [
        ...new Set(
          projects
            .map((project) => project.city)
            .filter((city): city is string => city !== null),
        ),
      ];

      const ends = projects
        .map((project) => project.endDate)
        .filter((date): date is string => date !== null)
        .sort();

      const duplicateCandidateNames = clients
        .filter(
          (other) =>
            other.id !== client.id &&
            looksLikeSameValue(other.normalizedName, client.normalizedName),
        )
        .map((other) => other.name);

      return {
        id: client.id,
        name: client.name,
        country: client.country,
        isActive: client.isActive,
        projectCount: projects.length,
        activeProjectCount: projects.filter(
          (project) => project.projectStatus === 'active',
        ).length,
        locationCount: cities.length,
        confirmedServiceCategories: confirmed,
        lastProjectEnd: ends.at(-1) ?? null,
        duplicateCandidateNames,
      };
    });

    const filtered = items.filter((item) => {
      if (query.q !== undefined) {
        const needle = normalizeForComparison(query.q);
        if (!normalizeForComparison(item.name).includes(needle)) return false;
      }
      if (query.status === 'active' && !item.isActive) return false;
      if (query.status === 'inactive' && item.isActive) return false;

      if (query.city !== undefined) {
        const needle = normalizeCityName(query.city);
        const projects = this.projectsOf(organizationId).filter(
          (project) => project.businessClientId === item.id,
        );
        const hit = projects.some(
          (project) =>
            project.city !== null && normalizeCityName(project.city).includes(needle),
        );
        if (!hit) return false;
      }

      if (query.services !== undefined && query.services.length > 0) {
        const wanted = new Set(query.services);
        // Only confirmed categories count as a capability of the client.
        if (!item.confirmedServiceCategories.some((category) => wanted.has(category))) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (query.sort) {
        case 'projects':
          return query.direction === 'asc'
            ? a.projectCount - b.projectCount
            : b.projectCount - a.projectCount;
        case 'last_project':
          return compareNullableString(a.lastProjectEnd, b.lastProjectEnd, query.direction);
        case 'name':
        default:
          return query.direction === 'asc'
            ? a.name.localeCompare(b.name, 'de')
            : b.name.localeCompare(a.name, 'de');
      }
    });

    return paginate(sorted, query.page, query.pageSize);
  }

  async findClientById(
    organizationId: string,
    id: string,
  ): Promise<ClientDetail | null> {
    const client = this.tables.clients.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (client === undefined) return null;

    const projects = this.projectsOf(organizationId).filter(
      (project) => project.businessClientId === client.id,
    );
    const services = projects.flatMap((project) => this.servicesOf(project.id));

    return {
      client,
      projects: projects
        .sort((a, b) => compareNullableString(a.startDate, b.startDate, 'desc'))
        .map((project) => this.toListItem(project)),
      locations: [
        ...new Set(
          projects
            .map((project) => project.city)
            .filter((city): city is string => city !== null),
        ),
      ].sort((a, b) => a.localeCompare(b, 'de')),
      confirmedServiceCategories: [
        ...new Set(
          services
            .filter((service) => countsAsEvidence(service.confirmationStatus))
            .map((service) => service.serviceCategory),
        ),
      ],
      proposedServiceCategories: [
        ...new Set(
          services
            .filter((service) => service.confirmationStatus === 'proposed')
            .map((service) => service.serviceCategory),
        ),
      ],
      duplicateCandidates: this.tables.clients
        .filter(
          (other) =>
            other.organizationId === organizationId &&
            other.id !== client.id &&
            looksLikeSameValue(other.normalizedName, client.normalizedName),
        )
        .map((other) => ({ id: other.id, name: other.name })),
    };
  }

  async ensureClient(
    organizationId: string,
    name: string,
    country: string | null,
  ): Promise<{ client: BusinessClient; created: boolean }> {
    const normalizedName = normalizeClientName(name);
    const existing = this.tables.clients.find(
      (client) =>
        client.organizationId === organizationId &&
        client.normalizedName === normalizedName,
    );

    if (existing !== undefined) {
      return { client: existing, created: false };
    }

    const client = await this.createClient({
      organizationId,
      name,
      country,
      website: null,
      notes: null,
      isActive: true,
    });

    return { client, created: true };
  }

  async createClient(input: CreateClientInput): Promise<BusinessClient> {
    const now = new Date().toISOString();
    const client: BusinessClient = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      normalizedName: normalizeClientName(input.name),
      country: input.country,
      website: input.website,
      notes: input.notes,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };

    const clash = this.tables.clients.find(
      (entry) =>
        entry.organizationId === client.organizationId &&
        entry.normalizedName === client.normalizedName,
    );
    if (clash !== undefined) {
      // Mirrors the unique constraint in the database.
      throw new Error(`Ein Kunde mit dem Namen „${input.name}" existiert bereits.`);
    }

    this.tables.clients.push(client);
    return client;
  }

  async updateClient(
    organizationId: string,
    id: string,
    patch: Partial<Omit<CreateClientInput, 'organizationId'>>,
  ): Promise<BusinessClient | null> {
    const client = this.tables.clients.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (client === undefined) return null;

    if (patch.name !== undefined) {
      client.name = patch.name;
      client.normalizedName = normalizeClientName(patch.name);
    }
    if (patch.country !== undefined) client.country = patch.country;
    if (patch.website !== undefined) client.website = patch.website;
    if (patch.notes !== undefined) client.notes = patch.notes;
    if (patch.isActive !== undefined) client.isActive = patch.isActive;
    client.updatedAt = new Date().toISOString();

    return client;
  }

  // --- Projects ----------------------------------------------------------

  async listProjects(
    organizationId: string,
    query: ReferenceQuery,
  ): Promise<PaginatedResult<ReferenceProjectListItem>> {
    const items = this.projectsOf(organizationId).map((project) =>
      this.toListItem(project),
    );

    const filtered = items.filter((item) => {
      if (query.q !== undefined) {
        const needle = normalizeForComparison(query.q);
        const haystack = normalizeForComparison(
          [
            item.projectName,
            item.externalObjectNumber ?? '',
            item.businessClientName ?? '',
            item.city ?? '',
            item.objectType ?? '',
          ].join(' '),
        );
        if (!haystack.includes(needle)) return false;
      }

      if (query.clientId !== undefined && item.businessClientId !== query.clientId) {
        return false;
      }

      if (query.city !== undefined) {
        const needle = normalizeCityName(query.city);
        if (item.city === null || !normalizeCityName(item.city).includes(needle)) {
          return false;
        }
      }

      if (query.region !== undefined && item.region !== query.region) return false;

      if (query.objectType !== undefined && item.objectType !== query.objectType) {
        return false;
      }

      if (query.services !== undefined && query.services.length > 0) {
        const wanted = new Set(query.services);
        if (!item.serviceCategories.some((category) => wanted.has(category))) {
          return false;
        }
      }

      if (query.statuses !== undefined && query.statuses.length > 0) {
        if (!query.statuses.includes(item.projectStatus)) return false;
      }

      if (query.referenceStatus === 'confirmed' && item.hasUnconfirmedServices) {
        return false;
      }
      if (query.referenceStatus === 'open' && !item.hasUnconfirmedServices) {
        return false;
      }

      if (
        query.confirmationStatus === 'evidence' &&
        item.confirmedServiceCategories.length === 0
      ) {
        return false;
      }
      if (query.confirmationStatus === 'proposed' && !item.hasOnlyProposals) {
        return false;
      }
      if (query.confirmationStatus === 'undecided' && !item.hasUnconfirmedServices) {
        return false;
      }

      // A period filter matches when the project overlaps the window at all.
      if (query.periodFrom !== undefined) {
        const end = item.endDate ?? item.startDate;
        if (end !== null && end < query.periodFrom) return false;
      }
      if (query.periodTo !== undefined) {
        const start = item.startDate ?? item.endDate;
        if (start !== null && start > query.periodTo) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (query.sort) {
        case 'project_name':
          return query.direction === 'asc'
            ? a.projectName.localeCompare(b.projectName, 'de')
            : b.projectName.localeCompare(a.projectName, 'de');
        case 'client':
          return compareNullableString(
            a.businessClientName,
            b.businessClientName,
            query.direction,
          );
        case 'start_date':
        default:
          return compareNullableString(a.startDate, b.startDate, query.direction);
      }
    });

    return paginate(sorted, query.page, query.pageSize);
  }

  async findProjectById(
    organizationId: string,
    id: string,
  ): Promise<ReferenceProject | null> {
    const project = this.tables.projects.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (project === undefined) return null;

    const client = this.tables.clients.find(
      (entry) => entry.id === project.businessClientId,
    );

    return {
      ...project,
      businessClientName: client?.name ?? null,
      services: this.servicesOf(project.id),
    };
  }

  async createProject(input: CreateProjectInput): Promise<ReferenceProject> {
    if (input.externalObjectNumber !== null) {
      const clash = this.tables.projects.find(
        (project) =>
          project.organizationId === input.organizationId &&
          project.externalObjectNumber === input.externalObjectNumber,
      );
      if (clash !== undefined) {
        // Mirrors reference_projects_external_unique.
        throw new Error(
          `Die Objekt-Nr. „${input.externalObjectNumber}" ist bereits vergeben.`,
        );
      }
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    const project: ReferenceProject = {
      id,
      organizationId: input.organizationId,
      businessClientId: input.businessClientId,
      businessClientName: null,
      externalObjectNumber: input.externalObjectNumber,
      projectName: input.projectName,
      objectType: input.objectType,
      country: input.country,
      region: input.region,
      city: input.city,
      postalCode: input.postalCode,
      address: input.address,
      startDate: input.startDate,
      endDate: input.endDate,
      projectStatus: input.projectStatus,
      invoiceStatus: input.invoiceStatus,
      shiftSummaryRaw: input.shiftSummaryRaw,
      shiftValues: input.shiftValues,
      description: input.description,
      confidentialityLevel: 'internal',
      sourceImportId: input.sourceImportId,
      services: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tables.projects.push(project);

    for (const service of input.services) {
      this.tables.services.push({
        id: randomUUID(),
        referenceProjectId: id,
        serviceCategory: service.serviceCategory,
        serviceLabel: service.serviceLabel,
        classificationSource: service.classificationSource,
        classificationConfidence: service.classificationConfidence,
        // An imported classification always starts as an untouched proposal.
        confirmedByUser: false,
        confirmationStatus: 'proposed',
        confirmedAt: null,
        confirmedBy: null,
        confirmedByName: null,
        notes: service.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ...project, services: this.servicesOf(id) };
  }

  async applyServiceDecision(
    input: ServiceDecisionInput,
  ): Promise<ServiceDecisionResult | null> {
    const service = this.tables.services.find(
      (entry) => entry.id === input.serviceId,
    );
    if (service === undefined) return null;

    // Tenancy check through the parent project. A service of another
    // organisation is reported as "not found" so a probe reveals nothing.
    const project = this.tables.projects.find(
      (entry) =>
        entry.id === service.referenceProjectId &&
        entry.organizationId === input.organizationId,
    );
    if (project === undefined) return null;

    const before = {
      serviceCategory: service.serviceCategory,
      confirmationStatus: service.confirmationStatus,
    };

    const next = applyConfirmationAction(
      {
        serviceCategory: service.serviceCategory,
        confirmationStatus: service.confirmationStatus,
        confirmedByUser: service.confirmedByUser,
        confirmedAt: service.confirmedAt,
        confirmedBy: service.confirmedBy,
      },
      input.action,
      input.userId,
      input.targetCategory,
    );

    service.serviceCategory = next.serviceCategory;
    service.confirmationStatus = next.confirmationStatus;
    service.confirmedByUser = next.confirmedByUser;
    service.confirmedAt = next.confirmedAt;
    service.confirmedBy = next.confirmedBy;
    service.updatedAt = new Date().toISOString();
    if (input.note !== undefined) service.notes = input.note;

    return { referenceProjectId: project.id, before, after: { ...service } };
  }

  async listServicesByIds(
    organizationId: string,
    serviceIds: readonly string[],
  ): Promise<ReferenceProjectService[]> {
    const wanted = new Set(serviceIds);
    const ownProjectIds = new Set(
      this.projectsOf(organizationId).map((project) => project.id),
    );

    return this.tables.services.filter(
      (service) =>
        wanted.has(service.id) && ownProjectIds.has(service.referenceProjectId),
    );
  }

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
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async listDuplicateCandidates(
    organizationId: string,
  ): Promise<DuplicateCandidateSource[]> {
    return this.projectsOf(organizationId).map((project) => {
      const client = this.tables.clients.find(
        (entry) => entry.id === project.businessClientId,
      );
      return {
        id: project.id,
        externalObjectNumber: project.externalObjectNumber,
        projectName: project.projectName,
        businessClientName: client?.name ?? null,
        city: project.city,
      };
    });
  }

  // --- Imports -----------------------------------------------------------

  async createImport(input: CreateImportInput): Promise<ReferenceImport> {
    const now = new Date().toISOString();
    const importRun: ReferenceImport = {
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
      completedAt: now,
    };

    this.tables.imports.push(importRun);
    return importRun;
  }

  async addImportRows(rows: readonly CreateImportRowInput[]): Promise<void> {
    const now = new Date().toISOString();
    for (const row of rows) {
      this.tables.importRows.push({
        id: randomUUID(),
        referenceImportId: row.referenceImportId,
        rowNumber: row.rowNumber,
        rawData: row.rawData,
        normalizedData: row.normalizedData,
        validationStatus: row.validationStatus,
        validationMessages: row.validationMessages,
        importedProjectId: row.importedProjectId,
        createdAt: now,
      });
    }
  }

  async listImports(
    organizationId: string,
    limit: number,
  ): Promise<ReferenceImport[]> {
    return this.tables.imports
      .filter((entry) => entry.organizationId === organizationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async findImportById(
    organizationId: string,
    id: string,
  ): Promise<{ importRun: ReferenceImport; rows: ReferenceImportRow[] } | null> {
    const importRun = this.tables.imports.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (importRun === undefined) return null;

    return {
      importRun,
      rows: this.tables.importRows
        .filter((row) => row.referenceImportId === id)
        .sort((a, b) => a.rowNumber - b.rowNumber),
    };
  }

  // --- Aggregates --------------------------------------------------------

  async getMetrics(organizationId: string): Promise<ReferenceMetrics> {
    const projects = this.projectsOf(organizationId);
    const services = projects.flatMap((project) => this.servicesOf(project.id));

    const confirmedCategories = new Set<ReferenceServiceCategory>(
      services
        .filter(
          (service) =>
            countsAsEvidence(service.confirmationStatus) &&
            service.serviceCategory !== 'unknown',
        )
        .map((service) => service.serviceCategory),
    );

    const cities = new Set(
      projects
        .map((project) => project.city)
        .filter((city): city is string => city !== null)
        .map((city) => normalizeCityName(city)),
    );

    return {
      activeClients: this.tables.clients.filter(
        (client) => client.organizationId === organizationId && client.isActive,
      ).length,
      referenceProjects: projects.length,
      coveredLocations: cities.size,
      confirmedServiceCategories: confirmedCategories.size,
    };
  }

  async listFacets(organizationId: string): Promise<ReferenceFacets> {
    const projects = this.projectsOf(organizationId);
    const unique = (values: Array<string | null>): string[] =>
      [...new Set(values.filter((value): value is string => value !== null))].sort(
        (a, b) => a.localeCompare(b, 'de'),
      );

    return {
      clients: this.tables.clients
        .filter((client) => client.organizationId === organizationId)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((client) => ({ id: client.id, name: client.name })),
      cities: unique(projects.map((project) => project.city)),
      regions: unique(projects.map((project) => project.region)),
      objectTypes: unique(projects.map((project) => project.objectType)),
    };
  }
}
