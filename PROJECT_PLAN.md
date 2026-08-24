# SicherVergabe — Projektplan

> Status: **Phase 2 abgeschlossen** (Stand: August 2026).
> Phase 1 lieferte Fundament, Kerndatenmodell, Ingestion-Pipeline mit
> DEMO-Quelle sowie Dashboard, Ausschreibungssuche und Detailansicht.
> Phase 2 ergänzt die mandantenfähige Verwaltung eigener Kunden, Baustellen
> und Referenzprojekte samt Datenimport. Der tatsächliche Umsetzungsstand ist
> in Kapitel 12 (Phase 1) und Kapitel 13 (Phase 2) dokumentiert.
>
> **Abweichend vom ursprünglichen Plan** behandelt Phase 2 nicht TED/eForms,
> sondern die eigenen Kunden- und Referenzdaten. Die Anbindung erster
> Live-Vergabequellen verschiebt sich entsprechend nach hinten.
>
> Dieses Dokument beschreibt Architektur, Datenmodell, Connector-Design,
> Auth/Rollen, API-Struktur, Import-/Normalisierungsprozess,
> Dokumentenverarbeitung/KI-Integration und die Entwicklungsphasen.

---

## 1. Ziel & Kontext

SicherVergabe ist eine intelligente Plattform für öffentliche und private
Ausschreibungen. Sie sammelt Ausschreibungen aus vielen unterschiedlichen
Quellen, vereinheitlicht sie in ein gemeinsames Datenmodell, reichert sie mit
KI-Analysen an und bewertet ihre Relevanz für das Nutzerunternehmen
(Match Score, GO/PRÜFEN/NO-GO).

**Startbranchen:**
Sicherheitsdienstleistungen, Rechenzentren/Data Center, Baustellenbewachung,
Objektschutz, Empfangs-/Pfortendienste, Flüchtlingsunterkünfte/Notunterkünfte,
Brandwache, Reinigung, Facility Management.

**Nicht verhandelbare Leitplanken** (siehe auch `CLAUDE.md`):

- Keine externe Quelle darf direkt mit der UI gekoppelt sein.
- Rohdaten bleiben unverändert erhalten (Auditierbarkeit, Reprocessing).
- Demo-/Testdaten sind immer eindeutig als DEMO gekennzeichnet, nie als Live-Daten.
- Keine Secrets im Code — ausschließlich Environment Variables.
- TypeScript strict, modulare Architektur, Migrationen für jede DB-Änderung.

---

## 2. Technologie-Stack

| Bereich            | Technologie                                              |
|--------------------|-----------------------------------------------------------|
| Framework          | Next.js (App Router), TypeScript (strict)                 |
| Styling            | Tailwind CSS                                               |
| Datenbank          | PostgreSQL via Supabase                                    |
| Auth               | Supabase Auth (E-Mail/Passwort, später SSO/OAuth optional) |
| Storage            | Supabase Storage (Vergabeunterlagen, Anlagen, Zertifikate) |
| Hintergrundjobs    | Scheduled Jobs / Queue (z. B. Supabase Edge Functions, Cron, oder externer Worker) |
| KI-Integration     | Austauschbarer AI-Provider-Layer (Anthropic Claude als Default) |
| Validierung        | Zod (Schemas für API, Normalizer, Forms) |
| Tests              | Vitest/Jest (Unit), Playwright (E2E) |
| Linting/Formatting | ESLint, Prettier |

---

## 3. Architektur — Datenfluss

Kernregel: **Keine Quelle darf direkt mit der UI gekoppelt sein.** Jede Stufe
kennt nur die Schnittstelle der vorherigen Stufe, nicht deren Implementierung.

```
SOURCE
  │  (externe Vergabeportale, APIs, Scraper, Dateiuploads)
  ▼
CONNECTOR
  │  (ein Modul pro Quelle; holt Rohdaten, kein Parsing/Business-Logik)
  ▼
RAW IMPORT
  │  (unverändertes Originaldokument/-payload + Metadaten wird persistiert)
  ▼
NORMALIZER
  │  (Mapping Rohformat → einheitliches internes Ausschreibungsschema)
  ▼
DATABASE
  │  (normalisierte, versionierte, deduplizierte Ausschreibungsdaten)
  ▼
DOCUMENT PROCESSING
  │  (Download, Textextraktion, OCR, Strukturierung von Anlagen/PDFs)
  ▼
AI ANALYSIS
  │  (Zusammenfassung, Anforderungsextraktion, Nachweis-Erkennung, Risiken)
  ▼
MATCH ENGINE
  │  (Score 0–100 % gegen Unternehmensprofil, GO/PRÜFEN/NO-GO)
  ▼
UI
     (Dashboard, Suche, Detailansicht, Favoriten, Fristen, …)
```

**Prinzipien:**

- Jede Stufe schreibt in eigene, klar abgegrenzte Tabellen/Storage-Pfade.
- Jede Stufe ist unabhängig neu ausführbar (Reprocessing), ohne vorherige
  Stufen erneut aufzurufen (z. B. Normalizer erneut laufen lassen, ohne neu
  zu importieren; KI-Analyse erneut laufen lassen, ohne neu zu normalisieren).
- Connectors werden zentral registriert, sind unabhängig aktivierbar/
  deaktivierbar und liefern Health-/Status-Informationen an einen
  Connector-Monitor.
- Die UI liest ausschließlich aus der normalisierten Datenbank (ggf. mit
  KI-Anreicherungen) — nie direkt aus RAW IMPORT oder von einer externen Quelle.

---

## 4. Ordnerstruktur (geplant)

