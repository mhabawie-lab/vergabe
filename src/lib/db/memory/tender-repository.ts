/**
 * TenderRepository backed by the in-memory tables.
 *
 * The filter semantics here mirror the SQL adapter one-for-one so the search
 * screen behaves identically in demo mode and against Postgres.
 */

import type {
  AuthorityDetail,
  AuthorityListItem,
  DashboardMetrics,
  DocumentListItem,
  FilterFacets,
  PaginatedResult,
  TenderRepository,
} from '@/lib/db/ports';
import { scoreTender, TOP_MATCH_THRESHOLD } from '@/modules/matching/preview';
import { normalizeForComparison } from '@/modules/ingestion/dedupe/fingerprint';
import type { TenderSearchQuery } from '@/modules/tenders/query';
import type { ConnectorRun, Source, SourceHealth } from '@/types/source';
import type { Award, Tender, TenderListItem, TenderStatus } from '@/types/tender';
import type { MemoryTables } from './tables';

const OPEN_STATUSES: readonly TenderStatus[] = ['published', 'amended'];

function toListItem(tender: Tender): TenderListItem {
  return {
    id: tender.id,
    title: tender.title,
    summary: tender.summary,
    sourceKey: tender.sourceKey,
    sourceName: tender.sourceName,
    externalId: tender.externalId,
    authorityName: tender.contractingAuthority?.name ?? null,
    city: tender.city,
    regionCode: tender.regionCode,
    countryCode: tender.countryCode,
    cpvCodes: tender.cpvCodes,
    sectors: tender.sectors,
    publicationDate: tender.publicationDate,
    submissionDeadline: tender.submissionDeadline,
    durationMonths: tender.durationMonths,
    estimatedValueNet: tender.estimatedValueNet,
    currency: tender.currency,
    status: tender.status,
    procurementType: tender.procurementType,
    isDemo: tender.isDemo,
  };
}

function hasOverlap(values: readonly string[], filter: readonly string[]): boolean {
  if (filter.length === 0) return true;
  const set = new Set(filter);
  return values.some((value) => set.has(value));
}

/** Compares an ISO timestamp against a `YYYY-MM-DD` boundary. */
function isOnOrAfter(value: string | null, boundary: string | undefined): boolean {
  if (boundary === undefined) return true;
  if (value === null) return false;
  return value.slice(0, 10) >= boundary;
}

function isOnOrBefore(value: string | null, boundary: string | undefined): boolean {
  if (boundary === undefined) return true;
  if (value === null) return false;
  return value.slice(0, 10) <= boundary;
}

/** Naive relevance: how many query terms appear in the searchable text. */
function relevanceScore(tender: Tender, terms: readonly string[]): number {
  if (terms.length === 0) return 0;

  const haystack = normalizeForComparison(
    [
      tender.title,
      tender.title, // title weighted twice, mirroring setweight('A')
      tender.referenceNumber ?? '',
      tender.summary ?? '',
      tender.description ?? '',
      tender.city ?? '',
      tender.contractingAuthority?.name ?? '',
    ].join(' '),
  );

  return terms.filter((term) => haystack.includes(term)).length;
}

