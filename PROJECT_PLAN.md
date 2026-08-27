# SicherVergabe — Projektplan

> Status: **Phase 4 (Infrastruktur) abgeschlossen** (Stand: August 2026).
> Phase 1 lieferte Fundament, Kerndatenmodell, Ingestion-Pipeline mit
> DEMO-Quelle sowie Dashboard, Ausschreibungssuche und Detailansicht.
> Phase 2 ergänzt die mandantenfähige Verwaltung eigener Kunden, Baustellen
> und Referenzprojekte samt Datenimport. Der tatsächliche Umsetzungsstand ist
> in Kapitel 12 (Phase 1) und Kapitel 13 (Phase 2) dokumentiert.
>
> **Abweichend vom ursprünglichen Plan** behandelte Phase 2 nicht TED/eForms,
> sondern die eigenen Kunden- und Referenzdaten. Die Anbindung der ersten
> Live-Vergabequelle wurde entsprechend nachgezogen (Kapitel 17).
>
> **Phase 3A** ergänzt das **Subunternehmer-Radar** — ein rein internes,
> mandantenprivates Werkzeug. Ausdrücklich **keine** öffentliche Partnerbörse
> und kein Marktplatz. Kapitel 14 hält die Ausrichtung fest, Kapitel 15 den
> Umsetzungsstand.
>
> **Erste Live-Vergabequelle:** Der **TED-/EU-eForms-Connector** ist angebunden
> und liefert echte EU-weite Vergabebekanntmachungen. Kapitel 17 hält den Stand
> fest. Die deutschen Bundes-, Landes- und Kommunalportale folgen als weitere
> Connector-Module.
>
> **Phase 4** in der Umsetzung ist die **Infrastrukturphase**: Supabase-CLI als
> Projektabhängigkeit, ausdrückliche Backendwahl ohne stille Rückfälle,
> Onboarding der ersten Organisation, privater Dokumentenspeicher mit
> signierten Links, automatisierte RLS- und Storage-Prüfungen sowie CI.
> Kapitel 16 hält den Stand fest. Das ist **nicht** die „Phase 4" aus dem
> ursprünglichen Phasenplan in Kapitel 11 (Unternehmens- und
> Angebotsfunktionen); jene Inhalte bleiben offen.
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

Zusätzlich geplant, Phase noch nicht festgelegt: das **Subunternehmer-Radar**
(Kapitel 14) — ein internes, mandantenprivates Werkzeug zur Erfassung und
Prüfung möglicher Nachunternehmer. Keine öffentliche Partnerbörse.

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
| `/customers` | Kundenübersicht mit Suche, Status-, Orts- und Leistungsfilter, Sortierung, Paginierung, Dublettenhinweis, Schaltfläche „Kunde anlegen" |
| `/customers/new` | Kunde anlegen — Vergleichsform-Vorschau, Dublettenrückfrage, `clients:write` |
| `/customers/[id]` | Stammdaten, Kennzahlen, Standorte, Leistungsarten, Referenzprojekte, Notizen, Schaltfläche „Kunde bearbeiten" |
| `/customers/[id]/edit` | Kunde bearbeiten — fremde IDs gelten als „nicht gefunden" |
| `/references` | Referenzübersicht mit acht Filtern und Volltextsuche |
| `/references/[id]` | Projektübersicht, Standort, Leistungsarten, Zeitraum, Original-Importwerte, Warnungen |
| `/imports/references` | Importdialog, manuelle Erfassung, Importprotokoll |
| `/api/v1/references/import/parse` | Datei lesen, Spalten vorschlagen, validieren — schreibt nichts |
| `/api/v1/references/import/run` | Testlauf oder bestätigter Import |
| `/api/v1/references/import/template` | Anonymisierte CSV-Vorlage |
| `/api/v1/references/manual` | Einzelnes Referenzprojekt anlegen |
| `/api/v1/references/clients` | Kunde anlegen (POST), zweistufige Dublettenbestätigung |
| `/api/v1/references/clients/[id]` | Kunde bearbeiten (PATCH), getrennte Audit-Einträge je Ereignis |

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

**vitest**, 141 Tests in 7 Dateien, dazu ein SQL-Prüfskript mit 22 Fällen.

| Datei | Umfang |
|---|---|
| `tests/csv-parsing.test.ts` | Trennzeichenerkennung, Anführungszeichen, BOM, CRLF, kurze Zeilen |
| `tests/xlsx-parsing.test.ts` | Echte Arbeitsmappen, Datums- und Zahlenzellen, leere Zellen |
| `tests/validation.test.ts` | Schichtformat, Spaltenzuordnung, alle Validierungsregeln |
| `tests/classification.test.ts` | Vorsichtige Leistungserkennung, keine Klassifikation unbekannter Namen |
| `tests/import-pipeline.test.ts` | Dublettenerkennung, Testlauf ohne Speichern, bestätigter Import, Mandantentrennung, Suchprofil-Vorschläge |
| `tests/service-confirmation.test.ts` | Alle fünf Entscheidungen, Berechtigungen, Mandantentrennung, Audit-Einträge, Sammelbestätigungsregeln, Auswirkung auf Kennzahlen und Vorschläge |
| `tests/customer-management.test.ts` | Kundenformular (Pflichtfeld, Länge, Website, Ländercode, Dubletten als Fehler bzw. Warnung, Änderungsdiff), Mandantentrennung, Berechtigungen, Referenzsuche mit allen Filtern, Notizen an allen fünf Entscheidungen |
| `supabase/tests/reference-search.sql` | Dieselben Suchfälle gegen `search_reference_projects` — Volltext, Filter, Sortier-Whitelist, Seitenzahlen, Mandantentrennung |

Die letzten beiden prüfen bewusst **dieselben** Erwartungen. Ein Test gegen den
Entwicklungsspeicher allein würde über das Verhalten in der Datenbank nichts
aussagen.

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

