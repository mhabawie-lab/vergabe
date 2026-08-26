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

## 10. Eigene Kunden- und Referenzdaten

Diese Regeln gelten dauerhaft, nicht nur für Phase 2.

- **Eigene Geschäftskunden und öffentliche Auftraggeber sind getrennte
  Domänen.** `contracting_authorities` stammen aus Vergabeverfahren und sind
  geteilte Referenzdaten; `business_clients` sind vertrauliche Geschäftsdaten
  einer Organisation. Sie werden niemals in einer Tabelle zusammengeführt.
  Analog: `awards` sind fremde Zuschläge, `reference_projects` eigene Projekte.
- **Alle privaten Geschäftsdaten tragen `organization_id`** und sind
  ausschließlich für Mitglieder dieser Organisation lesbar — anders als
  Ausschreibungsdaten, die jede angemeldete Person lesen darf.
- **Echte Kundendaten gehören niemals ins Repository** — nicht als Seed, nicht
  als Testdatei, nicht im Quellcode, nicht in Commit-Nachrichten. Nur
  anonymisierte Vorlagen mit erkennbar erfundenen Werten sind zulässig.
  Echte Daten gelangen ausschließlich über die geschützte Importfunktion in
  die Datenbank.
- **Rohdaten und normalisierte Daten bleiben getrennt.** Importierte
  Originalwerte (`raw_data`, `shift_summary_raw`) werden nie überschrieben;
  bereinigte Werte stehen daneben, nicht darüber.
- **Vermutete Schreibfehler sind Vorschläge, keine Korrekturen.** Es wird
  nichts ohne Benutzerbestätigung geändert, und unvollständige Angaben
  (Ort, Region, Land) werden nicht automatisch ergänzt.
- **Automatisch erkannte Leistungsarten sind Vorschläge.** Sie tragen
  `classification_source`, einen Konfidenzwert und `confirmed_by_user = false`.
  Ein unbestätigter Vorschlag zählt nicht als Nachweis und fließt weder in
  Suchprofil-Vorschläge noch in die Match-Engine ein.
- **Im Zweifel `unknown`.** Eine erfundene Leistungsart ist schädlicher als
  eine fehlende: Sie führt zu einer Bewerbung, deren Eignung sich nicht
  belegen lässt. Objektarten (z. B. `Datacenter`) sind keine Leistungsarten.
- **Änderungen an Kunden- und Referenzdaten werden im `audit_log`
  protokolliert** — mit Metadaten, nie mit dem Dateninhalt selbst.

Details: `docs/data-protection.md`.

## 11. Subunternehmer-Radar (Partnerdaten)

Diese Regeln gelten dauerhaft.

- **Es entsteht keine öffentliche Partnerbörse.** Fremde Unternehmen erhalten
  keine Benutzerkonten, keine öffentlichen Profile, keine Möglichkeit,
  Gesuche zu veröffentlichen oder Bewerbungen einzureichen, und keinen
  Einblick in interne Daten. `partner_companies` sind Notizen *einer*
  Organisation über Dritte.
- **Beide Beziehungsrichtungen bleiben getrennt.** „Kann für uns arbeiten" und
  „sucht selbst Subunternehmer" werden nie auseinander abgeleitet. Ein Signal
  ändert die gespeicherte Richtung nicht automatisch.
- **Ein Signal ist eine Beobachtung, keine Tatsache.** Es trägt zwingend eine
  Quellenangabe und eine Konfidenz und wird in der Oberfläche nie als
  bestätigter Fakt dargestellt.
- **Nur bestätigte Angaben zählen.** Eine Selbstauskunft wird festgehalten und
  ist kein Nachweis. Ein abgelaufener oder ungeprüfter Nachweis gilt nicht als
  erfüllt, und ein Ablaufdatum wird nie geschätzt.
- **Verfügbarkeit altert.** Ohne Bestätigung innerhalb von sechs Wochen gilt
  eine Angabe als unbekannt, nicht als ihr alter Wert.
- **Preise und Dokumente sind besonders vertraulich.** Konditionen erfordern
  `subcontractors:financial`, Dokumente `subcontractors:documents`. Dokumente
  liegen in privaten Buckets ohne öffentliche URL; der Zugriff erfolgt nur über
  kurzlebige signierte Links. Beträge und Notiztexte gehören nie ins
  `audit_log`.
- **Interne Bewertungen sind subjektiv** und werden überall als solche
  gekennzeichnet.
- **Match Scores sind erklärbare Hilfsmittel, keine Vergabeentscheidung.** Sie
  sind deterministisch, zeigen jede Teilbewertung mit Begründung und speichern
  ihre Regelversion. Fehlende Angaben werden als fehlend ausgewiesen, nie als
  positiv gewertet.
