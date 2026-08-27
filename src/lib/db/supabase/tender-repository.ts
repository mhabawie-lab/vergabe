/**
 * TenderRepository backed by Postgres via Supabase.
 *
 * Reads run through the user-scoped client, so RLS decides what is visible.
 * Filters are translated into indexed predicates — see the index definitions
 * in supabase/migrations/0004_tenders.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthorityDetail,
  AuthorityListItem,
  DashboardMetrics,
  DocumentListItem,
  FilterFacets,
  PaginatedResult,
  TenderRepository,
} from '@/lib/db/ports';
import { logger } from '@/lib/logging';
import type { TenderSearchQuery } from '@/modules/tenders/query';
import { scoreTender, TOP_MATCH_THRESHOLD } from '@/modules/matching/preview';
import type { ConnectorRun, Source, SourceHealth } from '@/types/source';
import type { Award, Tender, TenderListItem, TenderStatus } from '@/types/tender';
import {
  asRow,
  asRows,
  toAuthority,
  toAward,
  toConnectorRun,
  toDocument,
  toLot,
  toRequirement,
  toSource,
  toTender,
  toTenderListItem,
  type AuthorityRow,
  type AwardRow,
  type ConnectorRunRow,
  type DocumentRow,
  type LotRow,
  type RequirementRow,
  type SourceRow,
  type TenderRow,
} from './rows';

const OPEN_STATUSES: readonly TenderStatus[] = ['published', 'amended'];

/** Columns needed for a list row, including the two joins the table shows. */
const LIST_COLUMNS = `
  id, source_id, external_id, raw_import_id, source_url, original_language,
  fingerprint, dedupe_group_id, title, summary, description, reference_number,
  procurement_type, procedure_type, cpv_codes, sectors, nuts_codes,
  country_code, region_code, city, postal_code, contracting_authority_id,
  publication_date, submission_deadline, question_deadline, binding_period_end,
  contract_start, contract_end, duration_months, estimated_value_net, currency,
  status, source_extras, is_demo, created_at, updated_at,
  sources ( key, name ),
  contracting_authorities ( id, name, city, region_code, country_code )
`;

const DETAIL_COLUMNS = `
  id, source_id, external_id, raw_import_id, source_url, original_language,
  fingerprint, dedupe_group_id, title, summary, description, reference_number,
  procurement_type, procedure_type, cpv_codes, sectors, nuts_codes,
  country_code, region_code, city, postal_code, contracting_authority_id,
  publication_date, submission_deadline, question_deadline, binding_period_end,
  contract_start, contract_end, duration_months, estimated_value_net, currency,
  status, source_extras, is_demo, created_at, updated_at,
  sources ( key, name ),
  contracting_authorities ( * )
`;

export class SupabaseTenderRepository implements TenderRepository {
  constructor(private readonly client: SupabaseClient) {}