Schema und Suchfunktion lassen sich **ohne** Supabase-Zugang gegen ein lokales
PostgreSQL prüfen; der Ablauf steht in `docs/supabase-setup.md`. Alle zehn
Migrationen und die 22 Fälle des Suchskripts sind auf diesem Weg durchlaufen
worden, einschließlich einer Gegenprobe, dass ein Nichtmitglied unter RLS kein
Ergebnis erhält.

Der lokale Adapter ist flüchtig. Die Oberfläche weist auf `/customers` und im
Importdialog ausdrücklich darauf hin, dass dort keine echten Kundendaten
erfasst werden sollen.

### 13.10 Bestätigung von Leistungsarten

Nachgereicht und damit die letzte offene Lücke aus Phase 2 geschlossen.

**Migration** `0009_service_confirmation.sql` — rein additiv: neue Spalten
`confirmation_status`, `confirmed_at`, `confirmed_by`. Bestehende Zeilen werden
aus `confirmed_by_user` abgeleitet (bereits bestätigte gelten als `manual`,
weil nicht rekonstruierbar ist, ob sie dem ursprünglichen Vorschlag
entsprachen). Keine Spalte entfällt, keine Zeile wird gelöscht.

**Fünf Zustände**, weil der Boolean allein zu wenig sagt — ein unangetasteter
und ein geprüfter Vorschlag sind beide `false`:

| Status | Nachweis? |
|---|---|
| `proposed` — automatisch erkannt, ungeprüft | nein |
| `confirmed` — Vorschlag unverändert bestätigt | **ja** |
| `manual` — Kategorie von Hand festgelegt und bestätigt | **ja** |
| `rejected` — Vorschlag verworfen | nein |
| `unknown` — Leistung nicht bestimmbar | nein |

**Fünf Aktionen** auf `/references/[id]`: bestätigen, Kategorie ändern und
bestätigen, als unbekannt markieren, verwerfen, Bestätigung zurücksetzen.
Angezeigt werden Kategorie, Anzeigename, Erkennungsquelle, Konfidenz, Status,
Zeitpunkt, entscheidende Person und Notiz.

Eine unbestimmte Kategorie lässt sich **nicht** bestätigen — das wäre die
Behauptung, etwas festgestellt zu haben, was nicht festgestellt wurde. Die
Schaltfläche wird dort gar nicht erst angeboten.

**Sammelbestätigung** auf `/references` nur bei einheitlicher Kategorie, nur
für offene Vorschläge, nie für `unknown`, nur mit ausdrücklichem
Bestätigungskennzeichen. Die Auswahl wird serverseitig frisch gelesen und die
Regel erneut geprüft.

**Berechtigungen**: `references:write` haben `bid_manager`, `org_admin` und
`super_admin`; `viewer` sieht dieselben Informationen ohne Bedienelemente.
Geprüft wird doppelt — `requirePermission` vor dem Lesen und
Organisationsbindung im Speicher, wobei eine fremde ID als „nicht gefunden"
zurückkommt, damit ihre Existenz nicht ableitbar ist.

**Audit**: Jede Entscheidung schreibt Organisation, Benutzer, Referenzprojekt,
alten und neuen Wert, Aktion und Zeitstempel — über den Datenbank-Trigger
`log_service_confirmation` und zusätzlich über die API, damit beide Speicher
gleichermaßen nachvollziehbar sind. Die Historie ist auf der Detailseite
sichtbar.

### 13.10a Notizen an Entscheidungen

Jede der fünf Entscheidungen und die Sammelbestätigung nehmen eine interne
Notiz entgegen (höchstens 2.000 Zeichen, serverseitig geprüft). Das Feld ist
mit dem gespeicherten Text vorbelegt, damit eine weitere Entscheidung eine
vorhandene Begründung nicht stillschweigend löscht; eine leere
Sammelbestätigungs-Notiz überschreibt nichts.

Im `audit_log` steht nur `hasNote` — nie der Text. Sonst würde das Protokoll zu
einem zweiten Speicher für Geschäftsdaten (`docs/data-protection.md`, § 6).

### 13.10b Serverseitige Referenzsuche

`0010_reference_search_rpc.sql` legt `public.search_reference_projects` an. Die
Filter auf Leistungsart und Bestätigungsstand liegen in einer Kindtabelle und
wurden im Supabase-Adapter bisher auf der bereits geladenen Seite angewendet —
mit falscher Gesamtzahl und halbleeren Seiten als Folge. Jetzt filtert,
sortiert und paginiert die Datenbank; die Anwendung liest die Treffer-IDs und
die Gesamtzahl.

| Anforderung | Umsetzung |
|---|---|
| Rechte der aufrufenden Person | `security invoker`, RLS gilt unverändert |
| keine fremde `organization_id` | zusätzlich `is_org_member()`; fremde Organisation → leeres Ergebnis, kein Fehler |
| keine dynamische SQL-Sortierung | Whitelist über `case`; ein unbekanntes Sortierfeld fällt auf den Standard zurück |
| parametrisierte Abfragen | ausschließlich Parameter; der Suchtext wird auf die Vergleichsform reduziert, `%` ist kein Platzhalter |
| keine Service-Role im Browser | die Funktion wird über den normalen Client aufgerufen, `execute` nur für `authenticated` |
| stabile Seiten | eindeutiger Nachschlüssel in der Sortierung |

Zwei Hilfsfunktionen bilden `normalizeForComparison` und `normalizeCityName`
in SQL nach, damit Datenbank und Entwicklungsspeicher dieselbe Suche gleich
beantworten. Beide Adapter werden an denselben Testfällen gemessen.

### 13.11 Bekannte offene Punkte

1. **Kundenliste lädt alle Projekte der Organisation** für die Aggregate
   (Projektzahl, Standorte, bestätigte Leistungsarten). Ab einigen Tausend
   Projekten braucht es eine materialisierte Sicht oder eine zweite Funktion
   nach dem Muster von `search_reference_projects`.
