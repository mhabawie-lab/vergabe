/**
 * Storage adapter selection.
 *
 * One decision point for the whole application. Everything above this file —
 * pages, route handlers, the ingestion pipeline — depends only on the port
 * interfaces and is unaffected by the choice.
 *
 * The rule that governs it: **Supabase never falls back to memory.** If the
 * backend is Supabase and something is missing or broken, the request fails
 * with the reason. A fallback would present an empty application as a working
 * one, and would accept customer data into a store that evaporates on
 * restart. `resolveBackend()` decides once, from configuration, and errors
 * rather than guessing.
 *
 * Server-only.
 */

import 'server-only';

import { EnvironmentError, resolveBackend, type BackendDecision } from '@/lib/env';
import { logger } from '@/lib/logging';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureDemoDataLoaded,
  getMemoryDocumentStore,
  getMemoryPartnerStore,
  getMemoryReferenceStore,
  getMemoryTenderRepository,
} from './memory';
import { SupabaseDocumentStore } from './supabase/document-store';
import { SupabasePartnerStore } from './supabase/partner-store';
import { SupabaseReferenceStore } from './supabase/reference-store';
import { SupabaseTenderRepository } from './supabase/tender-repository';
import type { TenderRepository } from './ports';
import type { DocumentStore } from './document-ports';
import type { PartnerStore } from './partner-ports';
import type { ReferenceStore } from './reference-ports';

let backendLogged = false;

/**
 * The active backend, resolved once per process.
 *
 * Memoised so the (possibly throwing) resolution runs once and the log line
 * appears once, rather than on every request.
 */
let decision: BackendDecision | null = null;

export function getBackendDecision(): BackendDecision {
  decision ??= resolveBackend();

  if (!backendLogged) {
    backendLogged = true;
    if (decision.backend === 'memory') {
      logger.warn(
        'Datenbackend: flüchtiger Speicher. Daten gehen beim Neustart verloren.',
        { scope: 'db', reason: decision.reason, explicit: decision.explicit },
      );
    } else {
      logger.info('Datenbackend: Supabase', {
        scope: 'db',
        reason: decision.reason,
        explicit: decision.explicit,
      });
    }
  }

  return decision;
}

/** True when the app runs against the in-process store. */
export function isUsingDemoStore(): boolean {
  try {
    return getBackendDecision().backend === 'memory';
  } catch {
    // A misconfiguration is not "demo mode". Callers that only want a banner
    // should not be the ones to surface the error; the data call will.
    return false;
  }
}

/** The reason the current backend was chosen. For the infrastructure page. */
export function describeBackend(): { backend: string; reason: string; explicit: boolean } {
  try {
    const current = getBackendDecision();
    return {
      backend: current.backend,
      reason: current.reason,
      explicit: current.explicit,
    };
  } catch (error) {
    return {
      backend: 'nicht auflösbar',
      reason: error instanceof EnvironmentError ? error.message : 'Unbekannter Fehler',
      explicit: false,
    };
  }
}

/**
 * Read repository for the current request.
 *
 * In memory mode the pipeline is run once before the first read, so the UI is
 * always served from normalised records rather than from fixtures directly.
 */
export async function getTenderRepository(): Promise<TenderRepository> {
  if (getBackendDecision().backend === 'supabase') {
    const client = await createServerSupabaseClient();
    return new SupabaseTenderRepository(client);
  }

  await ensureDemoDataLoaded();
  return getMemoryTenderRepository();
}

/** Store for customer and reference data. */
export async function getReferenceStore(): Promise<ReferenceStore> {
  if (getBackendDecision().backend === 'supabase') {
    const client = await createServerSupabaseClient();
    return new SupabaseReferenceStore(client);
  }

  return getMemoryReferenceStore();
}

/** Store for the Subunternehmer-Radar. */
export async function getPartnerStore(): Promise<PartnerStore> {
  if (getBackendDecision().backend === 'supabase') {
    const client = await createServerSupabaseClient();
    return new SupabasePartnerStore(client);
  }

  return getMemoryPartnerStore();
}

/**
 * Store for private documents.
 *
 * The same single decision point. In memory mode the store says so through
 * `capabilities()`, and the UI repeats it wherever an upload is offered —
 * nobody should believe a certificate is safely filed when it is not.
 */
export async function getDocumentStore(): Promise<DocumentStore> {
  if (getBackendDecision().backend === 'supabase') {
    const client = await createServerSupabaseClient();
    return new SupabaseDocumentStore(client);
  }

  return getMemoryDocumentStore();
}

export { getIngestionStore } from './ingestion';

export type {
  DocumentStore,
  DocumentStoreCapabilities,
  StoredDocument,
} from './document-ports';

export type {
  PartnerCompanyDetail,
  PartnerFacets,
  PartnerMetrics,
  PartnerStore,
} from './partner-ports';

export type {
  ClientDetail,
  ReferenceFacets,
  ReferenceMetrics,
  ReferenceStore,
} from './reference-ports';

export type {
  AuthorityDetail,
  AuthorityListItem,
  DashboardMetrics,
  FilterFacets,
  IngestionStore,
  PaginatedResult,
  TenderRepository,
} from './ports';