- **Die Nachunternehmerkette bleibt vollständig.** Ein später gesperrter Partner
  verschwindet nicht aus einer bestehenden Kette. Kreise und Ketten über sechs
  Ebenen werden verhindert.
- **Keine Premiumdaten ohne Lizenz**, keine Orbis-/Moody's-Übernahme, kein
  automatisches Web-Scraping. Öffentliche Kennungen werden ausschließlich als
  Quellenhinweis gespeichert.
- **Echte Partnerdaten gehören nicht ins Repository** — dieselbe Regel wie für
  Kundendaten.

Details: `docs/subcontractor-radar.md`, `docs/match-score.md`,
`docs/permissions.md`.

## 12. Infrastruktur, Umgebung und Dokumentenspeicher

Diese Regeln gelten dauerhaft.

- **Kein stiller Rückfall auf einen anderen Datenspeicher.** `DATA_BACKEND`
  wählt ausdrücklich zwischen `supabase` und `memory`. Fehlt bei `supabase` die
  Konfiguration, ist das ein Fehler; `memory` ist in der Produktion unzulässig.
  Ein Supabase-Fehler wird als Fehler sichtbar — nie als leeres Ergebnis, nie
  durch ein `catch`, das den Speicher wechselt.
- **Geheimnisse sind an der Import-Zeile erkennbar.** Browsersichere Werte
  stehen in `src/lib/env/public.ts`, Geheimnisse ausschließlich im
  `server-only`-Modul. Der Secret Key erreicht nie eine Client-Komponente, nie
  eine API-Antwort, nie ein Log.
- **Uploads und Downloads laufen mit der Sitzung der angemeldeten Person**,
  nicht mit dem Secret Key. So gelten die Storage-Policies auch dann, wenn die
  Anwendung sich irrt.
- **Dokumente liegen ausschließlich in privaten Buckets.** Es gibt keine
  öffentliche Objekt-URL. Downloads laufen über kurzlebige signierte Links, die
  nirgends gespeichert werden — nicht in der Datenbank, nicht im `audit_log`,
  nicht im Log.
- **Der Objektpfad beginnt mit der `organization_id`.** Darauf setzen die
  Storage-Policies auf. Ein Objekt ohne dieses Präfix ist für niemanden lesbar.
- **Keine vorgetäuschte Schadsoftwareprüfung.** Solange kein Scanner
  angebunden ist, bleibt `scan_status` auf `not_scanned` und die Oberfläche
  sagt „nicht geprüft" — nie „geprüft" oder „sicher".
- **Der Originalname einer Datei bleibt erhalten.** Der bereinigte Name ist
  der Objektschlüssel, keine Umbenennung.
- **Archivieren ist der Normalfall, Löschen die Ausnahme** und braucht eine
  eigene, engere Berechtigung.
- **Keine öffentliche Selbstregistrierung.** Das Onboarding legt genau eine
  erste Organisation für einen bereits angemeldeten Benutzer an; fremde Firmen
  bekommen keine Konten (§ 11).
- **Die Organisation stammt aus der Sitzung, nie aus dem Request.** Eine fremde
  Kennung erscheint als „nicht gefunden", nicht als „kein Zugriff".
- **Migrationen werden nie nachträglich umgeschrieben.** Ein Fehler in einer
  bereits veröffentlichten Migration wird durch eine neue, additive Migration
  korrigiert. `supabase db reset` läuft nie gegen ein entferntes Projekt.
- **Jede Datenbankfunktion setzt `search_path`**; `security definer` nur mit
  hinterlegter Begründung in `scripts/validate-migrations.mjs`.
- **CI kommt ohne Zugangsdaten aus** und wendet keine Migration auf eine
  entfernte Datenbank an. Ein Pull Request verändert kein Schema.

---

## 13. Arbeitsweise

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
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=                  # nur serverseitig, umgeht RLS
SUPABASE_PROJECT_REF=                 # nur serverseitig
DATABASE_URL=                         # nur serverseitig
DATA_BACKEND=                         # supabase | memory
STORAGE_SIGNED_URL_TTL_SECONDS=       # Standard 300
INGESTION_TRIGGER_SECRET=             # nur serverseitig
ANTHROPIC_API_KEY=                    # nur serverseitig, KI-Analyse
```

Die früheren Namen `NEXT_PUBLIC_SUPABASE_ANON_KEY` und
`SUPABASE_SERVICE_ROLE_KEY` werden als Übergang weiter gelesen — mit einer
Warnung, die nur den Namen nennt, nie den Wert. Vollständige Liste:
`docs/environment-variables.md`.
