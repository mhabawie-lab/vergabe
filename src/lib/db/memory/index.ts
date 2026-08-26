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
  createEmptyDocumentTables,
  MemoryDocumentStore,
  type DocumentTables,
} from './document-store';
import {
  createEmptyPartnerTables,
  MemoryPartnerStore,
  type PartnerTables,
} from './partner-store';
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
  partnerTables: PartnerTables;
  documentTables: DocumentTables;
  ingestionStore: MemoryIngestionStore;
  tenderRepository: MemoryTenderRepository;
  referenceStore: MemoryReferenceStore;
  partnerStore: MemoryPartnerStore;
  documentStore: MemoryDocumentStore;
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

  // Partner data starts empty for the same reason: it names real third-party
  // companies, so there is no demo seed for it.
  const partnerTables = createEmptyPartnerTables();

  // Documents never get a demo seed either: they are third-party paperwork.
  const documentTables = createEmptyDocumentTables();

  return {
    tables,
    referenceTables,
    ingestionStore: new MemoryIngestionStore(tables),
    tenderRepository: new MemoryTenderRepository(tables),
    referenceStore: new MemoryReferenceStore(referenceTables),
    partnerTables,
    partnerStore: new MemoryPartnerStore(partnerTables),
    documentTables,
    documentStore: new MemoryDocumentStore(documentTables, {
      // The owner has to exist in this organisation before a document may
      // hang off it — the same rule the database enforces with a foreign key.
      exists(organizationId, ownerType, ownerId) {
        switch (ownerType) {
          case 'partner_company':
            return partnerTables.companies.some(
              (company) => company.id === ownerId && company.organizationId === organizationId,
            );
          case 'reference_project':
            return referenceTables.projects.some(
              (project) => project.id === ownerId && project.organizationId === organizationId,
            );
          case 'business_client':
            return referenceTables.clients.some(
              (client) => client.id === ownerId && client.organizationId === organizationId,
            );
          case 'organization':
            return organizationId === ownerId;
        }
      },
    }),
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

export function getMemoryPartnerStore(): MemoryPartnerStore {
  return getRegistry().partnerStore;
}

export function getMemoryDocumentStore(): MemoryDocumentStore {
  return getRegistry().documentStore;
}