```
sichervergabe/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # Öffentliche Seiten (Landing, Pricing…)
│   │   ├── (auth)/                   # Login, Registrierung, Passwort-Reset
│   │   ├── (dashboard)/              # Geschützter Bereich
│   │   │   ├── dashboard/
│   │   │   ├── tenders/              # Ausschreibungssuche & Detailansicht
│   │   │   │   └── [id]/
│   │   │   ├── authorities/          # Auftraggeber-Datenbank & Radar
│   │   │   ├── documents/            # Dokumentenverwaltung
│   │   │   ├── favorites/
│   │   │   ├── search-profiles/
│   │   │   ├── notifications/
│   │   │   ├── company/              # Unternehmensprofil, Referenzen,
│   │   │   │   ├── references/       # Zertifikate, Mitarbeiterqualifikationen
│   │   │   │   ├── certificates/
│   │   │   │   └── staff-qualifications/
│   │   │   ├── calculation/          # Kalkulation & Angebotsvorbereitung
│   │   │   └── admin/                # Adminbereich, Nutzer-/Rollenverwaltung
│   │   ├── api/                      # Route Handler (siehe Kap. 7)
│   │   └── layout.tsx / globals.css
│   │
│   ├── components/
│   │   ├── ui/                       # Reine, generische UI-Primitives
│   │   ├── tenders/
│   │   ├── documents/
│   │   ├── dashboard/
│   │   └── shared/
│   │
│   ├── modules/                      # Domänen-/Serverlogik, UI-unabhängig
│   │   ├── connectors/
│   │   │   ├── core/                 # Connector-Interface, Registry, Runner
│   │   │   ├── sources/
│   │   │   │   ├── ted-eforms/
│   │   │   │   ├── bund-portal/
│   │   │   │   ├── laender/
│   │   │   │   ├── kommunal/
│   │   │   │   └── demo/             # Demo-Connector (klar markierte Testdaten)
│   │   │   └── monitoring/           # Connector-Health, Run-Logs
│   │   │
│   │   ├── ingestion/
│   │   │   ├── raw-import/           # Persistenz von Rohdaten
│   │   │   └── normalizer/           # Mapping Rohformat → internes Schema
│   │   │       ├── mappers/          # ein Mapper pro Quellformat
│   │   │       └── dedupe/           # Dublettenerkennung
│   │   │
│   │   ├── documents/
│   │   │   ├── download/             # Automatischer Download von Unterlagen
│   │   │   ├── extraction/           # Text-/PDF-Extraktion, OCR
│   │   │   └── storage/
│   │   │
│   │   ├── ai/
│   │   │   ├── provider/             # Austauschbarer AI-Client (Anthropic etc.)
│   │   │   ├── analysis/             # Ausschreibungs-/PDF-Analyse
│   │   │   ├── requirements/         # Erkennung fehlender Nachweise
│   │   │   └── prompts/
│   │   │
│   │   ├── matching/
│   │   │   ├── score/                # Match-Score-Berechnung
│   │   │   └── rules/                # GO/PRÜFEN/NO-GO-Regeln
│   │   │
│   │   ├── company/                  # Unternehmensprofil-Domänenlogik
│   │   ├── deadlines/                # Fristenmanagement
│   │   └── notifications/
│   │
│   ├── lib/
│   │   ├── supabase/                 # Clients (server/browser), Typen
│   │   ├── db/                       # Query-Helper, Repositories
│   │   ├── auth/                     # Session-/Rollen-Helper
│   │   ├── logging/                  # Strukturiertes Logging
│   │   ├── errors/                   # Fehlerklassen, Error-Handling
│   │   └── validation/               # Zod-Schemas (geteilt)
│   │
│   ├── types/                        # Globale/geteilte TS-Typen
│   └── config/                       # Feature-Flags, Konstanten, CPV-Codes
│
├── supabase/
│   ├── migrations/                   # SQL-Migrationen (chronologisch)
│   └── seed/                         # Seed-/Demo-Daten (klar als DEMO markiert)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   └── architecture/                 # ADRs, Diagramme
│
├── CLAUDE.md
├── PROJECT_PLAN.md
└── .env.example
```

---

## 5. PostgreSQL-Datenmodell (Supabase)

Alle Tabellen mit Row Level Security (RLS). Multi-Tenant-fähig über
`organization_id`. Zeitstempel `created_at`/`updated_at` als Standard.

### 5.1 Quellen & Ingestion

- **`sources`** — Stammdaten je Datenquelle (Name, Typ, Land, Status
  aktiv/inaktiv, Konfiguration, `is_demo boolean`).
- **`connector_runs`** — Protokoll jedes Connector-Laufs
  (`source_id`, `status`, `started_at`, `finished_at`, `items_found`,
  `items_imported`, `error_message`).
- **`raw_imports`** — unveränderte Rohdaten
  (`source_id`, `connector_run_id`, `external_id`, `payload jsonb`,
  `payload_hash`, `fetched_at`, `is_demo boolean`). Payload wird **nie**
  verändert; erneute Normalisierung liest wieder von hier.
- **`normalization_runs`** — Protokoll der Normalisierungsläufe je
  `raw_import_id` (Erfolg/Fehler, Mapper-Version).

### 5.2 Ausschreibungen (normalisiert)

- **`tenders`** — zentrale, einheitliche Ausschreibungstabelle:
  - Identifikation: `id`, `source_id`, `external_id`, `raw_import_id`,
    `dedupe_group_id` (nullable, verweist auf zusammengehörige Dubletten)
  - Kerndaten: `title`, `description`, `procurement_type`,
    `contracting_authority_id`, `cpv_codes text[]`, `nuts_codes text[]`
  - Termine: `publication_date`, `submission_deadline`, `opening_date`
  - Wert: `estimated_value`, `currency`
  - Status: `status` (veröffentlicht/geändert/aufgehoben/vergeben),
    `is_demo boolean`
  - Herkunft: `source_url`, `original_language`
  - Suchoptimierung: `search_vector tsvector` (Volltextsuche), Indizes auf
    CPV-Codes, Fristen, Auftraggeber
- **`tender_versions`** — Änderungshistorie einzelner Ausschreibungen
  (jede Aktualisierung aus der Quelle erzeugt eine Version).
- **`tender_lots`** — Lose einer Ausschreibung (falls vorhanden).
- **`contracting_authorities`** — Auftraggeber-Datenbank
  (Name, Adresse, Typ, `dedupe_key`, Metadaten für Auftraggeber-Radar).
- **`awards`** — Zuschläge/Vergabehistorie
  (`tender_id`, Gewinner-Firma, Zuschlagswert, Datum, Quelle).
- **`award_winners`** — Normalisierte Unternehmensdaten der Gewinner
  (für „Gewinner früherer Ausschreibungen“-Auswertungen).

