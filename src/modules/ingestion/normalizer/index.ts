/**
 * Normalizer registry.
 *
 * Resolves the mapper for a source key. A source without a registered mapper
 * can still import raw data — normalization simply fails and is recorded,
 * which keeps a mapping gap visible instead of silent.
 */

import { NormalizationError } from '@/lib/errors';
import { demoMapper } from './mappers/demo';
import { tedEformsMapper } from './mappers/ted-eforms';
import type { MapperContext, TenderDraft, TenderMapper } from './types';

const MAPPERS: readonly TenderMapper[] = [
  demoMapper,
  tedEformsMapper,
  // Weitere Quellen: bundPortalMapper, laenderMapper, …
];

const MAPPER_BY_SOURCE_KEY = new Map<string, TenderMapper>(
  MAPPERS.map((mapper) => [mapper.sourceKey, mapper]),
);

export function getMapper(sourceKey: string): TenderMapper | undefined {
  return MAPPER_BY_SOURCE_KEY.get(sourceKey);
}

export function listMappers(): readonly TenderMapper[] {
  return MAPPERS;
}

/**
 * Maps one raw payload into a draft.
 *
 * @throws NormalizationError when no mapper is registered or the payload
 *         cannot be interpreted.
 */
export function normalize(
  sourceKey: string,
  rawImportId: string,
  payload: Record<string, unknown>,
  context: MapperContext,
): TenderDraft {
  const mapper = MAPPER_BY_SOURCE_KEY.get(sourceKey);
  if (mapper === undefined) {
    throw new NormalizationError(
      rawImportId,
      `Für die Quelle "${sourceKey}" ist kein Mapper registriert.`,
    );
  }

  try {
    return mapper.map(payload, context);
  } catch (error) {
    throw new NormalizationError(
      rawImportId,
      `Normalisierung fehlgeschlagen: ${
        error instanceof Error ? error.message : 'Unbekannter Fehler'
      }`,
      error,
    );
  }
}

export type { MapperContext, TenderDraft, TenderMapper } from './types';
