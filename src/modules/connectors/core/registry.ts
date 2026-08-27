/**
 * Connector registry.
 *
 * The single place where connector implementations are wired in. Whether a
 * registered connector actually runs is decided by `sources.is_active` in the
 * database — never by editing this file (CLAUDE.md § Connectors).
 */

import { demoConnector } from '../sources/demo';
import { tedEformsConnector } from '../sources/ted-eforms';
import type { TenderConnector } from './types';

const CONNECTORS: readonly TenderConnector[] = [
  demoConnector,
  tedEformsConnector,
  // Weitere Quellen: bundPortalConnector, laenderConnector, …
];

const CONNECTOR_BY_KEY = new Map<string, TenderConnector>(
  CONNECTORS.map((connector) => [connector.key, connector]),
);

export function getConnector(key: string): TenderConnector | undefined {
  return CONNECTOR_BY_KEY.get(key);
}

export function listConnectors(): readonly TenderConnector[] {
  return CONNECTORS;
}

/** True when a source key has a matching implementation compiled in. */
export function hasConnector(key: string): boolean {
  return CONNECTOR_BY_KEY.has(key);
}