2. **RLS ist nicht automatisiert gegen eine echte Supabase-Instanz getestet.**
   Die Mandantentrennung ist im lokalen Adapter getestet und die Richtlinien
   wurden gegen ein lokales PostgreSQL mit nachgebildetem `auth`-Schema
   gegengeprüft — beides ersetzt keinen Lauf gegen das echte Projekt.
3. **Kundendubletten lassen sich nicht zusammenführen.** Bewusst: Das
   Verschmelzen zweier Kundenakten ist nicht umkehrbar. Die Anwendung warnt und
   überlässt die Entscheidung dem Menschen.
4. **PDF-Import und OCR fehlen** — bewusst außerhalb dieser Phase.
5. **Referenznachweise als Dokumente** folgen mit der Dokumentenverarbeitung.
6. **Die Bedeutung der Schichtzahlen** (`218/146/0`) ist weiterhin unbestätigt.
   Der Originalwert bleibt erhalten; benannt wird er erst, wenn die Bedeutung
   geklärt ist.

Erledigt gegenüber dem vorherigen Stand: Kundenformular, Notizfeld an allen
Entscheidungen, serverseitige Filterung im Supabase-Adapter.

### 13.12 Nächste sinnvolle Schritte

1. Supabase-Projekt anlegen, Migrationen anwenden, RLS gegen die echte
   Datenbank prüfen.
2. Bedeutung der Schichtzahlen klären und erst danach benennen.
3. Aggregation der Kundenliste in die Datenbank verlagern.
4. Erst dann TED/eForms als erste Live-Quelle.

---

## 14. Subunternehmer-Radar — Ausrichtung

> **Status: umgesetzt in Phase 3A.** Dieses Kapitel hält die fachliche
> Ausrichtung fest; der Umsetzungsstand steht in Kapitel 15.

### 14.1 Abgrenzung — was der Bereich ausdrücklich nicht ist

Das Subunternehmer-Radar ist ein **privates internes Werkzeug einer einzigen
Organisation**. Es ist **keine Partnerbörse und kein Marktplatz**.

Fremde Unternehmen sind in diesem Bereich Datensätze, keine Beteiligten. Sie

- legen **kein Benutzerkonto** an,
- pflegen **kein öffentliches Partnerprofil**,
- veröffentlichen **keine Gesuche**,
- senden **keine Bewerbungen** über die Plattform,
- sehen **keine internen Daten** — auch nicht die über sie selbst.

Es gibt folglich keine Registrierung für Dritte, keine öffentlich lesbare
Ansicht, keinen Posteingang und keinen Abgleich zwischen zwei Organisationen.
Jede spätere Anforderung, die eines dieser fünf Dinge einführen würde, ist eine
Richtungsänderung und keine Erweiterung — sie gehört zuerst hierher, nicht in
einen Pull Request.

Nicht zu verwechseln mit dem **Auftraggeber-Radar** (Kapitel 11, Phase 5): Das
betrachtet öffentliche Vergabestellen aus Vergabeverfahren und ist geteilte
Referenzdatenbasis. Das Subunternehmer-Radar betrachtet mögliche Auftragnehmer
der eigenen Organisation und ist vertraulich.

### 14.2 Zweck

- potenzielle Subunternehmer und Nachunternehmer intern erfassen
- Unternehmen finden, die Aufträge oder Kooperationen suchen
- Kontakte, Leistungen, Regionen und Verfügbarkeit verwalten
- Referenzen, Zertifikate, Versicherungen und Qualifikationen prüfen
- Partner internen Projekten und Baustellen zuordnen
- Kommunikation und Aktivitäten dokumentieren
- bevorzugte, zu prüfende und gesperrte Partner unterscheiden
- Ablaufdaten von Nachweisen überwachen
- die Nachunternehmerkette nachvollziehbar dokumentieren

### 14.3 Einordnung in die bestehenden Domänen

Das Schema kennt damit drei Arten von Gegenparteien, die nie zusammengeführt
werden:

| | `contracting_authorities` | `business_clients` | `subcontractors` |
|---|---|---|---|
| Wer | öffentliche Vergabestelle | eigener Geschäftskunde | möglicher Nachunternehmer |
| Richtung | vergibt an uns | wir leisten für ihn | leistet für uns |
| Herkunft | aus Vergabeverfahren importiert | selbst gepflegt | selbst gepflegt |
| Sichtbarkeit | alle angemeldeten Nutzer | eigene Organisation | eigene Organisation |
| Mandant | keiner | `organization_id` | `organization_id` |

Dieselbe Firma kann in mehreren Rollen auftreten — als Kunde und als
Nachunternehmer. Das sind zwei Datensätze mit unterschiedlicher Rechtsnatur
und unterschiedlicher Vertraulichkeit, keine zwei Sichten auf einen Datensatz.

### 14.4 Mandantenprivatheit

Der gesamte Bereich ist mandantenprivat. Es gilt dieselbe doppelte Absicherung
wie für Kunden- und Referenzdaten (`docs/data-protection.md`, Abschnitt 5):

1. Jede Tabelle trägt `organization_id`, Row Level Security lässt nur
   Mitglieder der Organisation lesen (`is_org_member`) und nur `org_admin`
   sowie `bid_manager` schreiben (`has_org_role`).
2. Jede Route prüft die Berechtigung zusätzlich serverseitig.

Vorgesehene Berechtigungen: `subcontractors:read` und `subcontractors:write`.
Sie sind eigenständig — Lesezugriff auf Kunden bedeutet nicht Lesezugriff auf
Nachunternehmer, weil Preise und Bewertungen eine andere Vertraulichkeit haben.

Ein Datensatz einer fremden Organisation wird wie überall als **„nicht
gefunden"** beantwortet, nicht als „keine Berechtigung" — sonst ließe sich die
Existenz fremder Einträge abfragen.

