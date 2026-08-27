# TED-/eForms-Connector

TED (*Tenders Electronic Daily*) ist das Amtsblatt der EU für Vergaben. Es
veröffentlicht jede europaweite Bekanntmachung oberhalb der Schwellenwerte im
**eForms**-Format. Dieser Connector ist die erste **Live-Quelle** von
SicherVergabe — alles, was er liefert, sind echte Ausschreibungen.

---

## 1. Einordnung in die Pipeline

```
TED-API  →  Connector  →  raw_imports  →  Mapper  →  tenders / … →  UI
```

Der Connector spricht ausschließlich HTTP. Er benennt kein Feld um, wandelt
kein Datum und interpretiert keinen Wert — das gesamte Mapping liegt im
Normalizer. Damit lässt sich der Mapper jederzeit korrigieren und über die
gespeicherten Rohdaten erneut laufen lassen, ohne TED erneut abzufragen.

| Bestandteil | Datei |
|---|---|
| Connector | `src/modules/connectors/sources/ted-eforms/index.ts` |
| HTTP-Client (Retry, Rate-Limit) | `.../ted-eforms/client.ts` |
| Konfiguration (Zod-Schema) | `.../ted-eforms/config.ts` |
| Abfragebau | `.../ted-eforms/query.ts` |
| Angeforderte eForms-Felder | `.../ted-eforms/fields.ts` |
| Mapper | `src/modules/ingestion/normalizer/mappers/ted-eforms.ts` |
| Registrierung der Quelle | `supabase/migrations/0017_register_ted_eforms_source.sql` |

---

## 2. Zugang

Die TED-Such-API ist **öffentlich**. Es wird kein Schlüssel, kein Token und
kein Konto benötigt, und der Connector liest folglich keine
Umgebungsvariable. Sollte TED das je ändern, gehört der Schlüssel in eine
Environment Variable — niemals in `sources.config`, denn diese Spalte ist
ausdrücklich nicht für Geheimnisse gedacht.

| | |
|---|---|
| Endpunkt | `POST https://api.ted.europa.eu/v3/notices/search` |
| Paginierung | `paginationMode: "ITERATION"` mit `iterationNextToken` |
| Seitengröße | maximal 100 Bekanntmachungen je Anfrage |

---

## 3. Konfiguration

Der Suchbereich steht in `sources.config` und wird **über die Datenbank**
geändert, nicht über ein Deployment. Jeder Schlüssel ist optional; die
Standardwerte stehen in `config.ts`.

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `cpvCodes` | Startbranchen | CPV-Suchbereich. Ein `*` am Ende ist der TED-Platzhalter: `797*` umfasst den ganzen CPV-Zweig. Eine leere Liste wird abgelehnt. |
| `countries` | `["DEU"]` | Erfüllungsort, ISO 3166-1 alpha-3. Leer bedeutet: alle Länder. |
| `noticeTypes` | `[]` | Optionale Einschränkung auf Bekanntmachungstypen, z. B. `["cn-standard"]`. |
| `lookbackDays` | `14` | Größe des Veröffentlichungsfensters je Lauf. |
| `pageSize` | `100` | Bekanntmachungen je HTTP-Anfrage. |
| `maxNoticesPerRun` | `5000` | Obergrenze je Lauf, damit ein erweiterter Suchbereich nicht davonläuft. |
| `requestTimeoutMs` | `30000` | Zeitlimit je Anfrage. |
| `maxRetries` | `3` | Wiederholungen zusätzlich zum ersten Versuch. |
| `minRequestIntervalMs` | `1000` | Mindestabstand zwischen zwei Anfragen (Rate-Limit). |

Beispiel — Suchbereich auf Bewachung in Bayern und Österreich ändern:

```sql
update public.sources
   set config = config || jsonb_build_object(
         'cpvCodes',  jsonb_build_array('79713000', '79714000'),
         'countries', jsonb_build_array('DEU', 'AUT')
       )
 where key = 'ted-eforms';
```

