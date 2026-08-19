import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { DemoBadge, DocumentStatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader, PhasePlaceholder } from '@/components/ui/page';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { formatFileSize, formatNumber } from '@/lib/utils/format';
import type { RawSearchParams } from '@/modules/tenders/query';

export const metadata: Metadata = { title: 'Dokumente' };

const PAGE_SIZE = 25;

const paramsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission('documents:read');

  const { page } = paramsSchema.parse(await searchParams);
  const repository = await getTenderRepository();
  const result = await repository.listDocuments(page, PAGE_SIZE);

  const pendingCount = result.items.filter(
    (document) => document.downloadStatus === 'pending',
  ).length;

  const buildHref = (target: number): string =>
    target > 1 ? `/documents?page=${target}` : '/documents';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dokumente"
        description="Alle von den Quellen gemeldeten Vergabeunterlagen und Anlagen mit ihrem Download-Status."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Dokument' : 'Dokumente'} erfasst
          </p>
          {pendingCount > 0 && (
            <p className="text-[11px] text-text-muted">
              {formatNumber(pendingCount)} auf dieser Seite noch nicht
              heruntergeladen
            </p>
          )}
        </div>

        <TableContainer>
          <Table className="min-w-[46rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Dokument</TableHeaderCell>
                <TableHeaderCell>Ausschreibung</TableHeaderCell>
                <TableHeaderCell>Format</TableHeaderCell>
                <TableHeaderCell align="right">Größe</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.length === 0 ? (
                <TableEmpty colSpan={5}>
                  Es sind noch keine Dokumente erfasst.
                </TableEmpty>
              ) : (
                result.items.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary">
                          {document.title}
                        </span>
                        {document.isDemo && <DemoBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <Link
                        href={`/tenders/${document.tenderId}`}
                        className="line-clamp-2 text-xs hover:text-accent hover:underline"
                      >
                        {document.tenderTitle || 'Ausschreibung öffnen'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs uppercase">
                      {document.fileType ?? '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {formatFileSize(document.fileSizeBytes)}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={document.downloadStatus} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {result.total > 0 && (
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            buildHref={buildHref}
          />
        )}
      </Card>

      <PhasePlaceholder phase={3} title="Automatischer Download und Textextraktion">
        Aktuell werden ausschließlich die von der Quelle gemeldeten Metadaten
        angezeigt; der Status „Ausstehend“ ist deshalb der Normalfall. Ab Phase 3
        lädt SicherVergabe die Unterlagen automatisch in den Dokumentenspeicher,
        extrahiert den Text (inklusive OCR für gescannte Dokumente) und stellt
        ihn der KI-Analyse zur Verfügung.
      </PhasePlaceholder>
    </div>
  );
}