### 14.5 Öffentliche Daten als Quellenhinweis

Öffentlich verfügbare Unternehmensdaten (etwa ein Unternehmen, das in einem
Vergabeverfahren als Bieter oder Zuschlagsempfänger auftaucht) dürfen mit einem
privaten Subunternehmer-Datensatz **verknüpft** werden — als Herkunftsangabe,
nicht als Inhalt.

- Die Verknüpfung ist eine Referenz (`source_id`, `external_id`, optional
  `award_id`), keine Kopie und keine Verschmelzung.
- Öffentliche Felder bleiben in ihrer öffentlichen Tabelle und werden dort
  gelesen. Sie werden nicht in den privaten Datensatz hineingeschrieben.
- **Eigene Notizen, Bewertungen, Preise, Konditionen, Kontaktpersonen und
  Dokumente sind strikt privat** und verlassen die Organisation nie — auch
  nicht in aggregierter oder anonymisierter Form.
- Umgekehrt fließt aus einem privaten Datensatz nichts in die öffentlichen
  Referenzdaten zurück.

### 14.6 Skizze des Datenmodells

Noch nicht festgelegt, aber in dieser Richtung:

| Tabelle | Inhalt |
|---|---|
| `subcontractors` | Stammdaten, Vergleichsform des Namens, Status (`preferred`, `review`, `blocked`, `unknown`), interne Notizen |
| `subcontractor_contacts` | Ansprechpartner mit Rolle und Erreichbarkeit |
| `subcontractor_services` | angebotene Leistungsarten — dieselbe Enum wie bei den Referenzen, mit derselben Zurückhaltung: unbestätigt ist ein Vorschlag |
| `subcontractor_regions` | abgedeckte Regionen und Orte |
| `subcontractor_availability` | Verfügbarkeit und Kapazität, mit Gültigkeitszeitraum |
| `subcontractor_credentials` | Zertifikate, Versicherungen, Qualifikationen — je mit Ausstellung, **Ablaufdatum** und Prüfvermerk |
| `subcontractor_documents` | hinterlegte Nachweise (Storage-Verweis, nie im Repository) |
| `subcontractor_activities` | Kommunikation und Vorgänge, chronologisch |
| `subcontractor_assignments` | Zuordnung zu eigenen Projekten und Baustellen |
| `subcontractor_chain_links` | Nachunternehmerkette: wer beauftragt wen, je Projekt |
| `subcontractor_public_links` | Verknüpfung mit öffentlichen Quelldaten (Abschnitt 14.5) |

Es gelten die bestehenden Regeln: additive Migrationen, `created_at` /
`updated_at`, RLS auf jeder Tabelle, Indizes zusammen mit den Tabellen,
Änderungen im `audit_log` — mit Metadaten, nie mit dem Dateninhalt.

### 14.7 Nachweise und Ablaufdaten

Ein abgelaufener Nachweis ist der eigentliche fachliche Zweck der Überwachung.
Deshalb:

- Jeder Nachweis trägt ein Ablaufdatum oder ausdrücklich **kein** Ablaufdatum;
  ein unbekanntes Datum wird nicht geraten und nicht aus dem Ausstellungsdatum
  hochgerechnet.
- Ohne geprüften, gültigen Nachweis gilt eine Qualifikation als **nicht
  belegt** — dieselbe Regel wie bei den eigenen Referenzen: Ein zu Unrecht
  angenommener Nachweis ist schädlicher als ein fehlender, weil er zu einer
  Beauftragung führt, deren Eignung sich nicht belegen lässt.
- Ein gesperrter Partner (`blocked`) wird nicht ausgeblendet, sondern sichtbar
  als gesperrt geführt, mit Grund und Zeitpunkt. Stillschweigend verschwundene
  Datensätze sind für eine Nachunternehmerkette wertlos.

### 14.8 Bewusst nicht Teil dieses Bereichs

- Selbstregistrierung, Einladungen oder Konten für fremde Unternehmen
- öffentliche Profile, Suchmaschinen-Sichtbarkeit, Freigabelinks
- Ausschreiben von Gesuchen, Angebotseinholung oder Bewerbungsverwaltung
  über die Plattform
- automatische Anreicherung aus externen Firmendatenbanken ohne Quellenangabe
  und ohne menschliche Bestätigung
- Bewertungen, die andere Organisationen sehen können
- automatisches Zusammenführen ähnlich benannter Firmen

### 14.9 Offene Punkte vor der Umsetzung

1. Phase und Reihenfolge gegenüber den übrigen offenen Themen (Live-Quellen,
   Dokumentenverarbeitung) sind noch nicht entschieden.
2. Ob Nachweisdokumente in Supabase Storage liegen und wie lange sie
   aufbewahrt werden, ist offen — inklusive Löschfristen.
3. Ob und wie Ablaufwarnungen zugestellt werden (Ansicht, E-Mail, beides),
   ist offen.
4. Die Tiefe der Nachunternehmerkette (nur direkte Nachunternehmer oder
   mehrstufig) ist fachlich zu klären.


---

## 15. Umsetzungsstand Phase 3A — Subunternehmer-Radar

### 15.1 Namensentscheidung

Die Tabellen heißen **`partner_companies`**, nicht `subcontractors`. Ein
Datensatz kann für uns arbeiten, uns beauftragen oder beides; die Tabelle nach
nur einer dieser Richtungen zu benennen hätte die falsche Annahme in jede
Abfrage eingebaut, die je darauf geschrieben wird.

Die Oberfläche behält den betrieblichen Begriff **Subunternehmer-Radar**.
Kindtabellen tragen konsequent das Präfix `partner_`; die drei Tabellen, die
unseren eigenen Bedarf und dessen Auswertung abbilden, heißen
`subcontractor_needs`, `subcontractor_matches` und `subcontractor_assignments`,
weil sie tatsächlich von Unterbeauftragung handeln.

### 15.2 Abgrenzung