### 5.3 Dokumente

- **`documents`** — Vergabeunterlagen/Anlagen
  (`tender_id`, `source_url`, `storage_path`, `file_type`, `checksum`,
  `download_status`, `is_demo boolean`).
- **`document_extractions`** — extrahierter Text/Struktur je Dokument
  (`document_id`, `extracted_text`, `extraction_method` OCR/native,
  `page_count`, `status`).

### 5.4 KI-Analyse & Matching

- **`tender_ai_analyses`** — KI-Ergebnisse je Ausschreibung
  (Zusammenfassung, erkannte Anforderungen, Risiken, Modellversion,
  Prompt-Version, Konfidenz, Rohantwort als `jsonb` zu Audit-Zwecken).
- **`tender_requirements`** — strukturierte Anforderungen/Nachweise
  (Typ, Beschreibung, Pflicht/optional, `is_missing_for_org boolean`
  bezogen auf ein Unternehmensprofil).
- **`match_scores`** — Score je `tender_id` + `organization_id`
  (`score 0–100`, `recommendation` GO/PRÜFEN/NO-GO, `reasoning jsonb`,
  Berechnungszeitpunkt, Regel-/Modellversion).

### 5.5 Unternehmen & Nutzer

- **`organizations`** — Mandanten (Nutzerunternehmen).
- **`organization_members`** — Zuordnung Nutzer ↔ Organisation ↔ Rolle.
- **`roles`** / **`permissions`** — Rollen- und Rechtematrix (siehe Kap. 6).
- **`company_profiles`** — Unternehmensprofil (Branchen, Leistungsspektrum,
  Regionen, CPV-Schwerpunkte für Matching).
- **`company_references`** — Referenzprojekte.
- **`certificates`** — Zertifikate (Typ, Gültigkeit, Datei-Storage-Pfad).
- **`staff_qualifications`** — Mitarbeiterqualifikationen.

### 5.6 Nutzerinteraktion

- **`favorites`** — gemerkte Ausschreibungen je Nutzer/Organisation.
- **`search_profiles`** — gespeicherte Suchprofile (Filter als `jsonb`).
- **`notifications`** — generierte Benachrichtigungen
  (Typ, Bezug, gelesen/ungelesen).
- **`notification_preferences`** — Kanal-/Frequenzeinstellungen je Nutzer.
- **`deadlines`** — abgeleitete/eigene Fristen im Fristenmanagement
  (verknüpft mit `tenders`, mit Reminder-Konfiguration).
- **`calculations`** — Kalkulationsdaten je Ausschreibung/Angebot.
- **`audit_log`** — sicherheitsrelevante Aktionen (Login, Rollenänderung,
  Datenexport, Admin-Aktionen).

### 5.7 Dubletten

- **`tender_duplicate_candidates`** — Paare/Gruppen potenzieller Dubletten
  mit Ähnlichkeitsscore und Status (bestätigt/abgelehnt), Basis für
  `dedupe_group_id` in `tenders`.

Alle Tabellen mit `is_demo`-Flag werden in der UI mit einem eindeutigen
DEMO-Badge angezeigt und sind über Query-Parameter/RLS strikt von
Live-Daten trennbar (siehe `CLAUDE.md`).

---

## 6. Connector-Architektur

**Ziel:** Jeder Connector ist unabhängig entwickel-, aktivier-, deaktivier-
und überwachbar, ohne andere Connectors oder die UI zu beeinflussen.

### 6.1 Connector-Interface (konzeptionell)

```ts
interface TenderConnector {
  id: string;                 // eindeutiger Connector-Schlüssel
  sourceType: 'api' | 'scraper' | 'file-feed';
  isEnabled(): Promise<boolean>;
  fetchBatch(cursor?: string): Promise<RawFetchResult>; // liefert Rohdaten + neuen Cursor
  healthCheck(): Promise<ConnectorHealth>;
}
```

- Connectors kennen **nur** ihr Zielformat „Rohdaten + Metadaten“ — kein
  Wissen über das interne Ausschreibungsschema.
- Jeder Connector-Lauf wird in `connector_runs` protokolliert
  (Start, Ende, Anzahl, Fehler) → Basis für Monitoring-Dashboard im
  Adminbereich.
- Connectors werden über eine zentrale **Registry** registriert
  (`modules/connectors/core/registry.ts`), die zur Laufzeit anhand von
  `sources.is_active` entscheidet, welche Connectors ausgeführt werden.
- Fehler eines Connectors dürfen andere Connectors nicht blockieren
  (isolierte Ausführung, Try/Catch pro Connector, Retry mit Backoff).
- Neue Quelle hinzufügen = neues Modul unter `modules/connectors/sources/*`
  + Eintrag in `sources`-Tabelle + zugehöriger Normalizer-Mapper — **keine**
  Änderung an UI oder anderen Connectors nötig.

### 6.2 Rate-Limiting & Robustheit

- Konfigurierbare Request-Limits je Quelle.
- Exponentielles Backoff bei Fehlern/HTTP 429.
- Timeout- und Fehlerbehandlung pro Connector, mit strukturiertem Logging.

---

## 7. Authentifizierung & Rollen

**Auth:** Supabase Auth (E-Mail/Passwort zu Beginn, später OAuth/SSO
erweiterbar). Multi-Tenant über `organizations` +
`organization_members`.

### 7.1 Rollen (initial)

| Rolle              | Beschreibung |
|---------------------|--------------|
| `super_admin`       | Plattformweite Administration (alle Organisationen, Connector-Verwaltung, System-Einstellungen) |
| `org_admin`         | Verwaltung der eigenen Organisation (Nutzer, Rollen, Unternehmensprofil, Abo) |
| `bid_manager`       | Voller Zugriff auf Ausschreibungen, Kalkulation, Angebotsvorbereitung |
| `viewer`            | Lesender Zugriff auf Ausschreibungen/Dashboard |

- Rechte granular über `permissions`-Tabelle, Rollen als Zusammenstellung
  von Permissions (erweiterbar ohne Codeänderung).
