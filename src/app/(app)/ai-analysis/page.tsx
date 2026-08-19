import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { requirePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'KI-Analyse' };

const PIPELINE_STAGES = [
  {
    title: '1 · Dokumentenbeschaffung',
    body: 'Vergabeunterlagen und Anlagen werden automatisch heruntergeladen und im Dokumentenspeicher abgelegt.',
    phase: 3,
  },
  {
    title: '2 · Textextraktion',
    body: 'Nativer PDF-Text wird ausgelesen, gescannte Dokumente durchlaufen eine OCR-Erkennung.',
    phase: 3,
  },
  {
    title: '3 · Strukturierung',
    body: 'Abschnitte wie Eignungskriterien, Personalanforderungen, Fristen und Anlagenverzeichnis werden erkannt.',
    phase: 3,
  },
  {
    title: '4 · Inhaltliche Analyse',
    body: 'Zusammenfassung, Risikohinweise und die Extraktion strukturierter Anforderungen aus dem Volltext.',
    phase: 3,
  },
  {
    title: '5 · Nachweisabgleich',
    body: 'Geforderte Nachweise werden gegen Zertifikate, Referenzen und Qualifikationen des Unternehmensprofils geprüft; fehlende Nachweise werden benannt.',
    phase: 3,
  },
  {
    title: '6 · Match Engine',
    body: 'Regelbasierte Kriterien und KI-Signale ergeben den endgültigen Score sowie die Empfehlung GO, PRÜFEN oder NO-GO.',
    phase: 3,
  },
] as const;

export default async function AiAnalysisPage() {
  await requirePermission('tenders:read');

  return (
    <div className="space-y-5">
      <PageHeader
        title="KI-Analyse"
        description="Inhaltliche Auswertung von Ausschreibungen und Vergabeunterlagen."
        actions={
          <LinkButton href="/tenders" size="sm">
            Zu den Ausschreibungen
          </LinkButton>
        }
      />

      <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
        <p className="text-sm font-semibold text-warning">
          Kein KI-Dienst angebunden
        </p>
        <p className="mt-1 text-xs text-warning">
          In Phase 1 ist bewusst kein externer KI-Anbieter konfiguriert. Die
          Anwendung zeigt ausschließlich Daten, die aus der jeweiligen Quelle
          stammen. Der auf den Detailseiten sichtbare Match Score ist vorläufig
          und rein regelbasiert.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Geplante Analysekette"
          description="Jede Stufe ist einzeln wiederholbar, ohne die vorherige erneut auszuführen"
        />
        <CardBody>
          <ol className="space-y-3">
            {PIPELINE_STAGES.map((stage) => (
              <li
                key={stage.title}
                className="rounded-lg border border-border-subtle p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {stage.title}
                  </span>
                  <span className="rounded-md bg-info-subtle px-1.5 py-0.5 text-[11px] font-medium text-info ring-1 ring-inset ring-info/20">
                    Ab Phase {stage.phase}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {stage.body}
                </p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Nachvollziehbarkeit"
          description="Verbindliche Regeln für den späteren Betrieb"
        />
        <CardBody>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Jede KI-Antwort wird mit Modellversion, Prompt-Version und Rohantwort
              gespeichert, damit Ergebnisse reproduzierbar bleiben.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              KI-Ergebnisse werden in der Oberfläche als solche gekennzeichnet und
              nie als verbindliche Rechtsauskunft dargestellt.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Match Score und GO / PRÜFEN / NO-GO liefern stets eine
              nachvollziehbare Begründung mit.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Der Zugriff erfolgt ausschließlich über einen austauschbaren
              Provider-Layer — nie direkt aus dem Oberflächencode.
            </li>
          </ul>

          <PhasePlaceholder phase={3} title="Konfiguration">
            Der API-Schlüssel wird ausschließlich über die Umgebungsvariable
            <code className="tabular"> ANTHROPIC_API_KEY </code> bereitgestellt und
            serverseitig verwendet. Schlüssel gehören niemals in den Quellcode.
          </PhasePlaceholder>
        </CardBody>
      </Card>
    </div>
  );
}