Nicht gebaut, bewusst und dauerhaft: externe Benutzerkonten, öffentliche
Partnerprofile, veröffentlichte Gesuche, Bewerbungen über die Plattform,
öffentliche Suche, Nachrichten- oder Chatsystem, Zahlungsabwicklung,
automatisches Web-Scraping, Orbis-/Moody's-Anbindung, TED/eForms.

### 15.3 Datenbank

Drei Migrationen, **15 Tabellen**, 24 Enums:

- `0011_partner_companies.sql` — Tabellen und Enums
- `0012_partner_rls_audit.sql` — RLS, Audit-Trigger, Demo-Schutz, Sperr- und
  Kettenprüfung
- `0013_partner_search_rpc.sql` — `search_partner_companies`

Mandantensicherung: Jede Kindtabelle führt `organization_id` selbst **und** ist
über einen zusammengesetzten Fremdschlüssel auf `(id, organization_id)` der
Elterntabelle gebunden. Die Spalte allein könnte auseinanderlaufen; der
Schlüssel macht das in der Datenbank unmöglich.

Weitere Schutzmechanismen in der Datenbank, nicht nur im Anwendungscode:

| Mechanismus | Wirkung |
|---|---|
| `partner_documents_storage_private` | lehnt jeden Pfad ab, der wie eine öffentliche URL aussieht |
| `enforce_partner_block_reason()` | eine Sperrung braucht eine Begründung; „gesperrt" und „bevorzugt" schließen sich aus |
| `enforce_assignment_chain()` | errechnet die Kettenebene, verhindert Kreise, begrenzt auf sechs Ebenen |
| `reject_demo_partner_data()` | Partnerdaten hängen nie an einer Demo-Organisation |
| `log_partner_change()` | Audit-Einträge mit Metadaten, nie mit Feldinhalten |

### 15.4 Berechtigungen

Fünf statt einer, weil die Daten im Bereich unterschiedlich vertraulich sind:
`subcontractors:read`, `:write`, `:documents`, `:financial`, `:admin`.

Ein Bid Manager pflegt den Bestand vollständig, **ohne** verhandelte Preise zu
sehen. Ohne `:financial` ist das Register „Konditionen" gar nicht sichtbar — ein
leeres Register würde bereits verraten, dass es Preise gibt. Vollständige
Matrix: `docs/permissions.md`.

### 15.5 Seiten und Routen

Zwölf Seiten unter `/subcontractors` (Übersicht, anlegen, Detail mit 13
Registern, bearbeiten, Signale, Bedarf, Bedarf anlegen, Bedarf-Detail,
Projektzuordnungen, Nachweise, Aktivitäten, Import) plus 15 API-Routen unter
`/api/v1/partners`.

Sidebar-Gruppe „Subunternehmer-Radar" mit sieben Einträgen; Dashboard um sechs
Kennzahlen ergänzt, sichtbar erst, wenn Daten vorliegen und die Rolle sie lesen
darf.

### 15.6 Die vier Ehrlichkeitsregeln

Sie ziehen sich durch Schema, Domänenlogik und Oberfläche:

1. Nur **bestätigte** Leistungen zählen; eine Selbstauskunft ist kein Nachweis.
2. **Abgelaufene oder ungeprüfte Nachweise** gelten nicht als erfüllt, und ein
   Ablaufdatum wird nie geschätzt.
3. **Veraltete Verfügbarkeit** (über sechs Wochen ohne Bestätigung) gilt als
   unbekannt, nicht als ihr alter Wert.
4. **Fehlende Angaben** werden als fehlend ausgewiesen und nie positiv
   gewertet.

Ein Sonderfall derselben Regel: Ist kein Einsatzgebiet hinterlegt, erzeugt der
Firmensitz **keine** Regionspunkte im Match. Der Sitz sagt, wo ein Unternehmen
gemeldet ist — nicht, wo es arbeitet.

### 15.7 Signale

Beobachtungen mit **Pflicht-Quellenangabe** und Konfidenz. Hohe Konfidenz setzt
eine belegbare Quelle voraus; ein Signal ohne Quelle wird nicht gespeichert.
Sechs Entscheidungen (geprüft, relevant, kontaktiert, erledigt, verworfen,
abgelaufen). Ein Signal ändert die Beziehungsrichtung **nie automatisch** — die
Anwendung schlägt vor, ein Mensch entscheidet.

### 15.8 Match-Engine

Deterministisch, ohne Sprachmodell, mit dokumentierter Gewichtung: Leistung
30 %, Region 20 %, Verfügbarkeit 20 %, Kapazität 15 %, Nachweise 10 %,
Datacenter-Erfahrung 5 %. Jede Teilbewertung wird mit Begründung angezeigt, die
Regelversion (`partner-match-v1`) gespeichert.

Harte Ausschlüsse ohne Score: gesperrt, archiviert, oder reiner Vermittler bei
verbotener Weitervergabe. Eine menschliche Entscheidung an einem Match
(Shortlist, abgelehnt) überlebt die Neuberechnung. Einzelheiten:
`docs/match-score.md`.

### 15.9 Nachunternehmerkette

Selbstreferenzierende Zuordnungen bis sechs Ebenen, als Baum dargestellt.
Kreise werden in Anwendung und Datenbank verhindert. Eine weitere Ebene ist nur
möglich, wenn die übergeordnete Zuordnung Untervergabe **ausdrücklich** erlaubt
— „unbekannt" ist keine Erlaubnis. Ein später gesperrter Partner bleibt in einer
bestehenden Kette sichtbar; ihn zu entfernen würde die Historie umschreiben.

### 15.10 Import

Derselbe zehnstufige Ablauf wie der Referenzimport, und derselbe Code für
Testlauf und echten Import. Der Zuordnungsalgorithmus wurde nach
`src/lib/import/column-matching.ts` gezogen und wird jetzt von beiden Importen
verwendet, statt in zwei Kopien zu leben.