- Durchsetzung auf zwei Ebenen: **Supabase RLS-Policies** (Datenzugriff)
  und **Server-seitige Autorisierungs-Checks** in API-Routen (Aktionen).
- `super_admin` ist die einzige Rolle mit organisationsübergreifendem
  Zugriff (Connector-Monitoring, Datenqualität, globale Einstellungen).

---

## 8. API-Struktur (Next.js Route Handler)

Alle Endpunkte unter `src/app/api/`, versioniert über Pfadpräfix
(`/api/v1/...`), Zod-validierte Ein-/Ausgaben, einheitliches
Fehlerformat.

```
/api/v1/tenders                  GET     Liste/Suche (Filter, Volltext, CPV)
/api/v1/tenders/[id]              GET     Detailansicht
/api/v1/tenders/[id]/documents     GET     Dokumente einer Ausschreibung
/api/v1/tenders/[id]/analysis      GET     KI-Analyse-Ergebnis
/api/v1/tenders/[id]/match-score   GET     Match Score für aktuelle Organisation

/api/v1/authorities               GET     Auftraggeber-Datenbank
/api/v1/authorities/[id]           GET     Auftraggeber-Detail + Vergabehistorie

/api/v1/favorites                 GET/POST/DELETE
/api/v1/search-profiles           GET/POST/PATCH/DELETE
/api/v1/notifications             GET/PATCH (als gelesen markieren)

/api/v1/company/profile           GET/PATCH
/api/v1/company/references        GET/POST/PATCH/DELETE
/api/v1/company/certificates      GET/POST/PATCH/DELETE
/api/v1/company/staff             GET/POST/PATCH/DELETE

/api/v1/calculations/[tenderId]   GET/POST/PATCH

/api/v1/admin/sources             GET/POST/PATCH   (Connector-Verwaltung)
/api/v1/admin/connector-runs      GET               (Monitoring)
/api/v1/admin/users               GET/POST/PATCH   (Nutzer-/Rollenverwaltung)

/api/v1/internal/ingestion/*      interne, durch Service-Rolle geschützte
                                   Endpunkte für Connector-/Normalizer-Trigger
                                   (nicht für Client-UI zugänglich)
```

- Öffentliche Client-UI-Endpunkte laufen ausschließlich gegen normalisierte
  Daten (`tenders`, `authorities`, …) — nie gegen `raw_imports`.
- Interne Ingestion-Trigger (`/api/v1/internal/...`) sind ausschließlich
  für Cron-/Service-Aufrufe mit Service-Role-Auth vorgesehen, nicht für
  Browser-Clients.

---

## 9. Import- & Normalisierungsprozess

1. **Scheduler/Cron** löst Connector-Lauf aus (je Quelle konfigurierbares
   Intervall).
2. **Connector** ruft Rohdaten ab (API/Scraping/Datei), kennt nur das
   Quellformat.
3. **Raw Import**: Rohpayload wird 1:1 mit `payload_hash` in `raw_imports`
   gespeichert (Duplikaterkennung auf Hash-Ebene verhindert redundante
   Neuverarbeitung unveränderter Datensätze).
4. **Normalizer** (quellenspezifischer Mapper) transformiert Rohdaten in
   das interne `tenders`-Schema; Ergebnis wird in `tenders` geschrieben
   bzw. als neue `tender_versions` bei Änderungen.
5. **Dedupe-Check**: heuristischer Abgleich (Titel-Ähnlichkeit,
   Auftraggeber, Termine, CPV, Wert) erzeugt Einträge in
   `tender_duplicate_candidates`; manuelle/automatische Bestätigung setzt
   `dedupe_group_id`.
6. **Dokumenten-Download** wird für neue/aktualisierte Ausschreibungen
   angestoßen (asynchron, entkoppelt vom Normalizer).
7. Jede Stufe schreibt Statusinformationen (`connector_runs`,
   `normalization_runs`) für Monitoring im Adminbereich.

Alle Schritte sind **idempotent** und einzeln erneut ausführbar.

---

## 10. Dokumentenverarbeitung & KI-Integration

### 10.1 Dokumentenverarbeitung

1. Automatischer Download der in der Ausschreibung verlinkten Unterlagen
   → Ablage in Supabase Storage, Metadaten in `documents`.
2. Textextraktion (native PDF-Text, bei Scans OCR) → `document_extractions`.
3. Strukturierung (Erkennung von Abschnitten wie Eignungskriterien,
   Fristen, Anlagen-Checkliste) als Vorbereitung für die KI-Analyse.

### 10.2 KI-Analyse

- Eigener, austauschbarer **AI-Provider-Layer** (`modules/ai/provider`),
  damit das Modell (z. B. Anthropic Claude) austauschbar bleibt und nie
  direkt aus UI-Code angesprochen wird.
- Analyseschritte:
  - Zusammenfassung der Ausschreibung.
  - Extraktion strukturierter Anforderungen (`tender_requirements`).
  - Abgleich mit Unternehmensprofil → Erkennung **fehlender Nachweise**.
  - Risikohinweise (unklare Anforderungen, kurze Fristen, ungewöhnliche
    Bedingungen).
- Jede KI-Antwort wird versioniert gespeichert (Modell, Prompt-Version,
  Rohantwort) für Nachvollziehbarkeit und Re-Analyse bei Prompt-Updates.

### 10.3 Match Engine

- Kombiniert regelbasierte Kriterien (Region, CPV-Code, Branchen,
  Auftragswert-Range, Zertifikatsanforderungen) mit KI-Signalen
  (erkannte Anforderungen vs. Unternehmensprofil).
- Ergebnis: `match_scores` mit Score 0–100 % und Empfehlung
  GO / PRÜFEN / NO-GO inklusive nachvollziehbarer Begründung
  (`reasoning jsonb`), damit Nutzer der Bewertung vertrauen können.

---

## 11. Entwicklungsphasen

### Phase 0 — Fundament (aktuell geplant)
Projektstruktur, Tooling (ESLint/Prettier/TS strict), Supabase-Setup,
Auth-Grundgerüst, Migrationssystem, CI-Grundgerüst, Basis-Layout.
**Kein Live-Datenimport.**

