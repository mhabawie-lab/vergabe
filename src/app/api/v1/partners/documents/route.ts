import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore, isUsingDemoStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { PARTNER_DOCUMENT_BUCKET, buildStoragePath } from '@/modules/partners/documents';
import { documentSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/documents
 *
 * Registers a credential document.
 *
 * What this does today is record *metadata* and reserve a path inside a
 * private bucket. It does not upload file content, and it does not claim to:
 * no storage bucket is provisioned in this phase, and pretending otherwise
 * would leave somebody believing a certificate is filed when it is not.
 * `docs/subcontractor-radar.md` states what remains to be done against a real
 * Supabase project.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:documents');

    const body: unknown = await request.json();
    const parsed = documentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const storagePath = buildStoragePath({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      fileName: input.fileName,
    });

    const saved = await store.saveDocument({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      partnerQualificationId: input.partnerQualificationId ?? null,
      credentialType: input.credentialType,
      storagePath,
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      fileSize: input.fileSize ?? null,
      checksum: null,
      confidentiality: 'confidential',
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      note: input.note ?? null,
      uploadedBy: session.profile.id,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.documentUploaded,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      // File name and contents stay out of the log.
      metadata: {
        credentialType: saved.credentialType,
        hasExpiryDate: saved.validUntil !== null,
        bucket: PARTNER_DOCUMENT_BUCKET,
      },
    });

    return apiSuccess(
      {
        saved: true,
        record: saved,
        contentStored: false,
        note: isUsingDemoStore()
          ? 'Es ist kein Speicher konfiguriert. Es wurden ausschließlich Metadaten erfasst, keine Datei abgelegt.'
          : 'Es wurden Metadaten erfasst. Der Dateiinhalt wird in dieser Phase noch nicht hochgeladen.',
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, 'api:partners:documents');
  }
}