Was der Import bewusst nicht tut: eine importierte Leistung gilt als *selbst
angegeben*, eine importierte Verfügbarkeit als unbestätigt,
Datacenter-Erfahrung höchstens als *selbst angegeben*, und ein Signal entsteht
nur mit Quellenangabe.

### 15.11 Automatisierte Tests

**vitest, 241 Tests in 11 Dateien** (100 davon neu), dazu ein SQL-Prüfskript mit
32 Fällen.

| Datei | Umfang |
|---|---|
| `tests/partner-companies.test.ts` | Mandantentrennung, Rollen, Firmenverwaltung, Dubletten, Beziehungsrichtung |
| `tests/partner-matching.test.ts` | Leistungen, Verfügbarkeitsalterung, Nachweise, Match-Engine, Determinismus |
| `tests/partner-signals-chain.test.ts` | Signale mit Quellenpflicht, Kette, Kreise, Tiefe, gesperrte Historie |
| `tests/partner-import.test.ts` | CSV/XLSX, Zuordnung, Testlauf, bestätigter Import, Rohdaten, Suche |
| `supabase/tests/partner-search.sql` | Dieselben Suchfälle gegen die RPC plus alle Datenbank-Guards |

Die letzten beiden prüfen bewusst **dieselben** Erwartungen.

### 15.12 Zwei Befunde aus den Tests

Beide Male hat ein Test eine echte Schwäche gezeigt, nicht nur eine falsche
Erwartung:

1. **Telefonnummern.** `+49 (0)30 …` und `0049 30 …` sind dieselbe Nummer,
   verglichen aber ungleich — die Dublettenwarnung hätte genau den Fall
   verpasst, für den sie existiert. Der Amtsleitungs-Präfix wird jetzt entfernt.
2. **Region ohne Einsatzgebiet.** Der Firmensitz erzeugte 60 % der
   Regionspunkte. Aus einer Meldeadresse Abdeckung abzuleiten ist dieselbe Art
   Vermutung, die das Projekt sonst ablehnt — der Sitz wird jetzt genannt, aber
   nicht bepunktet.

### 15.13 Supabase

Es liegen weiterhin **keine Zugangsdaten** vor; es wurden keine erfunden. Alle
13 Migrationen und die 32 Fälle des Partner-Prüfskripts sind gegen ein lokales
PostgreSQL mit nachgebildetem `auth`-Schema durchlaufen worden, einschließlich
der Gegenprobe, dass ein Nichtmitglied unter RLS weder über die RPC noch direkt
etwas sieht.

**Der Storage-Bucket für Dokumente ist nicht eingerichtet.** Die Anwendung
erfasst deshalb ausschließlich Metadaten und sagt das an jeder Stelle — ein
vorgetäuschter sicherer Ablageort wäre schlimmer als gar keiner. Was noch zu tun
ist, steht in `docs/supabase-setup.md`, Abschnitt 3b.

### 15.14 Bekannte offene Punkte

1. **Dateiupload fehlt.** Es werden nur Dokumentmetadaten erfasst; Bucket,
   Storage-Policies, signierte Links und Schadsoftwareprüfung stehen aus.
2. **Kein Scheduler.** Ablaufhinweise erscheinen nur in der Anwendung. Es
   werden keine E-Mails versendet und keine Hintergrundautomatik vorgetäuscht.
3. **Keine kontrollierte Zusammenführung** von Dubletten. Bewusst: Das
   Verschmelzen zweier Partnerakten ist nicht umkehrbar. Die Anwendung warnt.
4. **Kein Geocoding.** Der Radiusfilter arbeitet mit der Angabe des
   Unternehmens, nicht mit berechneten Entfernungen.
5. **Die Partnerliste lädt je Tabelle eine Abfrage** für Leistungen, Regionen,
   Verfügbarkeit, Nachweise und Signale. Ab einigen Tausend Partnern je
   Organisation wäre eine materialisierte Sicht angebracht.
6. **RLS ist nicht gegen eine echte Supabase-Instanz getestet** — dieselbe
   Einschränkung wie in Phase 2.
7. **Kontakte, Konditionen und Dokumente haben keine Bearbeitungsformulare**,
   nur Erfassung. Ändern erfolgt über dieselben Endpunkte mit `id`.

### 15.15 Nächste sinnvolle Schritte

1. Supabase-Projekt anlegen, Migrationen anwenden, RLS und Storage prüfen.
2. Dateiupload mit privatem Bucket und signierten Links nachziehen.
3. Erst danach Unternehmensradar oder TED/eForms.


---

## 16. Umsetzungsstand Phase 4 — Supabase-Infrastruktur

> **Status: umgesetzt.** Diese Phase liefert die Grundlage, auf der echte
> Daten überhaupt liegen dürfen: eine anwendbare Datenbank, eine
> nachvollziehbare Backendwahl, geprüfte Mandantentrennung und einen privaten
> Dokumentenspeicher. Sie bindet **keine** Live-Datenquelle an.

### 16.1 Werkzeuge

* Supabase CLI als Projektabhängigkeit mit festgelegter Version — keine
  undokumentierte globale Installation.
* `supabase/config.toml` versioniert; Geheimnisse ausschließlich als
  `env(...)`-Verweis. Lokal: Mindestpasswortlänge 12, anonyme Anmeldungen aus.
* Skripte: `supabase:start|stop|status|migrations|types|reset|test`,
  `db:validate`, `db:test`; `verify` umfasst Typen, Lint, Tests,
  Migrationsprüfung und Build.

### 16.2 Umgebung und Backendwahl

* Getrennte Module `src/lib/env/public.ts` (browsersicher) und
  `src/lib/env/server.ts` (`server-only`).
