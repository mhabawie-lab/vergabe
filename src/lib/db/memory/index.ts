/**
 * Local demo mode.
 *
 * When no Supabase credentials are configured, the app persists into this
 * in-process store instead of Postgres. It is a different *adapter*, not a
 * different architecture: the demo connector, the raw import stage and the
 * normalizer all run exactly as they would against a real database, and every
 * record produced carries `isDemo: true`.
 *
 * The store is pinned to `globalThis` rather than kept in module scope.
 * Next.js bundles each route separately, so a module-level singleton would be
 * instantiated once per route bundle — the tender list and the tender detail
 * page would then hold different records under different ids. One global
 * instance keeps every route on the same data.
 *
 * Server-only. State lives for the lifetime of the process.
 */

import { logger } from '@/lib/logging';
import { toErrorMessage } from '@/lib/errors';
import { ingestAllActiveSources } from '@/modules/ingestion/pipeline';
import { MemoryIngestionStore } from './ingestion-store';
import {
  createEmptyReferenceTables,
  MemoryReferenceStore,
  type ReferenceTables,
} from './reference-store';
import { MemoryTenderRepository } from './tender-repository';
import { createDemoSource, createEmptyTables, type MemoryTables } from './tables';

interface MemoryStoreRegistry {
  tables: MemoryTables;
  referenceTables: ReferenceTables;
  ingestionStore: MemoryIngestionStore;
  tenderRepository: MemoryTenderRepository;
  referenceStore: MemoryReferenceStore;
  /** Memoised so concurrent first requests trigger exactly one pipeline run. */
  bootstrap: Promise<void> | null;
}

const REGISTRY_KEY = Symbol.for('sichervergabe.memory-store');

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: MemoryStoreRegistry;
};

function createRegistry(): MemoryStoreRegistry {
  const tables = createEmptyTables();
  tables.sources.push(createDemoSource());

  // Reference data starts empty on purpose: it holds real customer records,
  // so there is no demo seed for it (phase-2 rule on data protection).
  const referenceTables = createEmptyReferenceTables();

  return {
    tables,
    referenceTables,
    ingestionStore: new MemoryIngestionStore(tables),
    tenderRepository: new MemoryTenderRepository(tables),
    referenceStore: new MemoryReferenceStore(referenceTables),
    bootstrap: null,
  };
}

function getRegistry(): MemoryStoreRegistry {
  const globalWithRegistry = globalThis as GlobalWithRegistry;
  globalWithRegistry[REGISTRY_KEY] ??= createRegistry();
  return globalWithRegistry[REGISTRY_KEY];
}

async function runDemoPipeline(registry: MemoryStoreRegistry): Promise<void> {
  logger.info('Demo-Modus: Ingestion-Pipeline wird initial ausgeführt', {
    scope: 'db:memory',
  });

  try {
    const reports = await ingestAllActiveSources(registry.ingestionStore);
    for (const report of reports) {
      logger.info('Demo-Ingestion abgeschlossen', {
        scope: 'db:memory',
        sourceKey: report.sourceKey,
        status: report.status,
        itemsImported: report.itemsImported,
        itemsFailed: report.itemsFailed,
      });
    }
  } catch (error) {
    // A failed bootstrap must not take the whole app down — the UI renders
    // an empty state and the error is visible in the logs.
    logger.error('Demo-Ingestion fehlgeschlagen', {
      scope: 'db:memory',
      error: toErrorMessage(error),
    });
  }
}

/** Runs the demo pipeline once per process, before the first read. */
export function ensureDemoDataLoaded(): Promise<void> {
  const registry = getRegistry();
  registry.bootstrap ??= runDemoPipeline(registry);
  return registry.bootstrap;
}

export function getMemoryIngestionStore(): MemoryIngestionStore {
  return getRegistry().ingestionStore;
}

export function getMemoryTenderRepository(): MemoryTenderRepository {
  return getRegistry().tenderRepository;
}

export function getMemoryReferenceStore(): MemoryReferenceStore {
  return getRegistry().referenceStore;
}
