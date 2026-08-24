import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { classifyReferenceProject } from '@/modules/references/classification';
import { findDuplicates } from '@/modules/references/dedupe';
import {
  createKnownValues,
  validateRow,
} from '@/modules/references/validation';
import {
  REFERENCE_INVOICE_STATUSES,
  REFERENCE_PROJECT_STATUSES,
} from '@/types/reference';

export const dynamic = 'force-dynamic';

const nullableText = z.string().trim().min(1).nullable().optional();

const requestSchema = z.object({
  clientName: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  externalObjectNumber: nullableText,
  objectType: nullableText,
  city: z.string().trim().min(1),
  region: nullableText,
  postalCode: nullableText,
  country: nullableText,
  startDate: nullableText,
  endDate: nullableText,
  shiftSummary: nullableText,
  invoiceStatus: z.enum(REFERENCE_INVOICE_STATUSES),
  projectStatus: z.enum(REFERENCE_PROJECT_STATUSES),
  description: nullableText,
});

/**
 * POST /api/v1/references/manual
 *
 * Creates a single reference project by hand. Runs the same validation and
 * duplicate check as the file import, so manual entry is held to the same
 * standard.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('references:write');

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Bitte prüfen Sie die Pflichtfelder.', {
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const input = parsed.data;
    const store = await getReferenceStore();

    const { normalized, messages } = validateRow(
      {
        clientName: input.clientName,
        projectName: input.projectName,
        externalObjectNumber: input.externalObjectNumber ?? undefined,
        objectType: input.objectType ?? undefined,
        city: input.city,
        region: input.region ?? undefined,
        postalCode: input.postalCode ?? undefined,
        country: input.country ?? undefined,
        startDate: input.startDate ?? undefined,
        endDate: input.endDate ?? undefined,
        shiftSummary: input.shiftSummary ?? undefined,
      },
      createKnownValues(),
    );

    const existing = await store.listDuplicateCandidates(session.organization.id);
    const duplicates = findDuplicates(normalized, existing);

    const blocking = [...messages, ...duplicates.map((finding) => finding.message)].filter(
      (message) => message.severity === 'error',
    );

    if (blocking.length > 0) {
      throw new ValidationError(blocking.map((message) => message.message).join(' '));
    }

    const { client } = await store.ensureClient(
      session.organization.id,
      input.clientName,
      normalized.country,
    );

    const proposals = classifyReferenceProject({
      projectName: input.projectName,
      objectType: normalized.objectType,
    });

    const project = await store.createProject({
      organizationId: session.organization.id,
      businessClientId: client.id,
      externalObjectNumber: normalized.externalObjectNumber,
      projectName: input.projectName,
      objectType: normalized.objectType,
      country: normalized.country,
      region: normalized.region,
      city: normalized.city,
      postalCode: normalized.postalCode,
      address: null,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      shiftSummaryRaw: normalized.shiftSummaryRaw,
      shiftValues: normalized.shiftValues,
      invoiceStatus: input.invoiceStatus,
      projectStatus: input.projectStatus,
      description: input.description ?? null,
      sourceImportId: null,
      services: proposals.map((proposal) => ({
        serviceCategory: proposal.serviceCategory,
        serviceLabel: null,
        classificationSource: proposal.classificationSource,
        classificationConfidence: proposal.classificationConfidence,
        // A manually entered project still needs its service confirmed —
        // typing a name is not the same as asserting the service.
        confirmedByUser: false,
        notes: proposal.reason,
      })),
    });

    return apiSuccess(
      {
        id: project.id,
        // Non-blocking findings are handed back so the UI can show them.
        warnings: messages.filter((message) => message.severity !== 'error'),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, 'api:references:manual');
  }
}
