/**
 * Builds the TED expert query for one connector run.
 *
 * The query is a search filter, not business logic: it decides which notices
 * are fetched, never what they mean. Every value it interpolates has been
 * validated by `tedConfigSchema` first, so no unchecked string from
 * `sources.config` reaches the query (CLAUDE.md § Sicherheit).
 */

import type { TedConfig } from './config';

function inClause(field: string, values: readonly string[]): string | null {
  if (values.length === 0) return null;
  return `${field} IN (${values.join(' ')})`;
}

/**
 * Assembles the expert query.
 *
 * `today(-n)` is TED's own relative-date function, so the window is evaluated
 * on their side and needs no clock agreement between us and the API.
 */
export function buildTedQuery(config: TedConfig): string {
  const clauses = [
    inClause('classification-cpv', config.cpvCodes),
    inClause('place-of-performance', config.countries),
    inClause('notice-type', config.noticeTypes),
    `publication-date >= today(-${config.lookbackDays})`,
  ].filter((clause): clause is string => clause !== null);

  return clauses.join(' AND ');
}