### Phase 1 — Kernmodell & Demo-Daten
- Datenbankmigrationen für Kern-Tabellen (`sources`, `raw_imports`,
  `tenders`, `contracting_authorities`, `organizations`, Rollen).
- Demo-Connector mit klar als DEMO markierten Testdaten (kein Scraping
  echter Quellen in dieser Phase).
- Normalizer-Grundgerüst mit einem Mapper (für Demo-Quelle).
- Dashboard, Ausschreibungssuche (Basisfilter), Detailansicht auf Basis
  der Demo-Daten.
- Auth/Rollen funktionsfähig (Login, Organisation, Basis-Rollen).

### Phase 2 — Erste echte Quelle & Volltextsuche
- Erster produktiver Connector (z. B. TED/EU eForms) inkl. Monitoring.
- Volltextsuche, erweiterte Filter, CPV-Suche.
- Fristenmanagement, Favoriten, Suchprofile, Benachrichtigungen (Basis).

### Phase 3 — Dokumente & KI-Analyse
- Automatischer Dokumenten-Download, Text-/OCR-Extraktion.
- KI-Analyse-Pipeline (Zusammenfassung, Anforderungsextraktion).
- Erkennung fehlender Nachweise, erste Match-Score-Berechnung.

### Phase 4 — Unternehmens- & Angebotsfunktionen
- Unternehmensprofil, Referenzen, Zertifikate, Mitarbeiterqualifikationen.
- Kalkulationsbereich, Angebotsvorbereitung.
- Verfeinerung GO/PRÜFEN/NO-GO-Logik mit echtem Unternehmensprofil.

### Phase 5 — Auftraggeber-Intelligenz & Historie
- Auftraggeber-Datenbank, Auftraggeber-Radar.
- Vergabehistorie, Zuschlagswerte, frühere Gewinner.
- Dublettenerkennung über mehrere Quellen hinweg.

### Phase 6 — Skalierung der Quellen & Admin
- Weitere Connectors (Bundesländer, kommunale Portale, weitere EU-Quellen).
- Adminbereich: Connector-Monitoring-Dashboard, Nutzer-/Rollenverwaltung,
  Systemeinstellungen.
- Performance-/Skalierungsarbeiten (Indizes, Caching, Queue-Ausbau).

> Jede Phase liefert ein lauffähiges, testbares Increment. Kein Phasenwechsel
> ohne Migrationen, Tests und Dokumentationsupdate.

---

## 12. Umsetzungsstand

> Dieses Kapitel dokumentiert, was tatsächlich implementiert ist. Die Kapitel
> 1–11 beschreiben den Zielzustand.

### 12.1 Phase 1 — abgeschlossen

**Fundament**

- Next.js 16 (App Router), React 19, TypeScript im Strict-Modus mit zusätzlich
  `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`.
- Tailwind CSS 4 mit semantischen Design-Tokens; Hell/Dunkel/System als
  Klassenumschaltung auf `<html>`, angewandt vor dem ersten Rendering.
- ESLint (eslint-config-next), Skripte `typecheck`, `lint`, `verify`.
- Strukturiertes JSON-Logging mit Kontext und Redaction von
  Credential-Feldern; typisierte Fehlerklassen mit einheitlichem API-Format.

**Datenbank** — sechs Migrationen, 17 Tabellen, RLS auf allen Tabellen

- Ingestion: `sources`, `connector_runs`, `raw_imports`, `normalization_runs`
- Ausschreibungen: `tenders`, `tender_lots`, `tender_requirements`,
  `tender_documents`, `contracting_authorities`, `awards`,
  `tender_duplicate_candidates`
- Mandanten: `organizations`, `profiles`, `organization_members`
- Arbeitsbereich: `company_profiles`, `favorites`, `search_profiles`,
  `watched_authorities`, `audit_log`

Auf Millionen Datensätze ausgelegt: GIN-Index auf der generierten
`tsvector`-Spalte (deutsche Konfiguration, Titel höher gewichtet), GIN-Indizes
auf `cpv_codes`, `sectors`, `nuts_codes`, Trigram-Index auf `title` für
Dublettenerkennung, Composite-Index in der Sortierreihenfolge der Trefferliste
sowie ein partieller Index auf offene Fristen, der unabhängig von der
Archivgröße klein bleibt. Eine spätere Umstellung auf Range-Partitionierung
nach `publication_date` ist in der Migration vermerkt.

**Pipeline** — vollständig, end-to-end nachweisbar

`Demo Source → Connector → Raw Import → Normalizer → Database → UI`

- Connector-Interface plus Registry; Aktivierung über `sources.is_active`,
  nicht über ein Deployment.
- DEMO-Connector mit 12 synthetischen Ausschreibungen über alle neun
  Startbranchen, mit Losen, Eignungs- und Personalanforderungen, Unterlagen
  und zwei Zuschlägen. Das Rohformat ist bewusst ein deutsches Portalformat
  (`DD.MM.YYYY`, `1.250.000,00 EUR`, deutsche Enum-Werte), sodass der Mapper
  echte Übersetzungsarbeit leistet.
- Rohdaten werden unverändert mit SHA-256-Hash persistiert; ein
  unveränderter Datensatz wird beim erneuten Lauf übersprungen
  (nachgewiesen: Lauf 1 = 12 importiert, Lauf 2 = 12 übersprungen).
- Fehler eines Datensatzes brechen den Lauf nicht ab; Fehler einer Quelle
  blockieren andere Quellen nicht. Jeder Lauf wird protokolliert.
- Dublettenerkennung über einen Inhalts-Fingerprint (Titel, Auftraggeber,
  Fristtag, Wert), quellenübergreifend ausgelegt.

**Speicher-Adapter**

Die Oberfläche kennt nur die Ports `TenderRepository` und `IngestionStore`.
Zwei Implementierungen: PostgreSQL über Supabase (Produktivpfad) und ein
prozessinterner Speicher für den lokalen DEMO-Modus. Der DEMO-Modus ist kein
Umgehen der Architektur — dieselbe Pipeline läuft, nur mit anderem
Persistenz-Adapter, und erzeugt ausschließlich `is_demo`-Datensätze.

**Authentifizierung und Rollen**