function compareNullableString(
  a: string | null,
  b: string | null,
  direction: 'asc' | 'desc',
): number {
  // Nulls always sort last, regardless of direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? (a < b ? -1 : a > b ? 1 : 0) : a > b ? -1 : a < b ? 1 : 0;
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: 'asc' | 'desc',
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

export class MemoryTenderRepository implements TenderRepository {
  constructor(private readonly tables: MemoryTables) {}

  async search(query: TenderSearchQuery): Promise<PaginatedResult<TenderListItem>> {
    const terms =
      query.q === undefined
        ? []
        : normalizeForComparison(query.q)
            .split(' ')
            .filter((term) => term.length > 0);

    const nowIso = new Date().toISOString();

    const matched = this.tables.tenders.filter((tender) => {
      if (terms.length > 0 && relevanceScore(tender, terms) === 0) return false;
      if (!hasOverlap(tender.sectors, query.sectors ?? [])) return false;
      if (!hasOverlap(tender.cpvCodes, query.cpv ?? [])) return false;

      if (
        (query.countries?.length ?? 0) > 0 &&
        (tender.countryCode === null || !query.countries?.includes(tender.countryCode))
      ) {
        return false;
      }

      if (
        (query.regions?.length ?? 0) > 0 &&
        (tender.regionCode === null || !query.regions?.includes(tender.regionCode))
      ) {
        return false;
      }

      if (query.city !== undefined) {
        const needle = normalizeForComparison(query.city);
        const haystack = tender.city === null ? '' : normalizeForComparison(tender.city);
        if (!haystack.includes(needle)) return false;
      }

      if (
        query.authorityId !== undefined &&
        tender.contractingAuthorityId !== query.authorityId
      ) {
        return false;
      }

      if (
        (query.sources?.length ?? 0) > 0 &&
        !query.sources?.includes(tender.sourceKey)
      ) {
        return false;
      }

      if (
        (query.statuses?.length ?? 0) > 0 &&
        !query.statuses?.includes(tender.status)
      ) {
        return false;
      }

      if (query.valueMin !== undefined) {
        if (tender.estimatedValueNet === null) return false;
        if (tender.estimatedValueNet < query.valueMin) return false;
      }

      if (query.valueMax !== undefined) {
        if (tender.estimatedValueNet === null) return false;
        if (tender.estimatedValueNet > query.valueMax) return false;
      }

      if (!isOnOrAfter(tender.publicationDate, query.publishedFrom)) return false;
      if (!isOnOrBefore(tender.publicationDate, query.publishedTo)) return false;
      if (!isOnOrAfter(tender.submissionDeadline, query.deadlineFrom)) return false;
      if (!isOnOrBefore(tender.submissionDeadline, query.deadlineTo)) return false;

      if (query.durationMinMonths !== undefined) {
        if (tender.durationMonths === null) return false;
        if (tender.durationMonths < query.durationMinMonths) return false;
      }

      if (query.durationMaxMonths !== undefined) {
        if (tender.durationMonths === null) return false;
        if (tender.durationMonths > query.durationMaxMonths) return false;
      }

      if (query.openOnly === true) {
        if (!OPEN_STATUSES.includes(tender.status)) return false;
        if (tender.submissionDeadline === null) return false;
        if (tender.submissionDeadline < nowIso) return false;
      }

      return true;
    });

    const sorted = [...matched].sort((a, b) => {
      switch (query.sort) {
        case 'submission_deadline':
          return compareNullableString(
            a.submissionDeadline,
            b.submissionDeadline,
            query.direction,
          );
        case 'estimated_value':
          return compareNullableNumber(
            a.estimatedValueNet,
            b.estimatedValueNet,
            query.direction,
          );
        case 'relevance': {
          const scoreDiff = relevanceScore(b, terms) - relevanceScore(a, terms);
          if (scoreDiff !== 0) return scoreDiff;
          return compareNullableString(a.publicationDate, b.publicationDate, 'desc');
        }
        case 'publication_date':
          return compareNullableString(
            a.publicationDate,
            b.publicationDate,
            query.direction,
          );
        default:
          return 0;
      }
    });

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const offset = (page - 1) * query.pageSize;

    return {
      items: sorted.slice(offset, offset + query.pageSize).map(toListItem),
      total,
      page,
      pageSize: query.pageSize,
      pageCount,
    };
  }

  async findById(id: string): Promise<Tender | null> {
    const tender = this.tables.tenders.find((entry) => entry.id === id);
    if (tender === undefined) return null;

    // Children live in their own tables; hydrate them the way a SQL join would.
    return {
      ...tender,
      lots: this.tables.lots.filter((lot) => lot.tenderId === id),
      requirements: this.tables.requirements.filter(
        (requirement) => requirement.tenderId === id,
      ),
      documents: this.tables.documents.filter((document) => document.tenderId === id),
    };
  }

  async listUpcomingDeadlines(limit: number): Promise<TenderListItem[]> {
    const nowIso = new Date().toISOString();

    return this.tables.tenders
      .filter(
        (tender) =>
          OPEN_STATUSES.includes(tender.status) &&
          tender.submissionDeadline !== null &&
          tender.submissionDeadline >= nowIso,
      )
      .sort((a, b) =>
        compareNullableString(a.submissionDeadline, b.submissionDeadline, 'asc'),
      )
      .slice(0, limit)
      .map(toListItem);
  }

  async listRecent(limit: number): Promise<TenderListItem[]> {
    return [...this.tables.tenders]
      .sort((a, b) => compareNullableString(a.publicationDate, b.publicationDate, 'desc'))
      .slice(0, limit)
      .map(toListItem);
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);

    const nowIso = now.toISOString();
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10);
    const inThirtyDaysIso = inThirtyDays.toISOString();

    const openTenders = this.tables.tenders.filter(
      (tender) =>
        OPEN_STATUSES.includes(tender.status) &&
        tender.submissionDeadline !== null &&
        tender.submissionDeadline >= nowIso,
    );

    const newTenders = this.tables.tenders.filter(
      (tender) =>
        tender.publicationDate !== null && tender.publicationDate >= sevenDaysAgoIso,
    ).length;

    const topMatches = openTenders.filter(
      (tender) => scoreTender(toListItem(tender)).score >= TOP_MATCH_THRESHOLD,
    ).length;

    const openDeadlines = openTenders.filter(
      (tender) =>
        tender.submissionDeadline !== null &&
        tender.submissionDeadline <= inThirtyDaysIso,
    ).length;

    const openVolume = openTenders.reduce(
      (sum, tender) => sum + (tender.estimatedValueNet ?? 0),
      0,
    );

    const newAwards = this.tables.awards.filter(
      (award) => award.awardDate !== null && award.awardDate >= thirtyDaysAgoIso,
    ).length;

    return {
      newTenders,
      topMatches,
      openDeadlines,
      openVolume,
      newAwards,
      // Watchlists are per-organisation and require a database; demo mode has none.
      watchedAuthorities: 0,
    };
  }

  async listAuthorities(
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<AuthorityListItem>> {
    const nowIso = new Date().toISOString();
    const needle = search === null ? null : normalizeForComparison(search);

    const items: AuthorityListItem[] = this.tables.authorities
      .filter((authority) => {
        if (needle === null || needle.length === 0) return true;
        return normalizeForComparison(authority.name).includes(needle);
      })
      .map((authority) => {
        const tenders = this.tables.tenders.filter(
          (tender) => tender.contractingAuthorityId === authority.id,
        );

        return {
          id: authority.id,
          name: authority.name,
          authorityType: authority.authorityType,
          city: authority.city,
          regionCode: authority.regionCode,
          countryCode: authority.countryCode,
          tenderCount: tenders.length,
          openTenderCount: tenders.filter(
            (tender) =>
              OPEN_STATUSES.includes(tender.status) &&
              tender.submissionDeadline !== null &&
              tender.submissionDeadline >= nowIso,
          ).length,
          awardCount: this.tables.awards.filter(
            (award) => award.contractingAuthorityId === authority.id,
          ).length,
          isDemo: authority.isDemo,
        };
      })
      .sort((a, b) => b.tenderCount - a.tenderCount || a.name.localeCompare(b.name, 'de'));

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

  async findAuthorityById(id: string): Promise<AuthorityDetail | null> {
    const authority = this.tables.authorities.find((entry) => entry.id === id);
    if (authority === undefined) return null;

    return {
      authority,
      tenders: this.tables.tenders
        .filter((tender) => tender.contractingAuthorityId === id)
        .sort((a, b) =>
          compareNullableString(a.publicationDate, b.publicationDate, 'desc'),
        )
        .map(toListItem),
      awards: this.tables.awards.filter(
        (award) => award.contractingAuthorityId === id,
      ),
    };
  }

  async listAwards(page: number, pageSize: number): Promise<PaginatedResult<Award>> {
    const sorted = [...this.tables.awards].sort((a, b) =>
      compareNullableString(a.awardDate, b.awardDate, 'desc'),
    );

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, pageCount);
    const offset = (currentPage - 1) * pageSize;

    return {
      items: sorted.slice(offset, offset + pageSize),
      total,
      page: currentPage,
      pageSize,
      pageCount,
    };
  }

  async listDocuments(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<DocumentListItem>> {
    const titleByTenderId = new Map(
      this.tables.tenders.map((tender) => [tender.id, tender.title]),
    );

    const items: DocumentListItem[] = this.tables.documents.map((document) => ({
      id: document.id,
      tenderId: document.tenderId,
      tenderTitle: titleByTenderId.get(document.tenderId) ?? '',
      title: document.title,
      fileType: document.fileType,
      fileSizeBytes: document.fileSizeBytes,
      downloadStatus: document.downloadStatus,
      isDemo: document.isDemo,
    }));

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

  async listAwardsForTender(tenderId: string): Promise<Award[]> {
    return this.tables.awards.filter((award) => award.tenderId === tenderId);
  }

  async listFilterFacets(): Promise<FilterFacets> {
    const cities = [
      ...new Set(
        this.tables.tenders
          .map((tender) => tender.city)
          .filter((city): city is string => city !== null),
      ),
    ].sort((a, b) => a.localeCompare(b, 'de'));

    return {
      sources: this.tables.sources.map((source) => ({
        key: source.key,
        name: source.name,
        isDemo: source.isDemo,
      })),
      authorities: [...this.tables.authorities]
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((authority) => ({ id: authority.id, name: authority.name })),
      cities,
    };
  }

  async listSourceHealth(): Promise<SourceHealth[]> {
    return this.tables.sources.map((source) => {
      const runs = this.tables.connectorRuns
        .filter((run) => run.sourceId === source.id)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

      return {
        source,
        lastRun: runs[0] ?? null,
        tenderCount: this.tables.tenders.filter(
          (tender) => tender.sourceId === source.id,
        ).length,
        rawImportCount: this.tables.rawImports.filter(
          (rawImport) => rawImport.sourceId === source.id,
        ).length,
      };
    });
  }

  async listSources(): Promise<Source[]> {
    return [...this.tables.sources];
  }

  async listConnectorRuns(limit: number): Promise<ConnectorRun[]> {
    return [...this.tables.connectorRuns]
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit);
  }

  /** See the Supabase adapter: an empty store is not a demo dataset. */
  async isDemoOnly(): Promise<boolean> {
    return (
      this.tables.tenders.length > 0 &&
      this.tables.tenders.every((tender) => tender.isDemo)
    );
  }
}
