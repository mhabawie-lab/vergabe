/**
 * Infrastructure status, without ever revealing a secret.
 *
 * The rule that shapes every field here: this page exists to answer "is it
 * working?", not "what is it configured with". So it reports presence,
 * reachability and counts — never a key, never a full connection string,
 * never a URL carrying a token. A host name is included because an operator
 * needs to know *which* project they are looking at, and a host name is not
 * a credential.
 */

import 'server-only';

import { describeBackend, getDocumentStore } from '@/lib/db';
import { hasSupabaseServiceConfig, legacyEnvironmentWarnings, serverEnv } from '@/lib/env';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DOCUMENT_BUCKETS } from '@/modules/documents/storage';
import { toErrorMessage } from '@/lib/errors';

export type CheckState = 'ok' | 'warning' | 'failed' | 'skipped';

export interface InfrastructureCheck {
  label: string;
  state: CheckState;
  detail: string;
}

export interface InfrastructureStatus {
  backend: string;
  backendReason: string;
  backendExplicit: boolean;
  environment: 'production' | 'development';
  supabaseConfigured: boolean;
  /** Host only. Never the full URL with a path or token. */
  supabaseHost: string | null;
  projectRef: string | null;
  serviceKeyConfigured: boolean;
  signedUrlTtlSeconds: number;
  documentCapabilities: {
    storesFileContent: boolean;
    malwareScanning: boolean;
    note: string;
  };
  expectedBuckets: string[];
  checks: InfrastructureCheck[];
  deprecations: string[];
  checkedAt: string;
}

/** Host of the configured project, or null. Never the whole URL. */
function supabaseHost(): string | null {
  if (serverEnv.supabaseUrl === undefined) return null;
  try {
    return new URL(serverEnv.supabaseUrl).host;
  } catch {
    return null;
  }
}

/**
 * A project reference is not a secret — it appears in every request URL — but
 * it is still an identifier, so only the tail is shown: enough to tell two
 * projects apart without publishing the whole thing.
 */
function maskedProjectRef(): string | null {
  const ref = serverEnv.supabaseProjectRef;
  if (ref === undefined || ref.length < 4) return null;
  return `…${ref.slice(-4)}`;
}

