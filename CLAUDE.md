# CLAUDE.md — Verbindliche Regeln für SicherVergabe

Diese Datei enthält die **verbindlichen** Architektur- und Entwicklungsregeln
für dieses Projekt. Sie gilt für alle zukünftigen Arbeiten. Details zur
Planung stehen in `PROJECT_PLAN.md`.

---

## Projektüberblick

SicherVergabe ist eine Plattform für öffentliche und private Ausschreibungen.
Sie sammelt Ausschreibungen aus vielen Quellen, vereinheitlicht sie,
analysiert sie mit KI und bewertet ihre Relevanz (Match Score 0–100 %,
GO/PRÜFEN/NO-GO).

**Stack:** Next.js (App Router), TypeScript strict, Tailwind CSS,
PostgreSQL via Supabase, Supabase Auth, Supabase Storage.

---

## 1. Architektur-Pipeline (nicht verhandelbar)

```
SOURCE → CONNECTOR → RAW IMPORT → NORMALIZER → DATABASE
       → DOCUMENT PROCESSING → AI ANALYSIS → MATCH ENGINE → UI
```

- **Keine externe Datenquelle darf direkt mit der UI gekoppelt werden.**
  UI-Code ruft niemals ein externes Vergabeportal, eine externe API oder
  einen Scraper auf. Die UI liest ausschließlich normalisierte Daten aus
  der eigenen Datenbank.
- Jede Stufe kennt nur die Schnittstelle der vorherigen Stufe, nicht deren
  Implementierung.
- Jede Stufe muss unabhängig erneut ausführbar sein (Reprocessing), ohne
  vorherige Stufen erneut aufzurufen.
- Connector-Code enthält keine Business-Logik und kein Mapping in das
  interne Schema — das gehört ausschließlich in den Normalizer.

## 2. Rohdaten & Normalisierung

- **Originaldaten externer Quellen müssen unverändert erhalten bleiben.**
  Rohpayloads werden in `raw_imports` gespeichert und nie überschrieben
  oder editiert.
- **Original-Quelle und Original-ID müssen immer intern gespeichert
  werden** (`source_id`, `external_id`) — bei jeder Ausschreibung, jedem
  Dokument, jedem Auftraggeber-Datensatz.
- Alle Quellen werden anschließend in **ein gemeinsames internes
  Ausschreibungsformat** überführt. Quellenspezifische Sonderfelder gehören
  in ein dediziertes `jsonb`-Feld, nicht in neue quellenspezifische Spalten.
- **Dubletten** zwischen verschiedenen Vergabequellen müssen erkennbar
  bleiben: Deduplizierungs-Metadaten (`payload_hash`, `dedupe_group_id`,
  `tender_duplicate_candidates`) werden von Anfang an mitgeführt.

## 3. Connectors

- Jeder Connector ist ein eigenes Modul unter
  `src/modules/connectors/sources/<quelle>/`.
- Jeder Connector muss unabhängig **hinzufügbar, aktivierbar,
  deaktivierbar und überwachbar** sein.
- Aktivierung/Deaktivierung erfolgt über Daten (`sources.is_active`),
  nicht über Code-Änderungen oder Deployments.
- Jeder Connector-Lauf wird protokolliert (`connector_runs`): Start, Ende,
  Anzahl gefundener/importierter Datensätze, Fehler.
- Ein fehlerhafter Connector darf andere Connectors und die UI niemals
  blockieren — isolierte Ausführung, Fehlerbehandlung pro Connector,
  Retry mit exponentiellem Backoff.
- Rate-Limits und Timeouts sind je Quelle konfigurierbar.

## 4. Daten-Integrität & Demo-Daten

- **Keine Fake-Ausschreibungen dürfen als echte Live-Daten dargestellt
  werden.**
- Demo-/Testdaten tragen zwingend das Flag `is_demo = true` und werden in
  der UI mit einem eindeutig sichtbaren **DEMO**-Badge gekennzeichnet.
- Demo-Daten und Live-Daten sind in Abfragen und in der UI klar trennbar.
- Erfundene Ausschreibungsdaten dürfen niemals ohne DEMO-Kennzeichnung in
  die Datenbank geschrieben werden.

## 5. Sicherheit & Secrets

- **Keine API Keys, Tokens oder Zugangsdaten im Source Code.** Niemals.
- Secrets ausschließlich über **Environment Variables**; `.env.example`
  dokumentiert benötigte Variablen ohne echte Werte.