  async search(query: TenderSearchQuery): Promise<PaginatedResult<TenderListItem>> {
    let request = this.client
      .from('tenders')
      .select(LIST_COLUMNS, { count: 'exact' });

    if (query.q !== undefined) {
      // Uses the generated tsvector column and its GIN index.
      request = request.textSearch('search_vector', query.q, {
        type: 'websearch',
        config: 'german',
      });
    }

    if (query.sectors !== undefined && query.sectors.length > 0) {
      request = request.overlaps('sectors', query.sectors);
    }

    if (query.cpv !== undefined && query.cpv.length > 0) {
      request = request.overlaps('cpv_codes', query.cpv);
    }

    if (query.countries !== undefined && query.countries.length > 0) {
      request = request.in('country_code', query.countries);
    }

    if (query.regions !== undefined && query.regions.length > 0) {
      request = request.in('region_code', query.regions);
    }

    if (query.city !== undefined) {
      request = request.ilike('city', `%${query.city}%`);
    }

    if (query.authorityId !== undefined) {
      request = request.eq('contracting_authority_id', query.authorityId);
    }

    if (query.sources !== undefined && query.sources.length > 0) {
      const sourceIds = await this.resolveSourceIds(query.sources);
      request = request.in('source_id', sourceIds);
    }

    if (query.statuses !== undefined && query.statuses.length > 0) {
      request = request.in('status', query.statuses);
    }

    if (query.valueMin !== undefined) {
      request = request.gte('estimated_value_net', query.valueMin);
    }

    if (query.valueMax !== undefined) {
      request = request.lte('estimated_value_net', query.valueMax);
    }

    if (query.publishedFrom !== undefined) {
      request = request.gte('publication_date', query.publishedFrom);
    }

    if (query.publishedTo !== undefined) {
      request = request.lte('publication_date', `${query.publishedTo}T23:59:59Z`);
    }

    if (query.deadlineFrom !== undefined) {
      request = request.gte('submission_deadline', query.deadlineFrom);
    }

    if (query.deadlineTo !== undefined) {
      request = request.lte('submission_deadline', `${query.deadlineTo}T23:59:59Z`);
    }

    if (query.durationMinMonths !== undefined) {
      request = request.gte('duration_months', query.durationMinMonths);
    }

    if (query.durationMaxMonths !== undefined) {
      request = request.lte('duration_months', query.durationMaxMonths);
    }

    if (query.openOnly === true) {
      request = request
        .in('status', [...OPEN_STATUSES])
        .gte('submission_deadline', new Date().toISOString());
    }

    const ascending = query.direction === 'asc';
    switch (query.sort) {
      case 'submission_deadline':
        request = request.order('submission_deadline', {
          ascending,
          nullsFirst: false,
        });
        break;
      case 'estimated_value':
        request = request.order('estimated_value_net', {
          ascending,
          nullsFirst: false,
        });
        break;
      case 'relevance':
      case 'publication_date':
      default:
        // Postgres cannot order by ts_rank through PostgREST without an RPC,
        // so relevance falls back to recency until the RPC lands in phase 2.
        request = request.order('publication_date', {
          ascending,
          nullsFirst: false,
        });
        break;
    }

    const offset = (query.page - 1) * query.pageSize;
    request = request.range(offset, offset + query.pageSize - 1);

    const { data, error, count } = await request;
    if (error !== null) {
      logger.error('Ausschreibungssuche fehlgeschlagen', {
        scope: 'db:supabase',
        error: error.message,
      });
      throw new Error(`Ausschreibungssuche fehlgeschlagen: ${error.message}`);
    }

    const total = count ?? 0;
    return {
      items: asRows<TenderRow>(data).map(toTenderListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private async resolveSourceIds(keys: string[]): Promise<string[]> {
    const { data, error } = await this.client
      .from('sources')
      .select('id, key')
      .in('key', keys);

    if (error !== null) return [];
    return asRows<{ id: string; key: string }>(data).map((row) => row.id);
  }

  async findById(id: string): Promise<Tender | null> {
    const { data, error } = await this.client
      .from('tenders')
      .select(DETAIL_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Ausschreibung konnte nicht geladen werden: ${error.message}`);
    }

    const row = asRow<TenderRow>(data);
    if (row === null) return null;

    const [lots, requirements, documents] = await Promise.all([
      this.client.from('tender_lots').select('*').eq('tender_id', id).order('lot_number'),
      this.client.from('tender_requirements').select('*').eq('tender_id', id),
      this.client.from('tender_documents').select('*').eq('tender_id', id),
    ]);

    return toTender(row, {
      lots: asRows<LotRow>(lots.data).map(toLot),
      requirements: asRows<RequirementRow>(requirements.data).map(toRequirement),
      documents: asRows<DocumentRow>(documents.data).map(toDocument),
    });
  }

  async listUpcomingDeadlines(limit: number): Promise<TenderListItem[]> {
    const { data, error } = await this.client
      .from('tenders')
      .select(LIST_COLUMNS)
      .in('status', [...OPEN_STATUSES])
      .gte('submission_deadline', new Date().toISOString())
      .order('submission_deadline', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error !== null) {
      throw new Error(`Fristen konnten nicht geladen werden: ${error.message}`);
    }

    return asRows<TenderRow>(data).map(toTenderListItem);
  }

  async listRecent(limit: number): Promise<TenderListItem[]> {
    const { data, error } = await this.client
      .from('tenders')
      .select(LIST_COLUMNS)
      .order('publication_date', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error !== null) {
      throw new Error(`Ausschreibungen konnten nicht geladen werden: ${error.message}`);
    }

    return asRows<TenderRow>(data).map(toTenderListItem);
  }

  async getDashboardMetrics(organizationId: string | null): Promise<DashboardMetrics> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);

    const nowIso = now.toISOString();

    const [newTenders, openDeadlines, openTenders, newAwards, watched] =
      await Promise.all([
        this.client
          .from('tenders')
          .select('id', { count: 'exact', head: true })
          .gte('publication_date', sevenDaysAgo.toISOString()),
        this.client
          .from('tenders')
          .select('id', { count: 'exact', head: true })
          .in('status', [...OPEN_STATUSES])
          .gte('submission_deadline', nowIso)
          .lte('submission_deadline', inThirtyDays.toISOString()),
        // Values and match inputs for the open set. Capped: the KPI is a
        // headline figure, not an exhaustive aggregate.
        this.client
          .from('tenders')
          .select(
            'estimated_value_net, sectors, cpv_codes, region_code, country_code',
          )
          .in('status', [...OPEN_STATUSES])
          .gte('submission_deadline', nowIso)
          .limit(1000),
        this.client
          .from('awards')
          .select('id', { count: 'exact', head: true })
          .gte('award_date', thirtyDaysAgo.toISOString().slice(0, 10)),
        organizationId === null
          ? Promise.resolve({ count: 0 })
          : this.client
              .from('watched_authorities')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId),
      ]);

    interface OpenTenderRow {
      estimated_value_net: string | number | null;
      sectors: string[] | null;
      cpv_codes: string[] | null;
      region_code: string | null;
      country_code: string | null;
    }

    const openRows = asRows<OpenTenderRow>(openTenders.data);

    const openVolume = openRows.reduce((sum, row) => {
      const value =
        row.estimated_value_net === null
          ? 0
          : Number.parseFloat(String(row.estimated_value_net));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const topMatches = openRows.filter((row) => {
      const preview = scoreTender({
        sectors: row.sectors ?? [],
        cpvCodes: row.cpv_codes ?? [],
        regionCode: row.region_code,
        countryCode: row.country_code,
        estimatedValueNet:
          row.estimated_value_net === null
            ? null
            : Number.parseFloat(String(row.estimated_value_net)),
      });
      return preview.score >= TOP_MATCH_THRESHOLD;
    }).length;

    return {
      newTenders: newTenders.count ?? 0,
      topMatches,
      openDeadlines: openDeadlines.count ?? 0,
      openVolume,
      newAwards: newAwards.count ?? 0,
      watchedAuthorities: watched.count ?? 0,
    };
  }

  async listAuthorities(
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<AuthorityListItem>> {
    let request = this.client
      .from('contracting_authorities')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true });

    if (search !== null && search.length > 0) {
      request = request.ilike('name', `%${search}%`);
    }

    const offset = (page - 1) * pageSize;
    const { data, error, count } = await request.range(offset, offset + pageSize - 1);

    if (error !== null) {
      throw new Error(`Auftraggeber konnten nicht geladen werden: ${error.message}`);
    }

    const rows = asRows<AuthorityRow>(data);
    const nowIso = new Date().toISOString();

    // Per-authority counts, resolved in parallel. Replaced by a materialised
    // view once the authority list grows beyond a page of results.
    const items = await Promise.all(
      rows.map(async (row): Promise<AuthorityListItem> => {
        const [tenderCount, openCount, awardCount] = await Promise.all([
          this.client
            .from('tenders')
            .select('id', { count: 'exact', head: true })
            .eq('contracting_authority_id', row.id),
          this.client
            .from('tenders')
            .select('id', { count: 'exact', head: true })
            .eq('contracting_authority_id', row.id)
            .in('status', [...OPEN_STATUSES])
            .gte('submission_deadline', nowIso),
          this.client
            .from('awards')
            .select('id', { count: 'exact', head: true })
            .eq('contracting_authority_id', row.id),
        ]);

        return {
          id: row.id,
          name: row.name,
          authorityType: row.authority_type,
          city: row.city,
          regionCode: row.region_code,
          countryCode: row.country_code,
          tenderCount: tenderCount.count ?? 0,
          openTenderCount: openCount.count ?? 0,
          awardCount: awardCount.count ?? 0,
          isDemo: row.is_demo,
        };
      }),
    );

    const total = count ?? 0;
    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findAuthorityById(id: string): Promise<AuthorityDetail | null> {
    const { data, error } = await this.client
      .from('contracting_authorities')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Auftraggeber konnte nicht geladen werden: ${error.message}`);
    }

    const row = asRow<AuthorityRow>(data);
    if (row === null) return null;

    const [tenders, awards] = await Promise.all([
      this.client
        .from('tenders')
        .select(LIST_COLUMNS)
        .eq('contracting_authority_id', id)
        .order('publication_date', { ascending: false, nullsFirst: false })
        .limit(100),
      this.client
        .from('awards')
        .select('*, tenders ( title )')
        .eq('contracting_authority_id', id)
        .order('award_date', { ascending: false, nullsFirst: false })
        .limit(100),
    ]);

    return {
      authority: toAuthority(row),
      tenders: asRows<TenderRow>(tenders.data).map(toTenderListItem),
      awards: asRows<AwardRow>(awards.data).map(toAward),
    };
  }

  async listAwards(page: number, pageSize: number): Promise<PaginatedResult<Award>> {
    const offset = (page - 1) * pageSize;
    const { data, error, count } = await this.client
      .from('awards')
      .select('*, tenders ( title )', { count: 'exact' })
      .order('award_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error !== null) {
      throw new Error(`Zuschläge konnten nicht geladen werden: ${error.message}`);
    }

    const total = count ?? 0;
    return {
      items: asRows<AwardRow>(data).map(toAward),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listDocuments(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<DocumentListItem>> {
    const offset = (page - 1) * pageSize;
    const { data, error, count } = await this.client
      .from('tender_documents')
      .select('*, tenders ( title )', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error !== null) {
      throw new Error(`Dokumente konnten nicht geladen werden: ${error.message}`);
    }

    interface DocumentJoinRow extends DocumentRow {
      tenders?: { title: string } | null;
    }

    const total = count ?? 0;
    return {
      items: asRows<DocumentJoinRow>(data).map((row) => ({
        id: row.id,
        tenderId: row.tender_id,
        tenderTitle: row.tenders?.title ?? '',
        title: row.title,
        fileType: row.file_type,
        fileSizeBytes: row.file_size_bytes,
        downloadStatus: row.download_status,
        isDemo: row.is_demo,
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listAwardsForTender(tenderId: string): Promise<Award[]> {
    const { data, error } = await this.client
      .from('awards')
      .select('*, tenders ( title )')
      .eq('tender_id', tenderId);

    if (error !== null) return [];
    return asRows<AwardRow>(data).map(toAward);
  }

  async listFilterFacets(): Promise<FilterFacets> {
    const [sources, authorities, cities] = await Promise.all([
      this.client.from('sources').select('key, name, is_demo').order('name'),
      this.client
        .from('contracting_authorities')
        .select('id, name')
        .order('name')
        .limit(500),
      this.client.from('tenders').select('city').not('city', 'is', null).limit(1000),
    ]);

    const cityValues = [
      ...new Set(
        asRows<{ city: string | null }>(cities.data)
          .map((row) => row.city)
          .filter((city): city is string => city !== null),
      ),
    ].sort((a, b) => a.localeCompare(b, 'de'));

    return {
      sources: asRows<{ key: string; name: string; is_demo: boolean }>(
        sources.data,
      ).map((row) => ({ key: row.key, name: row.name, isDemo: row.is_demo })),
      authorities: asRows<{ id: string; name: string }>(authorities.data),
      cities: cityValues,
    };
  }

  async listSourceHealth(): Promise<SourceHealth[]> {
    const sources = await this.listSources();

    return Promise.all(
      sources.map(async (source): Promise<SourceHealth> => {
        const [lastRun, tenderCount, rawImportCount] = await Promise.all([
          this.client
            .from('connector_runs')
            .select('*, sources ( key )')
            .eq('source_id', source.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          this.client
            .from('tenders')
            .select('id', { count: 'exact', head: true })
            .eq('source_id', source.id),
          this.client
            .from('raw_imports')
            .select('id', { count: 'exact', head: true })
            .eq('source_id', source.id),
        ]);

        const runRow = asRow<ConnectorRunRow>(lastRun.data);

        return {
          source,
          lastRun: runRow === null ? null : toConnectorRun(runRow),
          tenderCount: tenderCount.count ?? 0,
          rawImportCount: rawImportCount.count ?? 0,
        };
      }),
    );
  }

  async listSources(): Promise<Source[]> {
    const { data, error } = await this.client.from('sources').select('*').order('name');
    if (error !== null) {
      throw new Error(`Datenquellen konnten nicht geladen werden: ${error.message}`);
    }
    return asRows<SourceRow>(data).map(toSource);
  }

  async listConnectorRuns(limit: number): Promise<ConnectorRun[]> {
    const { data, error } = await this.client
      .from('connector_runs')
      .select('*, sources ( key )')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error !== null) return [];
    return asRows<ConnectorRunRow>(data).map(toConnectorRun);
  }

  /**
   * True only when demo tenders exist *and* no real ones do.
   *
   * An empty table is not a demo dataset — it is an empty table. Answering
   * "yes" there would make the dashboard announce synthetic data that nobody
   * ever loaded (CLAUDE.md § 4: no claim without evidence).
   */
  async isDemoOnly(): Promise<boolean> {
    const [real, demo] = await Promise.all([
      this.client.from('tenders').select('id', { count: 'exact', head: true }).eq('is_demo', false),
      this.client.from('tenders').select('id', { count: 'exact', head: true }).eq('is_demo', true),
    ]);

    if (real.error !== null || demo.error !== null) return false;
    return (real.count ?? 0) === 0 && (demo.count ?? 0) > 0;
  }
}