Quelle vorübergehend abschalten — ohne Deployment, ohne Code-Änderung:

```sql
update public.sources set is_active = false where key = 'ted-eforms';
```

Jeder Wert wird beim Lauf gegen ein Zod-Schema geprüft. Ein CPV-Eintrag, der
kein CPV-Code ist, lässt den Lauf mit einer Fehlermeldung scheitern, statt
still eine andere Abfrage auszuführen — die Werte werden in die TED-Abfrage
eingesetzt und dürfen deshalb nicht ungeprüft durchgereicht werden.

---

## 4. Betrieb

```bash
npm run ingest:ted        # nur TED
npx tsx scripts/run-ingestion.ts   # alle aktiven Quellen
```

Oder über den Import-Endpunkt (Bearer-Token `INGESTION_TRIGGER_SECRET`):

```bash
curl -X POST https://<host>/api/v1/internal/ingestion/run \
     -H "Authorization: Bearer $INGESTION_TRIGGER_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"sourceKey":"ted-eforms"}'
```

Jeder Lauf wird in `connector_runs` protokolliert (gefunden, importiert,
übersprungen, fehlgeschlagen) und ist unter **Datenquellen** sichtbar.

**Wiederholte Läufe sind idempotent.** Eine unverändert erneut gelieferte
Bekanntmachung hat denselben Payload-Hash und wird übersprungen, nicht erneut
importiert. Deshalb darf `lookbackDays` gefahrlos größer sein als der
Abstand zwischen zwei Läufen — das ist sogar erwünscht, weil TED Korrekturen
unter einer neuen Veröffentlichungsnummer nachreicht.

### Fehlerverhalten

| Lage | Verhalten |
|---|---|
| TED antwortet mit 429, 5xx oder gar nicht | Wiederholung mit exponentiellem Backoff (1 s, 2 s, 4 s …, gedeckelt) |
| TED lehnt die Abfrage ab (4xx) | Sofortiger Abbruch mit TED-Fehlertext — eine abgelehnte Abfrage wird bei jedem Versuch erneut abgelehnt |
| Eine einzelne Bekanntmachung lässt sich nicht abbilden | Nur dieser Datensatz scheitert; der Rohimport bleibt erhalten und der Fehler steht in `normalization_runs` |
| Bekanntmachung ohne `publication-number` | Übersprungen mit Warnung — ohne Quell-ID gibt es keine Herkunft |
| Die Quelle fällt komplett aus | Andere Connectors und die Oberfläche laufen weiter |

---

## 5. Was der Mapper aus eForms macht

eForms liefert kein Ausschreibungsobjekt, sondern *Business Terms*: parallele
Arrays (ein Eintrag je Los) und mehrsprachige Wörterbücher. Der Mapper ist die
einzige Stelle, die diese Konventionen kennt.

| Internes Feld | Herkunft |
|---|---|
| `externalId` | `publication-number`, z. B. `479730-2026` |
| `title` | `title-proc` (Wortlaut des Auftraggebers), ersatzweise `notice-title` |
| `status` | `awarded` bei Zuschlagsbekanntmachungen, `amended` ab Versionsnummer `-02`, sonst `published` |
| `procedureType` | `procedure-type` (`neg-w-call` → Verhandlungsverfahren usw.) |
| `procurementType` | `contract-nature-main-proc`, sonst häufigster Loswert |
| `sectors` | aus den CPV-Codes über die CPV-Hierarchie (`src/config/sectors.ts`) |
| `countryCode` | alpha-3 → alpha-2 (`DEU` → `DE`) |
| `regionCode` | aus dem NUTS-Code über NUTS-1 (`DE40E` → `DE4` → `BB`) |
| `submissionDeadline` | früheste `deadline-receipt-tender-*` über alle Lose |
| `documents` | die TED-Renditionen (PDF, eForms-XML) |
| `originalLanguage` | ISO 639-2/B → ISO 639-1 (`deu` → `de`), weil die Spalte `char(2)` ist |
| `award.externalId` | die Veröffentlichungsnummer — TED kennt keine Zuschlags-ID, und die Bieterkennung wäre nicht eindeutig |
| `sourceUrl` | Vergabeportal des Auftraggebers (`submission-url-lot`), ersatzweise die TED-Seite |

