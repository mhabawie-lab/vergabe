import { Badge, type BadgeTone } from '@/components/ui/badge';
import { VERDICT_LABELS, type Verdict } from '@/modules/signals/types';

const TONES: Readonly<Record<Verdict, BadgeTone>> = {
  KAUFEN: 'up',
  BEOBACHTEN: 'caution',
  MEIDEN: 'down',
};

export function VerdictLabel({ verdict }: { verdict: Verdict }) {
  return <Badge tone={TONES[verdict]}>{VERDICT_LABELS[verdict]}</Badge>;
}