- Supabase Auth (E-Mail/Passwort), Session-Refresh in der Middleware,
  Routenschutz zusätzlich serverseitig über `requireSession()`.
- Mandantenfähig über `organizations` + `organization_members`.
- Vier Rollen (`super_admin`, `org_admin`, `bid_manager`, `viewer`) mit
  14 Berechtigungen; Durchsetzung doppelt — RLS-Richtlinien in der Datenbank
  und `requirePermission()` im Servercode.
- Ohne Supabase-Konfiguration greift eine fest verdrahtete Demo-Session, die
  in der Oberfläche als solche ausgewiesen wird.

**Oberfläche** — 20 Routen, alle erreichbar

Enterprise-Design mit fester Sidebar, Topbar, hoher Informationsdichte,
Status-Badges und responsivem Verhalten von 390 px bis 1600 px.

Die Sidebar führt die zwölf vereinbarten Einträge in vier Gruppen. Das
Dashboard zeigt die sechs Kennzahlen und darunter die Ausschreibungstabelle
mit der festgelegten Spaltenfolge: Match, Titel, Auftraggeber, Ort,
Auftragswert, Laufzeit, Frist, Status. Dieselbe Tabellenkomponente wird von
Suche, Fristen und Auftraggeber-Detail wiederverwendet, damit ein Datensatz
überall gleich gelesen wird.

**Datenintegrität**

Demo-Daten sind auf jeder Ebene gekennzeichnet: `is_demo` in der Datenbank,
ein Datenbank-Trigger, der Datensätze einer Demo-Quelle ohne dieses Flag
zurückweist, DEMO-Badges an jedem Datensatz in der Oberfläche, ein Hinweis in
der Sidebar und ein Banner auf dem Dashboard.

### 12.2 Seiten und Routen

| Route                  | Stand                                                        |
|------------------------|--------------------------------------------------------------|
| `/`                    | Weiterleitung auf `/dashboard`                               |
| `/login`               | Anmeldung (im DEMO-Modus mit Hinweis statt Formular)         |
| `/dashboard`           | Voll funktional: 6 Kennzahlen, Ausschreibungstabelle (8 Spalten), Fristen |
| `/tenders`             | Voll funktional: Volltextsuche, 13 Filter, Sortierung, Paginierung |
| `/tenders/[id]`        | Voll funktional: 8 Fachbereiche plus vorbereitete Platzhalter |
| `/matches`             | Funktional auf Basis der regelbasierten Vorbewertung          |
| `/deadlines`           | Voll funktional: Gruppierung nach Dringlichkeit               |
| `/authorities`         | Voll funktional: Suche, Kennzahlen, Paginierung               |
| `/authorities/[id]`    | Voll funktional: Ausschreibungen und Vergabehistorie          |
| `/awards`              | Voll funktional                                              |
| `/documents`           | Metadaten funktional; Download ab Phase 3                    |
| `/search-profiles`     | Vorbereitet; Speichern ab Phase 2                            |
| `/company`             | Stammdaten und Bewertungsprofil sichtbar; Pflege ab Phase 4  |
| `/ai-analysis`         | Dokumentiert die geplante Analysekette; kein KI-Dienst aktiv |
| `/sources`             | Voll funktional: Quellen, Läufe, Connector-Registry          |
| `/admin`               | Voll funktional: Rollen-/Rechtematrix, Organisation          |
| `/api/v1/tenders`      | Suche über die normalisierten Daten                          |
| `/api/v1/tenders/[id]` | Einzelne Ausschreibung                                       |
| `/api/v1/internal/ingestion/run` | Import-Trigger, Bearer-Token, Constant-Time-Vergleich |

### 12.3 Bewusst nicht umgesetzt

- **Keine Live-Vergabequelle.** TED / EU eForms und die deutschen Portale
  folgen in Phase 2.
- **Kein KI-Dienst.** `ANTHROPIC_API_KEY` bleibt ungenutzt. Der auf den
  Detailseiten sichtbare Match Score ist ausdrücklich vorläufig und
  regelbasiert (Branche, CPV, Region, Auftragswert) und als solcher
  gekennzeichnet.
- **Kein Dokumenten-Download.** Es werden nur die von der Quelle gemeldeten
  Metadaten angezeigt; der Status „Ausstehend“ ist deshalb der Normalfall.
- **Keine Schreibfunktionen im Arbeitsbereich.** Favoriten, Suchprofile,
  Unternehmensprofil und Kalkulation haben Tabellen und RLS, aber noch keine
  Formulare.

### 12.4 Bekannte offene Punkte

1. **Relevanzsortierung.** PostgREST kann nicht nach `ts_rank` sortieren; die
   Sortierung „Relevanz“ fällt im Supabase-Adapter auf Aktualität zurück. Eine
   RPC-Funktion löst das in Phase 2. Der In-Memory-Adapter sortiert bereits
   nach Trefferzahl.
2. **Mehrfachauswahl in Filtern.** Datenmodell, Query-Schema und beide Adapter
   unterstützen mehrere Werte je Filter (kommasepariert); die Oberfläche bietet
   vorerst Einfachauswahl.
3. **Auftraggeber-Kennzahlen.** Die Zählungen je Auftraggeber werden im
   Supabase-Adapter pro Zeile ermittelt. Ab einigen tausend Auftraggebern ist
   dafür eine materialisierte Sicht nötig.
4. **Top Matches.** Die Rangfolge wird in der Anwendung über ein Fenster von
   maximal 100 offenen Ausschreibungen gebildet, weil die regelbasierte
   Vorbewertung keine SQL-Entsprechung hat. Ab Phase 3 werden Scores je
   Organisation persistiert und indiziert sortiert.
5. **Ohne Unternehmensprofil sind viele Scores identisch.** Das ist korrekt —
   das neutrale Standardprofil trifft keine Annahmen. Aussagekräftig wird die
   Bewertung erst mit gepflegtem Profil (Phase 4).
6. **Keine automatisierten Tests im Repository.** Typecheck, Lint und Build
   sind als Skripte eingerichtet und laufen fehlerfrei; die Navigations- und
   Layoutprüfung erfolgte bislang manuell über einen Browser-Durchlauf.
   Unit- und E2E-Tests als Teil des Repositories folgen mit der ersten echten
   Quelle.
