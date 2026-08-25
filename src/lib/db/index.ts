/**
 * Storage adapter selection.
 *
 * One decision point: with Supabase configured the app talks to Postgres,
 * without it to the in-process demo store. Everything above this file — pages,
 * route handlers, the ingestion pipeline — depends only on the port
 * interfaces and is unaffected by the choice.
 *
 * Server-only.
 */

import 'server-only';

import { hasSupabaseClientConfig } from '@/lib/env';
import { logger } from '@/lib/logging';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureDemoDataLoaded,
  getMemoryReferenceStore,
  getMemoryTenderRepository,
} from './memory';
import { SupabaseReferenceStore } from './supabase/reference-store';
import { SupabaseTenderRepository } from './supabase/tender-repository';
import type { TenderRepository } from './ports';
import type { ReferenceStore } from './reference-ports';

let demoModeLogged = false;

/**
 * Read repository for the current request.
 *
 * In demo mode the pipeline is run once before the first read, so the UI is
 * always served from normalised records rather than from fixtures directly.
 */
export async function getTenderRepository(): Promise<TenderRepository> {
  if (hasSupabaseClientConfig()) {
    const client = await createServerSupabaseClient();
    return new SupabaseTenderRepository(client);
  }

  if (!demoModeLogged) {
    demoModeLogged = true;
    logger.warn(
      'Supabase ist nicht konfiguriert — die Anwendung läuft im lokalen DEMO-Modus.',
      { scope: 'db' },
    );
  }

  await ensureDemoDataLoaded();
  return getMemoryTenderRepository();
}

/**
 * Store for customer and reference data.
 *
 * Without Supabase this is the in-process store, which is volatile: the UI
 * says so wherever real customer data could be entered, so nobody imports a
 * customer list into something that vanishes on restart.
 */
export async function getReferenceStore(): Promise<ReferenceStore> {
  if (hasSupabaseClientConfig()) {
    const client = await createServerSupabaseClient();
    return new SupabaseReferenceStore(client);
  }

  return getMemoryReferenceStore();
}

/** True when the app runs against the in-process demo store. */
export function isUsingDemoStore(): boolean {
  return !hasSupabaseClientConfig();
}

export { getIngestionStore } from './ingestion';

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
