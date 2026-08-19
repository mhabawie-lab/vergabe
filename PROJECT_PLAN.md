# SicherVergabe — Projektplan

> Status: **Planungsphase**. Es wurde noch kein Anwendungscode implementiert.
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