### Wo bewusst nichts eingetragen wird

Der Mapper folgt der Regel „im Zweifel leer" — eine erfundene Frist oder ein
erfundener Zuschlagswert ist schädlicher als eine fehlende Angabe, weil ein
Angebot danach geplant wird.

- **Zuschlagswert und Bietername.** TED veröffentlicht Gewinner, Orte und Werte
  als getrennte Arrays, die sich nicht verlässlich einander zuordnen lassen —
  eine Bekanntmachung mit drei vergebenen Losen und zwei verschiedenen
  Gewinnern nennt drei Namen und zwei Orte. Abgebildet wird nur der erste
  Gewinner; Wert, Ort und Bieterzahl bleiben leer, sobald sie mehrdeutig sind.
  Die vollständige Liste steht in `sourceExtras` und im Rohimport.
- **Frist ohne Uhrzeit.** Ein reines Datum wird als Tagesbeginn in der
  Zeitzone der Bekanntmachung übernommen, nicht auf „23:59" aufgefüllt.
- **„Wert nicht offengelegt".** TED trägt dafür `-1` ein — bei rund jeder
  zwanzigsten Zuschlagsbekanntmachung. Negative Beträge werden verworfen;
  wörtlich genommen wäre das ein Auftrag über minus einen Euro.
- **Kein `closed` aus der Uhr.** Eine abgelaufene Frist ändert den Status
  nicht: Der Payload ändert sich danach nicht mehr, der Datensatz würde
  übersprungen und der abgeleitete Status bliebe für immer stehen.
- **Bundesland des Auftraggebers.** TED nennt es nicht, und eine Postleitzahl
  ist kein Bundesland.
- **Eignungskriterien.** Sie stehen nicht in der Suchantwort. Eine leere Liste
  ist ehrlich; eine erfundene würde als Nachweis gelesen.
- **Los-CPV-Codes.** TED meldet CPV je Bekanntmachung, nicht je Los. Nur bei
  einem einzigen Los werden sie übernommen.

### Nichts geht verloren

Terms ohne Platz im gemeinsamen Modell stehen in `tenders.source_extras`
(`tedNoticeType`, `tedFormType`, `tedWinners`, `tedTenderValues`,
`tedRequestDeadline`, …). Der vollständige, unveränderte Payload liegt
ohnehin in `raw_imports`.

---

## 6. Live- und DEMO-Daten

Die TED-Quelle ist mit `is_demo = false` registriert. Ein Datenbank-Trigger
aus Migration `0006` erzwingt, dass Datensätze einer Demo-Quelle immer als
DEMO gekennzeichnet sind; umgekehrt trägt hier nichts ein DEMO-Badge. Beide
Bestände bleiben in jeder Abfrage und in der Oberfläche trennbar.

Im Entwicklungsmodus (`DATA_BACKEND=memory`) ist die Quelle ebenfalls
registriert, wird aber **nicht** beim ersten Seitenaufruf ausgeführt: Ein
Seitenaufruf darf keine tausenden echten Bekanntmachungen aus dem Netz holen.
Ein Lauf wird dort ausdrücklich über `npm run ingest:ted` gestartet.

---

## 7. Feldliste erweitern

`fields.ts` bestimmt, welche eForms-Terms angefragt und damit in
`raw_imports.payload` gespeichert werden. Ein zusätzliches Feld ändert den
Payload und damit seinen Hash — der nächste Lauf importiert deshalb einmalig
alle Bekanntmachungen erneut. Das ist beabsichtigt: Der Rohdatensatz soll
festhalten, was die Quelle zu diesem Zeitpunkt geliefert hat.

Ein unbekannter Feldname führt zu HTTP 400; TED nennt in der Antwort die
zulässigen Werte.
