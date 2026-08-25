'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import {
  SIGNAL_ACTIONS,
  SIGNAL_ACTION_LABELS,
  type SignalAction,
} from '@/modules/partners/signals';
import type { SignalStatus } from '@/types/partner';

/**
 * Decisions on one signal.
 *
 * The wording is deliberate: these move an *observation* along — reviewed,
 * relevant, contacted, discarded. None of them turns the observation into an
 * established fact, and none of them changes the company's stored
 * relationship direction.
 */
export function SignalActions({
  signalId,
  status,
}: {
  signalId: string;
  status: SignalStatus;
}) {
  const router = useRouter();
  const [action, setAction] = useState<SignalAction>('mark_reviewed');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/partners/signals/${signalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Entscheidung konnte nicht gespeichert werden.')
            : 'Die Entscheidung konnte nicht gespeichert werden.';
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError('Die Entscheidung konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-[13rem] flex-col gap-1.5">
      <Select
        aria-label={`Entscheidung für Signal, aktuell ${status}`}
        value={action}
        onChange={(event) => setAction(event.target.value as SignalAction)}
        options={SIGNAL_ACTIONS.map((entry) => ({
          value: entry,
          label: SIGNAL_ACTION_LABELS[entry],
        }))}
        className="h-8 text-xs"
      />
      <Button size="sm" disabled={pending} onClick={() => void apply()}>
        {pending ? 'Wird gespeichert …' : 'Übernehmen'}
      </Button>
      {error !== null && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
