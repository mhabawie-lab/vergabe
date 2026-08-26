# Dokumente hochladen und verwalten

Bedienungsseite zum technischen Teil in `docs/private-storage.md`.

---

## 1. Wo Dokumente auftauchen

| Ort | Eigentümer | Bucket |
| --- | --- | --- |
| Referenzprojekt → Reiter „Dokumente" | Referenzprojekt | `reference-documents` |
| Partnerfirma → Reiter „Dokumente" | Partnerfirma | `partner-documents` |
| Unternehmensprofil (`/company`) | eigene Organisation | `organization-documents` |

Dokumente am **Kunden** (`business_client`) unterstützen Datenmodell und API
bereits; eine eigene Oberfläche dafür gibt es noch nicht — Kundenunterlagen
hängen bis dahin am Referenzprojekt.

Alle Ansichten verwenden dieselbe Komponente
(`src/components/documents/document-panel.tsx`). Es gibt keine zweite Variante
mit abweichendem Verhalten.

---

## 2. Hochladen

1. Datei wählen. Erlaubt sind PDF, DOCX, XLSX, CSV, PNG und JPEG bis 25 MB.
2. Optional Art des Nachweises, Gültigkeitsdatum und Notiz angeben.
3. Hochladen.

Eine abgelehnte Datei nennt den Grund: zu groß, Typ nicht erlaubt, oder
Endung und Typ passen nicht zusammen.

Der angezeigte Dateiname bleibt der Name, den die Datei mitgebracht hat. Der
interne Ablagename ist ein anderer — das ist kein Umbenennen, sondern eine
zweite, technische Adresse.

---

## 3. Herunterladen

Ein Klick auf „Herunterladen" fordert einen Link an, der **fünf Minuten** gilt
und danach ins Leere läuft. Der Link ist personengebunden erzeugt und sollte
nicht weitergegeben werden; nach Ablauf hilft nur ein erneuter Klick.

Wer ein Dokument sehen darf, hängt am Eigentümer:

* Partnerdokumente: nur mit `subcontractors:documents`. Ein Betrachter sieht,
  **dass** ein Nachweis existiert und wann er abläuft — nicht die Datei.
* Kunden- und Referenzunterlagen: mit `references:read`.
* Eigene Unternehmensnachweise: mit `company:read`.

---

## 4. Archivieren statt löschen

„Archivieren" nimmt ein Dokument aus der Arbeitsansicht, behält es aber. Das
ist der vorgesehene Weg, wenn ein Nachweis veraltet ist.

„Löschen" entfernt die Datei endgültig und ist an eine eigene Berechtigung
gebunden. Es wird ausdrücklich bestätigt und protokolliert.

---

## 5. Was die Anwendung über eine Datei nicht sagt

Neben jedem Dokument steht der Prüfstatus. Er lautet derzeit immer
**„Malware-Scan nicht verfügbar"**, weil kein Scanner angebunden ist. Behandeln
Sie hochgeladene Dateien entsprechend — die Anwendung behauptet nichts über
ihre Unbedenklichkeit.

Ebenso: ein Ablaufdatum wird nie geschätzt. Fehlt es, steht dort „unbekannt",
und der Nachweis gilt nicht als erfüllt (`CLAUDE.md` § 11).

---

## 6. Im lokalen DEMO-Modus

Ohne Supabase (`DATA_BACKEND=memory`) liegen hochgeladene Dateien **nur im
Arbeitsspeicher des Prozesses** und sind nach einem Neustart weg. Die
Oberfläche sagt das. Downloads laufen dann über eine lokale Route, die bei
aktivem Supabase-Backend mit 404 antwortet.