7. **DEMO-Modus ohne Persistenz.** Ohne Supabase liegt der Datenbestand im
   Prozessspeicher und geht beim Neustart verloren. Für die Entwicklung
   beabsichtigt.

### 12.5 Durchgeführte Prüfungen

Stand des letzten Durchlaufs:

| Prüfung                                   | Ergebnis |
|-------------------------------------------|----------|
| `npm install`                             | 382 Pakete, 0 Sicherheitslücken |
| `npm run typecheck` (`tsc --noEmit`)      | fehlerfrei |
| `npm run lint` (ESLint)                   | fehlerfrei, keine Warnungen |
| `npm run build` (Production Build)        | erfolgreich, 20 Routen |
| Erreichbarkeit aller Seiten               | 16 Seiten- und 2 Detailrouten liefern 200; unbekannte ID liefert 404 |
| Navigation (Klickpfad im Browser)         | alle 12 Sidebar-Einträge navigieren korrekt, aktiver Zustand stimmt |
| Drilldown Tabelle → Detail → zurück       | funktioniert |
| Filter-Rundlauf (Branche „Reinigung")     | 2 Treffer, Filter steht in der URL |
| Konsolenfehler / fehlende Ressourcen      | keine |
| Responsivität 390 / 834 / 1600 px, hell + dunkel | kein horizontaler Überlauf |
| DEMO-Kennzeichnung                        | jede Liste zeigt mindestens so viele DEMO-Badges wie Datensätze |
| Import-Endpunkt                           | ohne/falsches Token 401, korrektes Token 200, unbekannte Quelle 404 |
| Idempotenz des Imports                    | Lauf 1: 12 importiert · Lauf 2: 12 übersprungen |
| Secret-Scan über den getrackten Code      | keine hartkodierten Secrets; `.env*` außer `.env.example` ignoriert |
| `any` im Anwendungscode                   | nicht verwendet |

### 12.6 Empfohlene nächste Schritte (Phase 2)

1. Supabase-Projekt anlegen, Migrationen anwenden, erste echte Organisation
   und Nutzer einrichten.
2. TED-/EU-eForms-Connector als eigenes Modul ergänzen, zusammen mit einem
   Mapper — ohne Änderung an Oberfläche oder Datenmodell.
3. RPC-Funktion für die Volltext-Relevanzsortierung.
4. Suchprofile, Favoriten und Benachrichtigungen als Schreibfunktionen.
5. Scheduler für den regelmäßigen Import einrichten.

---

## 13. Umsetzungsstand Phase 2 — Kunden, Baustellen und Referenzen

### 13.1 Fachliche Trennung

Eigene Geschäftskunden und öffentliche Auftraggeber sind getrennte Domänen und
werden nie in einer Tabelle zusammengeführt:

| | `contracting_authorities` | `business_clients` |
|---|---|---|
| Wer | öffentliche Vergabestelle | eigener Geschäftskunde |
| Herkunft | aus Vergabeverfahren importiert | vom Nutzerunternehmen gepflegt |
| Sichtbarkeit | alle angemeldeten Nutzer | nur die eigene Organisation |
| Mandant | keiner | `organization_id` |

Analog: `awards` sind fremde Zuschläge, `reference_projects` eigene Projekte.

### 13.2 Neue Tabellen

Zwei Migrationen, fünf Tabellen, sieben Enums:

- `0007_business_clients.sql` — `business_clients`, `reference_projects`,
  `reference_project_services`, `reference_imports`, `reference_import_rows`
- `0008_reference_rls_audit.sql` — RLS-Richtlinien, Audit-Trigger,
  Demo-Schutz-Trigger

Alle Tabellen mit Foreign Keys, Unique Constraints, Indizes, Zeitstempeln,
Row Level Security und Mandantentrennung über `organization_id`.

Besonderheiten:

- `reference_projects.shift_summary_raw` hält den Originalwert (z. B.
  `218/146/0`); `shift_values` nur die technische Zerlegung. **Die Bedeutung
  der Zahlen ist nicht festgelegt** — weder Schema noch Code vergeben
  Bezeichnungen dafür.
- `reference_import_rows` speichert `raw_data` unverändert und
  `normalized_data` getrennt daneben.
- `reference_project_services.confirmed_by_user` trennt Vorschlag von Fakt.
- `reject_demo_reference_data()` verhindert Referenzdaten an einer
  Demo-Organisation.
- `log_reference_change()` schreibt jede Änderung ins `audit_log` — nur
  Metadaten, nie den Dateninhalt.

### 13.3 Importfunktion

`/imports/references`, zehnstufiger Ablauf: Datei → Spalten erkennen →
Zuordnung prüfen → Vorschau → Validierung → Hinweise → Dublettenprüfung →
Testlauf → ausdrückliche Bestätigung → Ergebnis.

Unterstützt: **CSV**, **XLSX**, **manuelle Einzelerfassung**.
PDF-Tabellenimport und OCR sind bewusst nicht enthalten.

Testlauf und echter Import laufen durch denselben Code — ein Testlauf zeigt
daher genau das, was der echte Import täte. Zeilen mit Fehlern werden nie
importiert, Zeilen mit Warnungen nur auf ausdrücklichen Wunsch.

Erkannte deutsche Spalten: Objekt-Nr., Objektname, Objektart, Ort, Kunde,
Schichten, Rechnung? — zusätzlich Region, Land, PLZ, Beginn, Ende,
Beschreibung. Abweichende Überschriften lassen sich manuell zuordnen.

### 13.4 Validierung

Erkannt werden: fehlender Kunde, fehlender Objektname, fehlender Ort,
ungültige Objekt-Nr., bereits vergebene Objekt-Nr. (in Datei und Datenbank),
abweichend geschriebene Kundennamen, abweichend geschriebene Orte, ungültiges
Schichtformat, unbekannter Rechnungsstatus, unlesbare Datumsangaben,
Projektende vor Projektbeginn und inhaltliche Dubletten.

Durchgängig gilt: Rohdaten werden nie überschrieben, Schreibfehler nur als
Vorschlag angezeigt, keine automatische Korrektur, unvollständige Ortsangaben
werden nicht ergänzt.

### 13.5 Vorsichtige Leistungserkennung

Ein Vorschlag entsteht nur bei einem eindeutigen Begriff im Objektnamen:
`Paramedic` → `paramedic`, `Security` → `security`, `Clean` → `cleaning`,
`Lager` → `warehouse`. Alles andere bleibt `unknown`.

`Datacenter` ist Objektart und erzeugt keinen Leistungsvorschlag.
`Bauhelfer` und `Sicherheitsdienst` werden nie automatisch zugewiesen.

Jeder Vorschlag trägt `classification_source = name_rule`, die ausgelöste
Regel-ID, einen Konfidenzwert und `confirmed_by_user = false`.

### 13.6 Neue Seiten und Routen

| Route | Stand |
|---|---|
| `/customers` | Kundenübersicht mit Suche, Status-, Orts- und Leistungsfilter, Sortierung, Paginierung, Dublettenhinweis |
| `/customers/[id]` | Stammdaten, Kennzahlen, Standorte, Leistungsarten, Referenzprojekte, Notizen |
| `/references` | Referenzübersicht mit acht Filtern und Volltextsuche |
| `/references/[id]` | Projektübersicht, Standort, Leistungsarten, Zeitraum, Original-Importwerte, Warnungen |
| `/imports/references` | Importdialog, manuelle Erfassung, Importprotokoll |
| `/api/v1/references/import/parse` | Datei lesen, Spalten vorschlagen, validieren — schreibt nichts |
| `/api/v1/references/import/run` | Testlauf oder bestätigter Import |
| `/api/v1/references/import/template` | Anonymisierte CSV-Vorlage |
| `/api/v1/references/manual` | Einzelnes Referenzprojekt anlegen |

Sidebar-Gruppe „Eigene Daten" mit Kunden, Referenzen und Datenimport.
Dashboard um vier Kennzahlen ergänzt (aktive Kunden, Referenzobjekte,
abgedeckte Standorte, bestätigte Leistungsarten) — nur sichtbar, sobald
Referenzdaten vorliegen, damit das bestehende Dashboard nicht überladen wird.

### 13.7 Vorbereitung Match-Engine

`buildSearchProfileSuggestions()` erzeugt Suchprofil-Vorschläge aus
**ausschließlich bestätigten** Leistungsarten, angereichert um Regionen,
Städte und die Zahl belegender Referenzen. Jeder Vorschlag trägt
`isProposal: true` und wird nicht als aktives Suchprofil gespeichert.

Eine Kategorie ohne eindeutige Entsprechung in der Branchentaxonomie erzeugt
keinen Vorschlag. Die eigentliche Match-Engine ist nicht Teil dieser Phase.

### 13.8 Automatisierte Tests

Erstmals im Projekt: **vitest**, 78 Tests in 5 Dateien.

| Datei | Umfang |
|---|---|
| `tests/csv-parsing.test.ts` | Trennzeichenerkennung, Anführungszeichen, BOM, CRLF, kurze Zeilen |
| `tests/xlsx-parsing.test.ts` | Echte Arbeitsmappen, Datums- und Zahlenzellen, leere Zellen |
| `tests/validation.test.ts` | Schichtformat, Spaltenzuordnung, alle Validierungsregeln |
| `tests/classification.test.ts` | Vorsichtige Leistungserkennung, keine Klassifikation unbekannter Namen |
| `tests/import-pipeline.test.ts` | Dublettenerkennung, Testlauf ohne Speichern, bestätigter Import, Mandantentrennung, Suchprofil-Vorschläge |

### 13.9 Supabase

Es liegen **keine Supabase-Zugangsdaten** vor. Es wurden keine erfunden.

Die Migrationen sind vollständig, die Anwendung läuft gegen den lokalen
Adapter. Für den Betrieb mit Supabase fehlen:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Danach: `supabase db push`. Zusätzliche Variablen benötigt Phase 2 nicht.

Der lokale Adapter ist flüchtig. Die Oberfläche weist auf `/customers` und im
Importdialog ausdrücklich darauf hin, dass dort keine echten Kundendaten
erfasst werden sollen.

### 13.10 Bekannte offene Punkte

1. **Leistungsbestätigung noch ohne Oberfläche.** Der Speicher-Port
   (`setServiceConfirmation`) und die Mandantenprüfung stehen und sind
   getestet; die Schaltfläche auf der Referenz-Detailseite fehlt noch. Bis
   dahin bleiben importierte Leistungsarten Vorschläge — Suchprofil-Vorschläge
   entstehen daher in der Praxis erst nach diesem Schritt.
2. **Kunden anlegen und bearbeiten nur über den Import.** `createClient` und
   `updateClient` sind implementiert, ein eigenes Formular auf `/customers`
   fehlt.
3. **Leistungsfilter im Supabase-Adapter wirken nur auf der geladenen Seite.**
   PostgREST kann „enthält eine dieser Kategorien" nicht zusammen mit den
   übrigen Filtern ausdrücken; sauber löst das eine RPC-Funktion. Der
   In-Memory-Adapter filtert bereits vollständig.
4. **Kundenliste lädt alle Projekte der Organisation** für die Aggregate. Ab
   einigen Tausend Projekten braucht es eine materialisierte Sicht.
5. **RLS ist nicht gegen eine echte Datenbank getestet.** Die
   Mandantentrennung ist im lokalen Adapter getestet; die Richtlinien selbst
   lassen sich erst mit Supabase-Zugang prüfen.
6. **PDF-Import und OCR fehlen** — bewusst außerhalb dieser Phase.
7. **Referenznachweise als Dokumente** folgen mit der Dokumentenverarbeitung.

### 13.11 Nächste sinnvolle Schritte

1. Supabase-Projekt anlegen, Migrationen anwenden, RLS gegen die echte
   Datenbank prüfen.
2. Bestätigen von Leistungsarten in der Oberfläche ergänzen — es ist der
   Schlüssel, damit Referenzen als Nachweis zählen.
3. Kundenformular für Anlage und Bearbeitung.
4. Bedeutung der Schichtzahlen klären und erst danach benennen.
5. Erst dann TED/eForms als erste Live-Quelle.