- `.env*`-Dateien (außer `.env.example`) gehören in `.gitignore`.
- Service-Role-Keys von Supabase werden ausschließlich serverseitig
  verwendet, nie im Client-Bundle (`NEXT_PUBLIC_*` nur für unkritische Werte).
- Row Level Security (RLS) ist für **alle** Tabellen aktiv. Autorisierung
  wird zusätzlich serverseitig in API-Routen geprüft.
- Sicherheitsrelevante Aktionen (Login, Rollenänderung, Admin-Aktionen,
  Datenexport) werden in `audit_log` protokolliert.
- Eingaben werden an Systemgrenzen validiert (Zod), nie ungeprüft in
  Queries übernommen. Keine String-Konkatenation für SQL.

## 6. Code-Qualität

- **TypeScript strict** ist verpflichtend. Kein `any` ohne begründeten,
  dokumentierten Ausnahmefall.
- Saubere, modulare Architektur: Domänenlogik in `src/modules/`,
  UI-Komponenten in `src/components/`, geteilte Infrastruktur in `src/lib/`.
- **Wiederverwendbare Komponenten**: UI-Primitives in `components/ui/`,
  keine duplizierten Varianten derselben Komponente.
- Domänenlogik gehört nicht in React-Komponenten und nicht in Route
  Handler — Route Handler orchestrieren nur.
- **Responsive** für Desktop, Tablet und Smartphone — Mobile-First mit
  Tailwind-Breakpoints, jede neue Ansicht wird auf allen drei Größen geprüft.
- Deutsch als UI-Sprache; Code, Bezeichner und Kommentare auf Englisch.

## 7. Datenbank

- **Jede Datenbankänderung erfolgt über eine Migration** in
  `supabase/migrations/`. Keine manuellen Änderungen im Supabase-Dashboard,
  die nicht als Migration existieren.
- Migrationen sind additiv und rückwärtskompatibel, wo möglich.
- Indizes für Suchfelder (Volltext `tsvector`, CPV-Codes, Fristen,
  Auftraggeber) werden zusammen mit den Tabellen angelegt.
- Zeitstempel (`created_at`, `updated_at`) und `is_demo` gehören zum
  Standard-Tabellenlayout, wo fachlich sinnvoll.

## 8. Fehlerbehandlung & Logging

- Fehlerbehandlung und Logging werden **von Anfang an** mitgedacht, nicht
  nachträglich ergänzt.
- Strukturiertes Logging (`src/lib/logging/`) mit Kontext:
  Connector, Quelle, Run-ID, Ausschreibungs-ID.
- Fehler werden nicht stillschweigend verschluckt. Fehlerklassen in
  `src/lib/errors/`, einheitliches API-Fehlerformat.
- Keine Secrets, keine personenbezogenen Daten in Logausgaben.
- Ingestion-Fehler machen den Zustand sichtbar (Status in
  `connector_runs`/`normalization_runs`), statt lautlos zu scheitern.

## 9. KI-Integration

- KI wird ausschließlich über den Provider-Layer in
  `src/modules/ai/provider/` angesprochen — nie direkt aus UI-Code oder
  Komponenten.
- Jede KI-Antwort wird mit Modellversion, Prompt-Version und Rohantwort
  gespeichert, damit Ergebnisse nachvollziehbar und reproduzierbar sind.
- KI-Ergebnisse werden in der UI als KI-generiert gekennzeichnet und nicht
  als verbindliche Rechtsauskunft dargestellt.
- Match Score und GO/PRÜFEN/NO-GO müssen immer eine nachvollziehbare
  Begründung mitliefern.

## 10. Arbeitsweise

- Vor größeren Änderungen: `PROJECT_PLAN.md` prüfen und bei Bedarf
  aktualisieren.
- Keine Implementierung über den vereinbarten Phasenumfang hinaus.
- Keine spekulativen Abstraktionen für hypothetische Anforderungen.
- Änderungen werden mit klaren, beschreibenden Commit-Messages committet.

---

## Umgebungsvariablen (Übersicht)

Werte gehören in `.env.local` (lokal) bzw. in die Deployment-Umgebung —
**niemals** ins Repository.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # nur serverseitig
DATABASE_URL=                    # nur serverseitig
ANTHROPIC_API_KEY=               # nur serverseitig, KI-Analyse
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
