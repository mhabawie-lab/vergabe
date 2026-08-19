'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';

/**
 * Error boundary for the application shell.
 *
 * Shows a generic message and the digest only. Stack traces and internals
 * stay on the server (CLAUDE.md § Fehlerbehandlung & Logging).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the cause; this records the client-side view.
    console.error('Unerwarteter Fehler in der Anwendung', error.digest ?? '');
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="space-y-4 text-center">
        <div>
          <h1 className="text-base font-semibold text-text-primary">
            Es ist ein Fehler aufgetreten
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Die Ansicht konnte nicht geladen werden. Bitte versuchen Sie es
            erneut. Bleibt der Fehler bestehen, wenden Sie sich an die
            Administration.
          </p>
        </div>

        {error.digest !== undefined && (
          <p className="tabular text-[11px] text-text-muted">
            Fehlerkennung: {error.digest}
          </p>
        )}

        <Button variant="primary" onClick={reset}>
          Erneut versuchen
        </Button>
      </CardBody>
    </Card>
  );
}
