# Phase 4 — Abschlussbericht

Supabase-Datenbank, Authentifizierung und privater Dokumentenspeicher.
Ohne Zugangsdaten zu einem echten Projekt; alles, was ohne sie möglich war,
ist umgesetzt und geprüft. Was Zugangsdaten braucht, steht in § 9.

---

## 1. Werkzeuge

* Supabase CLI **2.115.0** als `devDependency` — keine undokumentierte globale
  Installation, gleiche Version für alle.
* `supabase/config.toml` versioniert. Geheimnisse ausschließlich als
  `env(...)`-Verweis. Lokal gehärtet: Mindestpasswortlänge 12, Buchstaben und
  Ziffern gefordert, anonyme Anmeldungen aus.
* Skripte: `supabase:start|stop|status|migrations|types|reset|test`,
  `db:validate`, `db:test`. `npm run verify` = Typen + Lint + Tests +
  Migrationsprüfung + Build.

## 2. Umgebung und Backendwahl

* `src/lib/env/public.ts` (browsersicher) und `src/lib/env/server.ts`
  (`server-only`) getrennt; `src/lib/env.ts` bleibt die Serverfassade.
* Aktuelle Namen: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `DATABASE_URL`,
  `DATA_BACKEND`, `STORAGE_SIGNED_URL_TTL_SECONDS`.
* Übergang: `NEXT_PUBLIC_SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY`
  werden weiter gelesen, mit einer Warnung, die nur den **Namen** nennt. Beide
  Werte werden nie gemeinsam protokolliert.
* `resolveBackend()` entscheidet **einmal**, protokolliert einmal und wirft,
  statt zurückzufallen: `supabase` ohne Konfiguration → Fehler; `memory` in der
  Produktion → unzulässig (Ausnahme nur über
  `ALLOW_MEMORY_BACKEND_IN_PRODUCTION`); keine Konfiguration in der Produktion
  → Startabbruch.
* Kein `catch` im Datenzugriff wechselt das Backend.

## 3. Datenbank

* 16 Migrationen, **41 Tabellen mit aktivierter RLS**, 20 Funktionen mit
  festgelegtem `search_path`.
* `0014` härtet vier ältere Funktionen — additiv, ohne eine veröffentlichte
  Datei umzuschreiben.
* `0015`: Dokumenttabellen, zusammengesetzte Mandantenschlüssel, drei private
  Buckets, zwölf Storage-Policies.
* `0016`: `create_first_organization` und `needs_onboarding`.
* `npm run db:validate` prüft statisch: Nummerierung, zerstörende Anweisungen,
  RLS-Abdeckung, `search_path`, `security definer`-Erlaubnisliste, dynamisches
  SQL aus Parametern. Bewertet wird die letzte Definition über alle
  Migrationen hinweg.

## 4. Authentifizierung und Organisation

* Drei Zustände statt zwei: anonym → `/login`, angemeldet ohne Organisation →
  `/onboarding`, angemeldet mit Organisation → Anwendung.
* `create_first_organization`: eine Transaktion für Organisation,
  Mitgliedschaft (`org_admin`) und Auditeintrag; Sperre gegen gleichzeitige
  Aufrufe; zweites Onboarding abgewiesen; für `anon` nicht ausführbar.
* Keine öffentliche Selbstregistrierung für fremde Firmen.
* Die Organisation stammt immer aus der Sitzung. Fremde Kennungen erscheinen
  als „nicht gefunden".

## 5. Dokumente

* Drei private Buckets (`reference-documents`, `partner-documents`,
  `organization-documents`), 25 MB, sechs erlaubte MIME-Typen.
* Pfad `<organization_id>/<entity_type>/<entity_id>/<uuid>-<datei>`;
  Originalname bleibt als Spalte erhalten.
* Upload prüft Berechtigung, Eigentümer, Größe, Typ **und** Endung; SHA-256
  wird gespeichert; ein fehlgeschlagener Metadatensatz räumt das Objekt wieder
  ab. Eine zu große Datei wird als Eingabefehler beantwortet, nicht als
  Serverfehler.
* Download nur über signierte Links (Standard 300 s), erzeugt mit der Sitzung
  des Aufrufers, nirgends gespeichert.
* Archivieren ist der Normalfall, Löschen braucht eine eigene Berechtigung;
  beides mit Auditeintrag aus Metadaten.
