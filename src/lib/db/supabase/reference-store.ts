/**
 * ReferenceStore backed by Postgres via Supabase.
 *
 * Every query filters on `organization_id` even though RLS already does —
 * belt and braces, and it keeps the SQL identical in intent to the in-memory
 * adapter, so the two cannot drift apart on tenancy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
import { asRow, asRows } from './rows';
import type { DuplicateCandidateSource } from '@/modules/references/dedupe';
import {
  looksLikeSameValue,
  normalizeCityName,
  normalizeClientName,
} from '@/modules/references/normalize';
import type { ClientQuery, ReferenceQuery } from '@/modules/references/query';
import type {
  BusinessClient,
  BusinessClientListItem,
  ClassificationSource,
  ConfidentialityLevel,
  ImportRowValidationStatus,
  ReferenceImport,
  ReferenceImportRow,
  ReferenceInvoiceStatus,
  ReferenceProject,
  ReferenceProjectListItem,
  ReferenceProjectService,
  ReferenceProjectStatus,
  ReferenceServiceCategory,
  ServiceConfirmationStatus,
  ValidationMessage,
} from '@/types/reference';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ServiceRow {
  id: string;
  reference_project_id: string;
  service_category: ReferenceServiceCategory;
  service_label: string | null;
  classification_source: ClassificationSource;
  classification_confidence: string | number | null;
  confirmed_by_user: boolean;
  confirmation_status: ServiceConfirmationStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; email: string } | null;
}

interface ProjectRow {
  id: string;
  organization_id: string;
  business_client_id: string | null;
  external_object_number: string | null;
  project_name: string;
  object_type: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  project_status: ReferenceProjectStatus;
  invoice_status: ReferenceInvoiceStatus;
  shift_summary_raw: string | null;
  shift_values: number[] | null;
  description: string | null;
  confidentiality_level: ConfidentialityLevel;
  source_import_id: string | null;
  created_at: string;
  updated_at: string;
  business_clients?: { name: string } | null;
  reference_project_services?: ServiceRow[] | null;
}

interface ImportRow {
  id: string;
  organization_id: string;
  file_name: string;
  file_type: 'csv' | 'xlsx' | 'manual';
  status: ReferenceImport['status'];
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ImportRowRow {
  id: string;
  reference_import_id: string;
  row_number: number;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  validation_status: ImportRowValidationStatus;
  validation_messages: ValidationMessage[];
  imported_project_id: string | null;
  created_at: string;
}

const PROJECT_COLUMNS = `
  id, organization_id, business_client_id, external_object_number, project_name,
  object_type, country, region, city, postal_code, address, start_date, end_date,
  project_status, invoice_status, shift_summary_raw, shift_values, description,
  confidentiality_level, source_import_id, created_at, updated_at,
  business_clients ( name ),
  reference_project_services ( *, profiles ( full_name, email ) )
`;

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toClient(row: ClientRow): BusinessClient {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    normalizedName: row.normalized_name,
    country: row.country,
    website: row.website,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toService(row: ServiceRow): ReferenceProjectService {
  return {
    id: row.id,
    referenceProjectId: row.reference_project_id,
    serviceCategory: row.service_category,
    serviceLabel: row.service_label,
    classificationSource: row.classification_source,
    classificationConfidence: toNumber(row.classification_confidence),
    confirmedByUser: row.confirmed_by_user,
    confirmationStatus: row.confirmation_status,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    confirmedByName: row.profiles?.full_name ?? row.profiles?.email ?? null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProject(row: ProjectRow): ReferenceProject {
  return {
    id: row.id,
    organizationId: row.organization_id,
    businessClientId: row.business_client_id,
    businessClientName: row.business_clients?.name ?? null,
    externalObjectNumber: row.external_object_number,
    projectName: row.project_name,
    objectType: row.object_type,
    country: row.country,
    region: row.region,
    city: row.city,
    postalCode: row.postal_code,
    address: row.address,
    startDate: row.start_date,
    endDate: row.end_date,
    projectStatus: row.project_status,
    invoiceStatus: row.invoice_status,
    shiftSummaryRaw: row.shift_summary_raw,
    shiftValues: row.shift_values ?? [],
    description: row.description,
    confidentialityLevel: row.confidentiality_level,
    sourceImportId: row.source_import_id,
    services: (row.reference_project_services ?? []).map(toService),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toListItem(row: ProjectRow): ReferenceProjectListItem {
  const services = (row.reference_project_services ?? []).map(toService);
  return {
    id: row.id,
    externalObjectNumber: row.external_object_number,
    projectName: row.project_name,
    businessClientId: row.business_client_id,
    businessClientName: row.business_clients?.name ?? null,
    objectType: row.object_type,
    country: row.country,
    region: row.region,
    city: row.city,
    startDate: row.start_date,
    endDate: row.end_date,
    projectStatus: row.project_status,
    invoiceStatus: row.invoice_status,
    shiftSummaryRaw: row.shift_summary_raw,
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
    confidentialityLevel: row.confidentiality_level,
  };
}

function toImport(row: ImportRow): ReferenceImport {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fileName: row.file_name,
    fileType: row.file_type,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    warningRows: row.warning_rows,
    errorRows: row.error_rows,
    importedRows: row.imported_rows,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export class SupabaseReferenceStore implements ReferenceStore {
  constructor(private readonly client: SupabaseClient) {}

  // --- Clients -----------------------------------------------------------

  async listClients(
    organizationId: string,
    query: ClientQuery,
  ): Promise<PaginatedResult<BusinessClientListItem>> {
    let request = this.client
      .from('business_clients')
      .select('*')
      .eq('organization_id', organizationId);

    if (query.q !== undefined) request = request.ilike('name', `%${query.q}%`);
    if (query.status === 'active') request = request.eq('is_active', true);
    if (query.status === 'inactive') request = request.eq('is_active', false);

    const { data, error } = await request.order('name');
    if (error !== null) {
      throw new Error(`Kunden konnten nicht geladen werden: ${error.message}`);
    }

    const clients = asRows<ClientRow>(data).map(toClient);

    // The aggregates need the projects anyway; one query beats N per client.
    const { data: projectData } = await this.client
      .from('reference_projects')
      .select(PROJECT_COLUMNS)
      .eq('organization_id', organizationId);

    const projects = asRows<ProjectRow>(projectData);

    const items: BusinessClientListItem[] = clients.map((client) => {
      const own = projects.filter((project) => project.business_client_id === client.id);
      const services = own.flatMap((project) => project.reference_project_services ?? []);

      const cities = new Set(
        own.map((project) => project.city).filter((city): city is string => city !== null),
      );

      const ends = own
        .map((project) => project.end_date)
        .filter((date): date is string => date !== null)
        .sort();

      return {
        id: client.id,
        name: client.name,
        country: client.country,
        isActive: client.isActive,
        projectCount: own.length,
        activeProjectCount: own.filter((project) => project.project_status === 'active')
          .length,
        locationCount: cities.size,
        confirmedServiceCategories: [
          ...new Set(
            services
              .filter((service) => countsAsEvidence(service.confirmation_status))
              .map((service) => service.service_category),
          ),
        ],
        lastProjectEnd: ends.at(-1) ?? null,
        duplicateCandidateNames: clients
          .filter(
            (other) =>
              other.id !== client.id &&
              looksLikeSameValue(other.normalizedName, client.normalizedName),
          )
          .map((other) => other.name),
      };
    });

    const filtered = items.filter((item) => {
      if (query.city !== undefined) {
        const needle = normalizeCityName(query.city);
        const own = projects.filter((project) => project.business_client_id === item.id);
        if (
          !own.some(
            (project) =>
              project.city !== null && normalizeCityName(project.city).includes(needle),
          )
        ) {
          return false;
        }
      }
      if (query.services !== undefined && query.services.length > 0) {
        const wanted = new Set(query.services);
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
        case 'last_project': {
          const left = a.lastProjectEnd ?? '';
          const right = b.lastProjectEnd ?? '';
          return query.direction === 'asc'
            ? left.localeCompare(right)
            : right.localeCompare(left);
        }
        case 'name':
        default:
          return query.direction === 'asc'
            ? a.name.localeCompare(b.name, 'de')
            : b.name.localeCompare(a.name, 'de');
      }
    });

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const offset = (page - 1) * query.pageSize;

    return {
      items: sorted.slice(offset, offset + query.pageSize),
      total,
      page,
      pageSize: query.pageSize,
      pageCount,
    };
  }

  async findClientById(
    organizationId: string,
    id: string,
  ): Promise<ClientDetail | null> {
    const { data, error } = await this.client
      .from('business_clients')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Kunde konnte nicht geladen werden: ${error.message}`);
    }

    const row = asRow<ClientRow>(data);
    if (row === null) return null;
    const client = toClient(row);

    const [projectResult, siblingResult] = await Promise.all([
      this.client
        .from('reference_projects')
        .select(PROJECT_COLUMNS)
        .eq('organization_id', organizationId)
        .eq('business_client_id', id)
        .order('start_date', { ascending: false, nullsFirst: false }),
      this.client
        .from('business_clients')
        .select('id, name, normalized_name')
        .eq('organization_id', organizationId)
        .neq('id', id),
    ]);

    const projects = asRows<ProjectRow>(projectResult.data);
    const services = projects.flatMap(
      (project) => project.reference_project_services ?? [],
    );

    return {
      client,
      projects: projects.map(toListItem),
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
            .filter((service) => countsAsEvidence(service.confirmation_status))
            .map((service) => service.service_category),
        ),
      ],
      proposedServiceCategories: [
        ...new Set(
          services
            .filter((service) => service.confirmation_status === 'proposed')
            .map((service) => service.service_category),
        ),
      ],
      duplicateCandidates: asRows<{
        id: string;
        name: string;
        normalized_name: string;
      }>(siblingResult.data)
        .filter((other) => looksLikeSameValue(other.normalized_name, client.normalizedName))
        .map((other) => ({ id: other.id, name: other.name })),
    };
  }

  async ensureClient(
    organizationId: string,
    name: string,
    country: string | null,
  ): Promise<{ client: BusinessClient; created: boolean }> {
    const normalizedName = normalizeClientName(name);

    const { data: existing } = await this.client
      .from('business_clients')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('normalized_name', normalizedName)
      .maybeSingle();

    const existingRow = asRow<ClientRow>(existing);
    if (existingRow !== null) {
      return { client: toClient(existingRow), created: false };
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
    const { data, error } = await this.client
      .from('business_clients')
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        normalized_name: normalizeClientName(input.name),
        country: input.country,
        website: input.website,
        notes: input.notes,
        is_active: input.isActive,
      })
      .select('*')
      .single();

    if (error !== null) {
      throw new Error(`Kunde konnte nicht angelegt werden: ${error.message}`);
    }

    const row = asRow<ClientRow>(data);
    if (row === null) throw new Error('Kunde konnte nicht angelegt werden.');
    return toClient(row);
  }

  async updateClient(
    organizationId: string,
    id: string,
    patch: Partial<Omit<CreateClientInput, 'organizationId'>>,
  ): Promise<BusinessClient | null> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      update.name = patch.name;
      update.normalized_name = normalizeClientName(patch.name);
    }
    if (patch.country !== undefined) update.country = patch.country;
    if (patch.website !== undefined) update.website = patch.website;
    if (patch.notes !== undefined) update.notes = patch.notes;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;

    const { data, error } = await this.client
      .from('business_clients')
      .update(update)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Kunde konnte nicht geändert werden: ${error.message}`);
    }

    const row = asRow<ClientRow>(data);
    return row === null ? null : toClient(row);
  }

  // --- Projects ----------------------------------------------------------

  async listProjects(
    organizationId: string,
    query: ReferenceQuery,
  ): Promise<PaginatedResult<ReferenceProjectListItem>> {
    let request = this.client
      .from('reference_projects')
      .select(PROJECT_COLUMNS, { count: 'exact' })
      .eq('organization_id', organizationId);

    if (query.clientId !== undefined) {
      request = request.eq('business_client_id', query.clientId);
    }
    if (query.city !== undefined) request = request.ilike('city', `%${query.city}%`);
    if (query.region !== undefined) request = request.eq('region', query.region);
    if (query.objectType !== undefined) {
      request = request.eq('object_type', query.objectType);
    }
    if (query.statuses !== undefined && query.statuses.length > 0) {
      request = request.in('project_status', query.statuses);
    }
    if (query.q !== undefined) {
      request = request.or(
        `project_name.ilike.%${query.q}%,external_object_number.ilike.%${query.q}%,city.ilike.%${query.q}%`,
      );
    }
    if (query.periodFrom !== undefined) {
      request = request.or(`end_date.gte.${query.periodFrom},end_date.is.null`);
    }
    if (query.periodTo !== undefined) {
      request = request.or(`start_date.lte.${query.periodTo},start_date.is.null`);
    }

    const ascending = query.direction === 'asc';
    switch (query.sort) {
      case 'project_name':
        request = request.order('project_name', { ascending });
        break;
      case 'client':
        request = request.order('business_client_id', { ascending });
        break;
      case 'start_date':
      default:
        request = request.order('start_date', { ascending, nullsFirst: false });
        break;
    }

    const offset = (query.page - 1) * query.pageSize;
    const { data, error, count } = await request.range(
      offset,
      offset + query.pageSize - 1,
    );

    if (error !== null) {
      throw new Error(`Referenzen konnten nicht geladen werden: ${error.message}`);
    }

    let items = asRows<ProjectRow>(data).map(toListItem);

    // Service filters live in the child table; PostgREST cannot express
    // "has any of these categories" together with the rest, so they are
    // applied here on the page that was fetched.
    if (query.services !== undefined && query.services.length > 0) {
      const wanted = new Set(query.services);
      items = items.filter((item) =>
        item.serviceCategories.some((category) => wanted.has(category)),
      );
    }
    if (query.referenceStatus === 'confirmed') {
      items = items.filter((item) => !item.hasUnconfirmedServices);
    }
    if (query.referenceStatus === 'open') {
      items = items.filter((item) => item.hasUnconfirmedServices);
    }
    if (query.confirmationStatus === 'evidence') {
      items = items.filter((item) => item.confirmedServiceCategories.length > 0);
    }
    if (query.confirmationStatus === 'proposed') {
      items = items.filter((item) => item.hasOnlyProposals);
    }
    if (query.confirmationStatus === 'undecided') {
      items = items.filter((item) => item.hasUnconfirmedServices);
    }

    const total = count ?? items.length;
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findProjectById(
    organizationId: string,
    id: string,
  ): Promise<ReferenceProject | null> {
    const { data, error } = await this.client
      .from('reference_projects')
      .select(PROJECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Referenz konnte nicht geladen werden: ${error.message}`);
    }

    const row = asRow<ProjectRow>(data);
    return row === null ? null : toProject(row);
  }

  async createProject(input: CreateProjectInput): Promise<ReferenceProject> {
    const { data, error } = await this.client
      .from('reference_projects')
      .insert({
        organization_id: input.organizationId,
        business_client_id: input.businessClientId,
        external_object_number: input.externalObjectNumber,
        project_name: input.projectName,
        object_type: input.objectType,
        country: input.country,
        region: input.region,
        city: input.city,
        postal_code: input.postalCode,
        address: input.address,
        start_date: input.startDate,
        end_date: input.endDate,
        project_status: input.projectStatus,
        invoice_status: input.invoiceStatus,
        shift_summary_raw: input.shiftSummaryRaw,
        shift_values: input.shiftValues,
        description: input.description,
        source_import_id: input.sourceImportId,
      })
      .select('id')
      .single();

    if (error !== null) {
      throw new Error(`Referenz konnte nicht gespeichert werden: ${error.message}`);
    }

    const created = asRow<{ id: string }>(data);
    if (created === null) throw new Error('Referenz konnte nicht gespeichert werden.');

    if (input.services.length > 0) {
      const { error: serviceError } = await this.client
        .from('reference_project_services')
        .insert(
          input.services.map((service) => ({
            reference_project_id: created.id,
            service_category: service.serviceCategory,
            service_label: service.serviceLabel,
            classification_source: service.classificationSource,
            classification_confidence: service.classificationConfidence,
            confirmed_by_user: service.confirmedByUser,
            notes: service.notes,
          })),
        );

      if (serviceError !== null) {
        throw new Error(
          `Leistungsarten konnten nicht gespeichert werden: ${serviceError.message}`,
        );
      }
    }

    const project = await this.findProjectById(input.organizationId, created.id);
    if (project === null) throw new Error('Referenz konnte nicht gelesen werden.');
    return project;
  }

  async applyServiceDecision(
    input: ServiceDecisionInput,
  ): Promise<ServiceDecisionResult | null> {
    const { data: serviceData } = await this.client
      .from('reference_project_services')
      .select('*')
      .eq('id', input.serviceId)
      .maybeSingle();

    const service = asRow<ServiceRow>(serviceData);
    if (service === null) return null;

    // Tenancy check through the parent project, mirroring the RLS policy. A
    // service of another organisation is reported as "not found".
    const { data: projectData } = await this.client
      .from('reference_projects')
      .select('id')
      .eq('id', service.reference_project_id)
      .eq('organization_id', input.organizationId)
      .maybeSingle();

    if (asRow<{ id: string }>(projectData) === null) return null;

    const before = {
      serviceCategory: service.service_category,
      confirmationStatus: service.confirmation_status,
    };

    const next = applyConfirmationAction(
      {
        serviceCategory: service.service_category,
        confirmationStatus: service.confirmation_status,
        confirmedByUser: service.confirmed_by_user,
        confirmedAt: service.confirmed_at,
        confirmedBy: service.confirmed_by,
      },
      input.action,
      input.userId,
      input.targetCategory,
    );

    const update: Record<string, unknown> = {
      service_category: next.serviceCategory,
      confirmation_status: next.confirmationStatus,
      confirmed_by_user: next.confirmedByUser,
      confirmed_at: next.confirmedAt,
      confirmed_by: next.confirmedBy,
    };
    if (input.note !== undefined) update.notes = input.note;

    const { data: updated, error } = await this.client
      .from('reference_project_services')
      .update(update)
      .eq('id', input.serviceId)
      .select('*, profiles ( full_name, email )')
      .single();

    if (error !== null) {
      throw new Error(`Entscheidung konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<ServiceRow>(updated);
    if (row === null) return null;

    return {
      referenceProjectId: service.reference_project_id,
      before,
      after: toService(row),
    };
  }

  async listServicesByIds(
    organizationId: string,
    serviceIds: readonly string[],
  ): Promise<ReferenceProjectService[]> {
    if (serviceIds.length === 0) return [];

    // Join through the project so the organisation filter applies.
    const { data, error } = await this.client
      .from('reference_project_services')
      .select('*, reference_projects!inner ( organization_id )')
      .in('id', [...serviceIds])
      .eq('reference_projects.organization_id', organizationId);

    if (error !== null) return [];
    return asRows<ServiceRow>(data).map(toService);
  }

  async recordAuditEntry(input: AuditEntryInput): Promise<void> {
    // The database trigger writes its own entry; this call covers the cases
    // the trigger cannot see, such as an attempt that changed nothing.
    const { error } = await this.client.from('audit_log').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      metadata: input.metadata,
    });

    if (error !== null) {
      throw new Error(`Audit-Eintrag konnte nicht geschrieben werden: ${error.message}`);
    }
  }

  async listAuditEntries(
    organizationId: string,
    resourceType: string,
    resourceIds: readonly string[],
    limit: number,
  ): Promise<AuditEntry[]> {
    if (resourceIds.length === 0) return [];

    const { data, error } = await this.client
      .from('audit_log')
      .select('*, profiles ( full_name, email )')
      .eq('organization_id', organizationId)
      .eq('resource_type', resourceType)
      .in('resource_id', [...resourceIds])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error !== null) return [];

    interface AuditRow {
      id: number | string;
      organization_id: string | null;
      user_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      profiles?: { full_name: string | null; email: string } | null;
    }

    return asRows<AuditRow>(data).map((row) => ({
      id: String(row.id),
      organizationId: row.organization_id,
      userId: row.user_id,
      userName: row.profiles?.full_name ?? row.profiles?.email ?? null,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    }));
  }

  async listDuplicateCandidates(
    organizationId: string,
  ): Promise<DuplicateCandidateSource[]> {
    const { data, error } = await this.client
      .from('reference_projects')
      .select('id, external_object_number, project_name, city, business_clients ( name )')
      .eq('organization_id', organizationId);

    if (error !== null) return [];

    interface CandidateRow {
      id: string;
      external_object_number: string | null;
      project_name: string;
      city: string | null;
      business_clients?: { name: string } | null;
    }

    return asRows<CandidateRow>(data).map((row) => ({
      id: row.id,
      externalObjectNumber: row.external_object_number,
      projectName: row.project_name,
      businessClientName: row.business_clients?.name ?? null,
      city: row.city,
    }));
  }

  // --- Imports -----------------------------------------------------------

  async createImport(input: CreateImportInput): Promise<ReferenceImport> {
    const { data, error } = await this.client
      .from('reference_imports')
      .insert({
        organization_id: input.organizationId,
        file_name: input.fileName,
        file_type: input.fileType,
        status: input.status,
        total_rows: input.totalRows,
        valid_rows: input.validRows,
        warning_rows: input.warningRows,
        error_rows: input.errorRows,
        imported_rows: input.importedRows,
        created_by: input.createdBy,
        completed_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error !== null) {
      throw new Error(`Importlauf konnte nicht angelegt werden: ${error.message}`);
    }

    const row = asRow<ImportRow>(data);
    if (row === null) throw new Error('Importlauf konnte nicht angelegt werden.');
    return toImport(row);
  }

  async addImportRows(rows: readonly CreateImportRowInput[]): Promise<void> {
    if (rows.length === 0) return;

    const { error } = await this.client.from('reference_import_rows').insert(
      rows.map((row) => ({
        reference_import_id: row.referenceImportId,
        row_number: row.rowNumber,
        raw_data: row.rawData,
        normalized_data: row.normalizedData,
        validation_status: row.validationStatus,
        validation_messages: row.validationMessages,
        imported_project_id: row.importedProjectId,
      })),
    );

    if (error !== null) {
      throw new Error(`Importzeilen konnten nicht gespeichert werden: ${error.message}`);
    }
  }

  async listImports(organizationId: string, limit: number): Promise<ReferenceImport[]> {
    const { data, error } = await this.client
      .from('reference_imports')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error !== null) return [];
    return asRows<ImportRow>(data).map(toImport);
  }

  async findImportById(
    organizationId: string,
    id: string,
  ): Promise<{ importRun: ReferenceImport; rows: ReferenceImportRow[] } | null> {
    const { data, error } = await this.client
      .from('reference_imports')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) return null;
    const row = asRow<ImportRow>(data);
    if (row === null) return null;

    const { data: rowData } = await this.client
      .from('reference_import_rows')
      .select('*')
      .eq('reference_import_id', id)
      .order('row_number');

    return {
      importRun: toImport(row),
      rows: asRows<ImportRowRow>(rowData).map((entry) => ({
        id: entry.id,
        referenceImportId: entry.reference_import_id,
        rowNumber: entry.row_number,
        rawData: entry.raw_data,
        normalizedData: entry.normalized_data,
        validationStatus: entry.validation_status,
        validationMessages: entry.validation_messages,
        importedProjectId: entry.imported_project_id,
        createdAt: entry.created_at,
      })),
    };
  }

  // --- Aggregates --------------------------------------------------------

  async getMetrics(organizationId: string): Promise<ReferenceMetrics> {
    const [clientResult, projectResult] = await Promise.all([
      this.client
        .from('business_clients')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      this.client
        .from('reference_projects')
        .select(
          'city, reference_project_services ( service_category, confirmation_status )',
        )
        .eq('organization_id', organizationId),
    ]);

    interface MetricRow {
      city: string | null;
      reference_project_services?: Array<{
        service_category: ReferenceServiceCategory;
        confirmation_status: ServiceConfirmationStatus;
      }> | null;
    }

    const projects = asRows<MetricRow>(projectResult.data);

    const cities = new Set(
      projects
        .map((project) => project.city)
        .filter((city): city is string => city !== null)
        .map((city) => normalizeCityName(city)),
    );

    const confirmed = new Set(
      projects
        .flatMap((project) => project.reference_project_services ?? [])
        .filter(
          (service) =>
            countsAsEvidence(service.confirmation_status) &&
            service.service_category !== 'unknown',
        )
        .map((service) => service.service_category),
    );

    return {
      activeClients: clientResult.count ?? 0,
      referenceProjects: projects.length,
      coveredLocations: cities.size,
      confirmedServiceCategories: confirmed.size,
    };
  }

  async listFacets(organizationId: string): Promise<ReferenceFacets> {
    const [clientResult, projectResult] = await Promise.all([
      this.client
        .from('business_clients')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name'),
      this.client
        .from('reference_projects')
        .select('city, region, object_type')
        .eq('organization_id', organizationId),
    ]);

    interface FacetRow {
      city: string | null;
      region: string | null;
      object_type: string | null;
    }

    const projects = asRows<FacetRow>(projectResult.data);
    const unique = (values: Array<string | null>): string[] =>
      [...new Set(values.filter((value): value is string => value !== null))].sort(
        (a, b) => a.localeCompare(b, 'de'),
      );

    return {
      clients: asRows<{ id: string; name: string }>(clientResult.data),
      cities: unique(projects.map((project) => project.city)),
      regions: unique(projects.map((project) => project.region)),
      objectTypes: unique(projects.map((project) => project.object_type)),
    };
  }
}