export async function collectInfrastructureStatus(): Promise<InfrastructureStatus> {
  const backend = describeBackend();
  const checks: InfrastructureCheck[] = [];
  const documentStore = await getDocumentStore();
  const capabilities = documentStore.capabilities();

  const configured =
    serverEnv.supabaseUrl !== undefined && serverEnv.supabasePublishableKey !== undefined;

  if (backend.backend === 'memory') {
    checks.push({
      label: 'Datenbackend',
      state: 'warning',
      detail:
        'Flüchtiger Speicher. Daten gehen beim Neustart verloren; hier gehören ' +
        'keine echten Kunden-, Partner- oder Dokumentdaten hinein.',
    });
    for (const label of [
      'Datenbank erreichbar',
      'Auth erreichbar',
      'Storage erreichbar',
      'Erwartete Buckets',
      'Buckets privat',
    ]) {
      checks.push({ label, state: 'skipped', detail: 'Kein Supabase-Backend aktiv.' });
    }
  } else {
    checks.push({
      label: 'Datenbackend',
      state: 'ok',
      detail: `Supabase (${backend.reason}).`,
    });

    // Each probe is a cheap, read-only call. A failure is reported as a
    // failure — the application must never present a broken backend as fine.
    try {
      const client = await createServerSupabaseClient();

      const database = await client.from('organizations').select('id').limit(1);
      checks.push(
        database.error === null
          ? {
              label: 'Datenbank erreichbar',
              state: 'ok',
              detail: 'Lesende Testabfrage erfolgreich.',
            }
          : {
              label: 'Datenbank erreichbar',
              state: 'failed',
              detail: `Testabfrage fehlgeschlagen: ${database.error.message}`,
            },
      );

      const auth = await client.auth.getUser();
      // No session in a server probe is normal; a transport error is not.
      const authHealthy = auth.error === null || auth.error.status === 401;
      checks.push({
        label: 'Auth erreichbar',
        state: authHealthy ? 'ok' : 'failed',
        detail: authHealthy
          ? 'Auth-Endpunkt antwortet.'
          : `Auth-Endpunkt meldet: ${auth.error?.message ?? 'unbekannter Fehler'}`,
      });

      // `storage.buckets` is itself under Row Level Security, and the
      // publishable key is not permitted to enumerate it — the call succeeds
      // and returns nothing. An empty list is therefore "cannot see", not
      // "does not exist": it may neither be reported as missing buckets nor
      // used to certify that none of them is public. A reassurance without
      // evidence is worse than an open question (CLAUDE.md § 12).
      const buckets = await client.storage.listBuckets();
      const visible = buckets.data ?? [];
      const expected = Object.values(DOCUMENT_BUCKETS);

      if (buckets.error !== null) {
        checks.push({
          label: 'Storage erreichbar',
          state: 'failed',
          detail: `Storage antwortet nicht: ${buckets.error.message}`,
        });
        for (const label of ['Erwartete Buckets', 'Buckets privat']) {
          checks.push({
            label,
            state: 'skipped',
            detail: 'Nicht prüfbar, solange Storage nicht antwortet.',
          });
        }
      } else if (visible.length === 0) {
        checks.push({
          label: 'Storage erreichbar',
          state: 'ok',
          detail: 'Storage-Endpunkt antwortet.',
        });
        for (const label of ['Erwartete Buckets', 'Buckets privat']) {
          checks.push({
            label,
            state: 'skipped',
            detail:
              'Mit dieser Sitzung sind keine Buckets auflistbar — storage.buckets ' +
              'unterliegt eigenen Richtlinien. Das ist kein Hinweis auf fehlende ' +
              'Buckets und kein Beleg dafür, dass keiner öffentlich ist. Bitte im ' +
              'Supabase-Dashboard unter Storage nachsehen.',
          });
        }
      } else {
        const names = new Set(visible.map((bucket) => bucket.name));
        const missing = expected.filter((name) => !names.has(name));
        const publicOnes = visible.filter((bucket) => bucket.public);

        checks.push({
          label: 'Storage erreichbar',
          state: 'ok',
          detail: 'Storage-Endpunkt antwortet.',
        });

        checks.push({
          label: 'Erwartete Buckets',
          state: missing.length === 0 ? 'ok' : 'warning',
          detail:
            missing.length === 0
              ? `Alle ${expected.length} erwarteten Buckets vorhanden.`
              : `Nicht sichtbar: ${missing.join(', ')}.`,
        });

        checks.push({
          label: 'Buckets privat',
          state: publicOnes.length === 0 ? 'ok' : 'failed',
          detail:
            publicOnes.length === 0
              ? `Kein öffentlicher Bucket unter den ${visible.length} sichtbaren.`
              : `Öffentlich und damit unzulässig: ${publicOnes
                  .map((bucket) => bucket.name)
                  .join(', ')}.`,
        });
      }
    } catch (error) {
      checks.push({
        label: 'Supabase-Verbindung',
        state: 'failed',
        detail: toErrorMessage(error),
      });
    }
  }

  checks.push({
    label: 'Malware-Scan',
    state: capabilities.malwareScanning ? 'ok' : 'warning',
    detail: capabilities.malwareScanning
      ? 'Scanner angebunden.'
      : 'Nicht verfügbar. Dokumente werden als nicht geprüft geführt, nie als sicher.',
  });

  checks.push({
    label: 'Privilegierter Schlüssel',
    state: hasSupabaseServiceConfig() ? 'ok' : 'warning',
    detail: hasSupabaseServiceConfig()
      ? 'Konfiguriert. Wird ausschließlich serverseitig für den Import verwendet.'
      : 'Nicht konfiguriert. Der Import-Endpunkt ist damit inaktiv.',
  });

  return {
    backend: backend.backend,
    backendReason: backend.reason,
    backendExplicit: backend.explicit,
    environment: serverEnv.isProduction ? 'production' : 'development',
    supabaseConfigured: configured,
    supabaseHost: supabaseHost(),
    projectRef: maskedProjectRef(),
    serviceKeyConfigured: hasSupabaseServiceConfig(),
    signedUrlTtlSeconds: serverEnv.signedUrlTtlSeconds,
    documentCapabilities: capabilities,
    expectedBuckets: Object.values(DOCUMENT_BUCKETS),
    checks,
    deprecations: legacyEnvironmentWarnings(),
    checkedAt: new Date().toISOString(),
  };
}