* Aktuelle Schlüsselnamen (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`); die alten werden mit Warnung weitergelesen, ohne
  jemals einen Wert zu protokollieren.
* `DATA_BACKEND` entscheidet ausdrücklich. **Kein stiller Rückfall:** fehlende
  Konfiguration bei `supabase` ist ein Fehler, `memory` in der Produktion
  unzulässig, fehlende Konfiguration in der Produktion ein Startabbruch.
* Die Entscheidung fällt einmal, wird einmal protokolliert, und kein `catch`
  im Datenzugriff wechselt sie.

### 16.3 Datenbank

* 16 Migrationen, 41 Tabellen mit RLS, 20 Funktionen mit festgelegtem
  `search_path`.
* `0014` härtet vier ältere Funktionen — additiv, ohne eine veröffentlichte
  Migration umzuschreiben.
* `0015` legt Dokumenttabellen, drei private Buckets und zwölf
  Storage-Policies an, `0016` das Onboarding.
* `npm run db:validate` prüft statisch: Nummerierung, zerstörende
  Anweisungen, RLS-Abdeckung, `search_path`, `security definer`-Erlaubnisliste,
  dynamisches SQL aus Parametern.

### 16.4 Authentifizierung und Organisation

* Drei Sitzungszustände: anonym, Onboarding, angemeldet. Ein angemeldeter
  Benutzer ohne Organisation landet nicht mehr auf der Anmeldeseite.
* `create_first_organization` legt Organisation, Mitgliedschaft (`org_admin`)
  und Auditeintrag in einer Transaktion an, verhindert ein zweites Onboarding
  und ist für `anon` nicht ausführbar.
* **Keine öffentliche Selbstregistrierung für fremde Firmen.** Partnerfirmen
  bekommen keine Konten (Kapitel 14).
* Die Organisation stammt immer aus der Sitzung, nie aus dem Request. Fremde
  Kennungen erscheinen als „nicht gefunden".

### 16.5 Dokumente

* Drei private Buckets, 25 MB, sechs erlaubte Typen, Pfad
  `<organization_id>/<entity_type>/<entity_id>/<uuid>-<datei>`.
* SHA-256 je Datei, Originalname getrennt vom Objektschlüssel, Archivieren als
  Normalfall, Löschen nur mit eigener Berechtigung, Auditeintrag ohne Inhalte.
* Downloads ausschließlich über signierte Links (Standard 300 s), die nirgends
  gespeichert werden; erzeugt mit der Sitzung des Aufrufers, nie mit dem
  Secret Key.
* **Keine vorgetäuschte Schadsoftwareprüfung:** `scan_status` bleibt
  `not_scanned`, die Oberfläche sagt „nicht geprüft".

### 16.6 Prüfungen

* 300 Unit-Tests, 103 SQL-Prüfungen in vier Skripten, alle als Rolle
  `authenticated` statt als Superuser.
* CI ohne jedes Supabase-Geheimnis: Typen, Lint, Tests, Build,
  Migrationsprüfung, Secret-Scan, SQL- und RLS-Tests gegen ein
  Wegwerf-PostgreSQL.

### 16.7 Offene Punkte

1. **Kein Lauf gegen eine echte Supabase-Instanz.** Kein erreichbarer
   Docker-Daemon, keine Zugangsdaten. Geprüft wurde gegen ein lokales
   PostgreSQL mit nachgebildetem `auth`- und `storage`-Schema; die echte
   Storage-API, die JWT-Auswertung und die Bucket-Limits sind damit nicht
   abgedeckt.
2. **`src/types/database.ts` fehlt** — `supabase gen types` braucht eine
   erreichbare Instanz; erfundene Typen wären eine ungeprüfte Zusicherung.
3. **Kein Virenscanner.**
4. **Keine Einladungsfunktion** für weitere Mitglieder; bis dahin über das
   Supabase-Dashboard.
5. **Kein automatisches Deployment und keine Migration aus CI heraus.**
6. **Keine Dokumentoberfläche am Kunden** (`business_client`); Datenmodell und
   API tragen sie bereits.

### 16.8 Nächste sinnvolle Schritte

1. Supabase-Projekt anlegen und die Checkliste in
   `docs/supabase-one-time-setup.md` abarbeiten.
2. Danach Typen erzeugen und die SQL-Tests einmal gegen die
   Entwicklungsinstanz laufen lassen.
3. Erst danach Unternehmensradar, Orbis/GLEIF oder TED/eForms.

---

## 17. Umsetzungsstand — TED-/eForms-Connector (erste Live-Quelle)

Mit diesem Schritt ist die in Kapitel 11 (Phase 2) vorgesehene *erste
produktive Quelle* umgesetzt. Die Pipeline aus Kapitel 3 verläuft damit
erstmals von einer echten externen Quelle bis in die Oberfläche.

### 17.1 Was angebunden wurde

TED (*Tenders Electronic Daily*), das Amtsblatt der EU für Vergaben, über die
öffentliche Such-API `api.ted.europa.eu/v3/notices/search` im eForms-Format.
Die API benötigt **keine Zugangsdaten**; der Connector liest folglich keine
Umgebungsvariable, und die Liste in `CLAUDE.md` bleibt unverändert.

Vorgefilterter Suchbereich der registrierten Quelle: die Startbranchen
(Sicherheits-, Wach-, Überwachungs- und Streifendienste, Brandverhütung,
Reinigung, Unterbringungs- und Pförtnerdienste, soziale Betreuung mit
Unterbringung) mit Deutschland als Erfüllungsort, Veröffentlichungsfenster
14 Tage.

### 17.2 Neue Module

| Modul | Aufgabe |
|---|---|
| `connectors/sources/ted-eforms/index.ts` | Connector: Seiten holen, Cursor führen, Health-Check |
| `.../client.ts` | HTTP, Retry mit exponentiellem Backoff, Rate-Limit, Timeout |
| `.../config.ts` | Zod-Schema für `sources.config` inkl. Standardwerten |
| `.../query.ts` | Bau der TED-Expertenabfrage aus der Konfiguration |
| `.../fields.ts` | die 61 angefragten eForms-Terms |
| `normalizer/mappers/ted-eforms.ts` | Abbildung eForms → gemeinsames internes Format |
| `migrations/0017_register_ted_eforms_source.sql` | Registrierung der Quelle |

Ergänzt wurden außerdem geteilte Referenzdaten, die nicht TED-spezifisch sind:
NUTS → Bundesland und ISO alpha-3 → alpha-2 in `src/config/regions.ts`, sowie
die Auflösung CPV → Branche über die CPV-Hierarchie in `src/config/sectors.ts`.

**Nicht geändert wurden** das Datenmodell, die Ports, die Oberfläche
(abgesehen von zwei Hinweistexten) und der DEMO-Connector. Der Nachweis, dass
eine neue Quelle ein reines Zusatzmodul ist, ist damit erbracht.

### 17.3 Eingehaltene Leitplanken

- **Connector ohne Business-Logik.** Er benennt kein Feld um und wandelt kein
  Datum; die Payload geht unverändert in `raw_imports`. Das gesamte Mapping
  liegt im Normalizer und ist ohne erneute Abfrage wiederholbar.
- **Herkunft vollständig.** `sources.key` + `publication-number` an jedem
  Datensatz; `payload_hash` und `fingerprint` werden mitgeführt.
- **Aktivierung über Daten.** `sources.is_active` und `sources.config`
  steuern Lauf und Suchbereich; ein erneuter Migrationslauf setzt eine
  bewusst abgeschaltete Quelle nicht wieder an.
- **Live und DEMO getrennt.** Die Quelle ist `is_demo = false`; der Trigger aus
  `0006` erzwingt die Trennung weiterhin in der Datenbank.
- **Keine Secrets.** Die API ist öffentlich; Konfigurationswerte werden vor
  dem Einsetzen in die Abfrage validiert.
- **Fehler bleiben sichtbar.** Ein fehlerhafter Datensatz scheitert allein,
  der Rohimport bleibt erhalten, der Grund steht in `normalization_runs`;
  ein Ausfall der Quelle blockiert weder andere Connectors noch die UI.

### 17.4 Abbildungsentscheidungen — „im Zweifel leer"

Bei Angaben, die eForms nur mehrdeutig liefert, wird nichts geraten. Das
betrifft vor allem Zuschlagsdaten: TED veröffentlicht Gewinner, Orte und Werte
als getrennte Arrays, die sich bei mehreren Losen nicht verlässlich einander
zuordnen lassen. Abgebildet wird der erste Gewinner; Wert, Ort und Bieterzahl
bleiben leer, sobald sie mehrdeutig sind, und die vollständigen Angaben stehen
in `source_extras` sowie im Rohimport.

Ebenso bewusst leer bleiben: ein Bundesland des Auftraggebers (TED nennt es
nicht, eine Postleitzahl ist keines), Eignungskriterien (nicht Teil der
Suchantwort) und Los-CPV-Codes bei mehreren Losen. Der Status wird nie aus der
aktuellen Uhrzeit abgeleitet — eine abgelaufene Frist macht keine
Ausschreibung `closed`, weil der Payload sich danach nicht mehr ändert und der
Wert dauerhaft stehen bliebe.

Vollständige Beschreibung: `docs/connector-ted-eforms.md`.

### 17.5 Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Erreichbarkeit `api.ted.europa.eu` | HTTP 200 |
| Alle 61 angefragten eForms-Felder von TED akzeptiert | ja |
| Health-Check gegen die Live-API | erreichbar, 315 Bekanntmachungen im 14-Tage-Fenster |
| Live-Lauf: 50 echte Bekanntmachungen abgebildet | 50 ok, 0 fehlgeschlagen, keine Warnungen |
| Feldabdeckung im Live-Lauf | 50/50 Auftraggeber, 50/50 Branchen, 49/50 Bundesland, 36/50 Angebotsfrist |
| Vollständiger Pipeline-Lauf gegen den In-Memory-Store | 40 Ausschreibungen, 38 entdoppelte Auftraggeber, 7 Zuschläge, 70 Lose, 80 Dokumente |
| Idempotenz | Lauf 1: 40 importiert · Lauf 2: 40 übersprungen |
| 300 echte Bekanntmachungen gegen die SQL-Constraints aus `0004_tenders.sql` | keine Verstöße (Spaltenlängen, Enums, Eindeutigkeit, Wertebereiche) |
| Migrationsprüfung (`npm run db:validate`) | bestanden, 17 Migrationen |

### 17.6 Offene Punkte

1. **Kein Scheduler.** Läufe werden über `npm run ingest:ted` oder den
   Import-Endpunkt angestoßen. Ein Cron-Job ist noch einzurichten.
2. **Kein Dokumenten-Download.** Abgebildet werden die TED-Renditionen
   (PDF, eForms-XML) als Metadaten; die eigentlichen Vergabeunterlagen liegen
   auf dem Portal des Auftraggebers und gehören in die Dokumentenphase.
3. **Eignungskriterien fehlen.** Sie stehen nicht in der Suchantwort; dafür
   wäre die eForms-XML-Rendition auszuwerten.
4. **Nur ein Zuschlag je Ausschreibung.** Das gemeinsame Modell trägt
   `award` einfach; Bekanntmachungen mit mehreren vergebenen Losen sind über
   `source_extras` und die Rohdaten weiterhin vollständig.
5. **Dublettenerkennung über Quellen hinweg** wird erst interessant, wenn eine
   zweite Quelle dieselben Vergaben meldet — die Metadaten laufen bereits mit.

### 17.7 Nächste sinnvolle Schritte

1. Scheduler für den regelmäßigen Import einrichten.
2. Zweite Quelle (Bund) ergänzen und die Dublettenerkennung scharf schalten.
3. RPC-Funktion für die Volltext-Relevanzsortierung (offener Punkt aus 12.4).