* **Keine vorgetäuschte Schadsoftwareprüfung:** `scan_status` bleibt
  `not_scanned`, die Oberfläche sagt „nicht geprüft" und ausdrücklich „nicht
  als sicher".

## 6. Oberfläche

* Dokumentbereich auf Referenzprojekt, Partnerfirma und Unternehmensprofil —
  eine gemeinsame Komponente, keine Varianten.
* `/administration/infrastructure`: Backend und Begründung, Prüfungen,
  erwartete Buckets, Fähigkeiten des Dokumentspeichers, Hinweise zu veralteten
  Variablennamen — je Variable nur „gesetzt" oder „nicht gesetzt".
* `GET /api/health` antwortet mit `{status, backend}` und sonst nichts.

## 7. Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=high` | 0 Befunde |
| TypeScript (`tsc --noEmit`) | fehlerfrei |
| ESLint | fehlerfrei |
| Unit-Tests (vitest) | **302 bestanden**, 14 Dateien |
| SQL-/RLS-Tests | **103 Prüfungen** in 4 Skripten |
| Migrationsprüfung | bestanden (16 / 41 / 20) |
| Production Build | erfolgreich |
| Secret-Scan | keine Treffer |
| Öffentliche Storage-URL im Code | keine |
| Geheimnisnamen im Client-Bundle | keine |
| Browserlauf | **23 von 23 Schritten** |

Browserlauf (Chromium, erfundene Daten, DEMO-Backend): Dashboard,
DEMO-Kennzeichnung, Statusseite ohne Geheimwerte, Health-Endpunkt,
Onboarding-Weiterleitung, Unternehmensdokumente, ehrlicher Scan-Hinweis,
Upload, keine öffentliche Objekt-URL im Markup, Prüfstatus „nicht geprüft",
signierter Download (300 s), Archivieren, Ablehnung zu großer Datei, Ablehnung
unerlaubten Typs, Ablehnung fremder Organisation, Partner- und
Referenzdokumente, 390/834/1600 px ohne horizontalen Überlauf, dunkles
Farbschema, keine Konsolenfehler.

## 8. Dokumentation

`PROJECT_PLAN.md` (Kapitel 16), `CLAUDE.md` (§ 12, dauerhafte Regeln),
`README.md`, `.env.example`, `docs/infrastructure-audit.md`,
`docs/supabase-setup.md`, `docs/supabase-one-time-setup.md`,
`docs/environment-variables.md`, `docs/database-migrations.md`,
`docs/rls-security.md`, `docs/private-storage.md`, `docs/document-upload.md`,
`docs/deployment.md` und dieser Bericht.

## 9. Nachtrag: Anwendung auf das echte Projekt

Nach Abschluss der Phase wurden Zugangsdaten bereitgestellt und die
Infrastruktur auf dem echten Supabase-Projekt eingerichtet. Details:
`docs/live-verification.md`.

Kurz: alle 16 Migrationen angewendet, 41 Tabellen mit RLS, drei private
Buckets, zwölf Storage-Policies, alle vier SQL-Suiten gegen die Instanz
bestanden, Datenbanktypen erzeugt (`src/types/database.ts`), erste
Organisation über das Onboarding angelegt, Upload und signierter Download mit
echter Benutzersitzung geprüft, Selbstregistrierung deaktiviert.

Dabei gefunden und behoben: `/api/health` wurde von der Middleware zur
Anmeldung umgeleitet, sobald Supabase konfiguriert war — eine
Deployment-Probe hat keine Sitzung und hätte jede Prüfung als Ausfall
gemeldet.

## 10. Weiterhin offen

1. **Kein Virenscanner angebunden.** `scan_status` bleibt `not_scanned`.
2. **Keine Einladungsfunktion** für weitere Mitglieder; bis dahin über das
   Supabase-Dashboard.
3. **Keine Dokumentoberfläche am Kunden** (`business_client`) — Datenmodell
   und API tragen sie bereits.
4. **Kein Browserlauf gegen die echte Instanz**: der Browser dieser
   Arbeitsumgebung hat keinen Netzzugang nach außen. Die Oberfläche ist gegen
   den lokalen Speicher geprüft, die Server-, Datenbank- und Storage-Pfade
   gegen das echte Projekt.
5. **Kein automatisches Deployment und keine Migration aus CI heraus.**

## 11. Nicht begonnen

Unternehmensradar, Orbis, GLEIF, TED/eForms, Handelsregister, Vergabeportale
und automatische Websuche — wie vereinbart.
