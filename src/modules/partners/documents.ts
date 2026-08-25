/**
 * Where partner documents live, and how they are reached.
 *
 * Two rules, both of which the code enforces rather than merely documents:
 *
 *   * The bucket is **private**. A document is a third party's certificate,
 *     insurance policy or register extract; a public URL for one of those is
 *     a data breach waiting to be indexed.
 *   * Access happens through a short-lived signed URL, created server-side.
 *     The service role never reaches the browser.
 *
 * In this phase no bucket is provisioned. The application therefore records
 * metadata and reserves a path, and says so plainly instead of implying that
 * a file is safely filed away. `docs/subcontractor-radar.md` lists what has
 * to be set up against a real Supabase project.
 */

/** Private bucket. Must be created with public access disabled. */
export const PARTNER_DOCUMENT_BUCKET = 'partner-documents';

/** How long a download link stays valid. Short on purpose. */
export const SIGNED_URL_TTL_SECONDS = 120;

/** Strips anything that could escape the intended folder. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'dokument';
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'dokument'
  );
}

/**
 * Path inside the private bucket.
 *
 * Organisation first, so a bucket policy can be written per tenant, and the
 * timestamp keeps two uploads of the same file name apart.
 */
export function buildStoragePath(input: {
  organizationId: string;
  partnerCompanyId: string;
  fileName: string;
}): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${input.organizationId}/${input.partnerCompanyId}/${stamp}-${sanitizeFileName(input.fileName)}`;
}

/** True for anything that would expose the file without a signed URL. */
export function isPublicUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
