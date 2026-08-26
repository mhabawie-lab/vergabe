# SicherVergabe

Intelligente Plattform für öffentliche und private Ausschreibungen. Sammelt
Ausschreibungen aus vielen Quellen, überführt sie in ein gemeinsames internes
Format, reichert sie an und bewertet ihre Relevanz.

**Aktueller Stand: Phase 4 abgeschlossen** — Supabase-Infrastruktur:
ausdrückliche Backendwahl ohne stille Rückfälle, Onboarding der ersten
Organisation, drei private Dokumenten-Buckets mit signierten Downloads,
automatisierte RLS- und Storage-Prüfungen, CI. Davor: Subunternehmer-Radar,
eigene Kunden und Referenzprojekte. Als Ausschreibungsquelle ist weiterhin
ausschließlich die DEMO-Quelle angebunden; Live-Quellen (TED / EU eForms,
deutsche Bundes-, Landes- und Kommunalportale) folgen später.

- Architektur, Datenmodell und Phasenplan: [`PROJECT_PLAN.md`](./PROJECT_PLAN.md)
- Verbindliche Entwicklungsregeln: [`CLAUDE.md`](./CLAUDE.md)

Anleitungen:

| Thema | Datei |
|---|---|
| Kunden anlegen und pflegen | [`docs/customers.md`](./docs/customers.md) |
| Subunternehmer-Radar | [`docs/subcontractor-radar.md`](./docs/subcontractor-radar.md) |
| Match Score | [`docs/match-score.md`](./docs/match-score.md) |
| Rollen und Berechtigungen | [`docs/permissions.md`](./docs/permissions.md) |
| Partnerimport | [`docs/partner-import.md`](./docs/partner-import.md) |
| Referenzdaten importieren | [`docs/reference-import.md`](./docs/reference-import.md) |
| Datenbank einrichten und prüfen | [`docs/supabase-setup.md`](./docs/supabase-setup.md) |
| Supabase-Projekt erstmalig einrichten | [`docs/supabase-one-time-setup.md`](./docs/supabase-one-time-setup.md) |
| Umgebungsvariablen | [`docs/environment-variables.md`](./docs/environment-variables.md) |
| Migrationen | [`docs/database-migrations.md`](./docs/database-migrations.md) |
| Row Level Security | [`docs/rls-security.md`](./docs/rls-security.md) |
| Privater Dokumentenspeicher | [`docs/private-storage.md`](./docs/private-storage.md) |
| Dokumente hochladen | [`docs/document-upload.md`](./docs/document-upload.md) |
| Deployment | [`docs/deployment.md`](./docs/deployment.md) |
| Infrastruktur-Audit | [`docs/infrastructure-audit.md`](./docs/infrastructure-audit.md) |
| Einrichtung auf dem echten Projekt | [`docs/live-verification.md`](./docs/live-verification.md) |
| Datenschutz und Datenhaltung | [`docs/data-protection.md`](./docs/data-protection.md) |
| Datenbankschema | [`docs/database-schema.md`](./docs/database-schema.md) |

---

## Schnellstart

```bash
npm install
npm run dev
```

Die Anwendung ist dann unter <http://localhost:3000> erreichbar.

Ohne Supabase-Zugangsdaten startet SicherVergabe im **lokalen DEMO-Modus**:
Die vollständige Ingestion-Pipeline läuft beim ersten Seitenaufruf durch und
schreibt in einen prozessinternen Speicher statt nach PostgreSQL. Es ist keine
Anmeldung nötig, und jeder Datensatz ist als DEMO gekennzeichnet.

Das gilt **nur in der Entwicklung**. In der Produktion bricht der Start ab,
wenn Supabase nicht konfiguriert ist — es gibt keinen stillen Rückfall auf den
flüchtigen Speicher. Mit `DATA_BACKEND` wird die Wahl ausdrücklich getroffen
(`docs/environment-variables.md`).

## Skripte

| Befehl                | Zweck                                                  |
|-----------------------|--------------------------------------------------------|
| `npm run dev`         | Entwicklungsserver                                     |
| `npm run build`       | Produktions-Build                                      |
| `npm run start`       | Produktionsserver                                      |
| `npm run typecheck`   | TypeScript ohne Emit                                   |
| `npm run lint`        | ESLint                                                 |
| `npm run test`        | Vitest                                                 |
| `npm run db:validate` | Statische Prüfung aller Migrationen                    |
| `npm run db:test`     | SQL- und RLS-Tests (braucht `DATABASE_URL`)            |
| `npm run verify`      | Typecheck + Lint + Test + Migrationsprüfung + Build     |
| `npm run ingest:demo` | Importiert die DEMO-Quelle über die komplette Pipeline |
| `npm run supabase:*`  | Supabase-CLI: `start`, `stop`, `status`, `migrations`, `types` |

## Konfiguration

Alle Secrets kommen ausschließlich aus Umgebungsvariablen — niemals aus dem
Quellcode. `.env.example` dokumentiert die benötigten Variablen; die realen
Werte gehören in `.env.local` (nicht versioniert).

```bash
cp .env.example .env.local
```

| Variable                        | Zweck                                              |
|---------------------------------|----------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`                | Supabase-Projekt-URL (öffentlich)                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Browser-Schlüssel, unterliegt Row Level Security |
| `SUPABASE_SECRET_KEY`                     | Nur serverseitig; umgeht RLS, nur für den Import  |
| `DATA_BACKEND`                            | `supabase` oder `memory`, ohne stillen Rückfall  |
| `STORAGE_SIGNED_URL_TTL_SECONDS`          | Laufzeit signierter Downloads, Standard 300      |
| `INGESTION_TRIGGER_SECRET`                | Schützt `/api/v1/internal/*`                      |
| `ANTHROPIC_API_KEY`                       | Erst ab Phase 5 relevant, aktuell ungenutzt      |
| `LOG_LEVEL`                               | `debug` \| `info` \| `warn` \| `error`           |

Die früheren Namen `NEXT_PUBLIC_SUPABASE_ANON_KEY` und
`SUPABASE_SERVICE_ROLE_KEY` werden als Übergang weiter gelesen — mit einer
Warnung, die nur den Namen nennt, nie den Wert. Vollständige Liste:
[`docs/environment-variables.md`](./docs/environment-variables.md).

## Datenbank

Jede Schemaänderung erfolgt über eine Migration in `supabase/migrations/`.
Manuelle Änderungen im Supabase-Dashboard sind nicht zulässig.

```bash
npx supabase db push      # Migrationen anwenden
npm run db:validate       # statische Prüfung, ohne Datenbank
```

Reihenfolge der Migrationen:

1. `0001_init_extensions.sql` — Extensions, Trigger-Funktion, Enums
2. `0002_identity.sql` — Organisationen, Profile, Rollen, RLS-Helfer
3. `0003_ingestion.sql` — Quellen, Connector-Läufe, Rohdaten
4. `0004_tenders.sql` — Ausschreibungen, Auftraggeber, Lose, Dokumente, Zuschläge
5. `0005_workspace.sql` — Unternehmensprofil, Favoriten, Suchprofile, Audit-Log
6. `0006_register_demo_source.sql` — DEMO-Quelle plus Schutz-Trigger
7. `0007_business_clients.sql` — eigene Kunden und Referenzprojekte
8. `0008_reference_rls_audit.sql` — RLS und Audit für Referenzdaten
9. `0009_service_confirmation.sql` — Bestätigungszustand der Leistungsarten
10. `0010_reference_search_rpc.sql` — serverseitige Referenzsuche
11. `0011_partner_companies.sql` — Subunternehmer-Radar
12. `0012_partner_rls_audit.sql` — RLS, Audit und Schutzmechanismen
13. `0013_partner_search_rpc.sql` — serverseitige Partnersuche
14. `0014_harden_function_search_path.sql` — `search_path` für vier ältere Funktionen
15. `0015_document_storage.sql` — Dokumenttabellen, drei private Buckets, Storage-Policies
16. `0016_organization_onboarding.sql` — erste Organisation für neue Benutzer

Ohne Supabase-Zugangsdaten lassen sich Schema und Suchfunktion gegen ein
lokales PostgreSQL prüfen — siehe [`docs/supabase-setup.md`](./docs/supabase-setup.md).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/setup/local-platform-shim.sql
DATABASE_URL="$DATABASE_URL" npm run db:test
```

## Import ausführen

```bash
# Lokal über die CLI
npm run ingest:demo

# Oder per HTTP (z. B. aus einem Scheduler)
curl -X POST http://localhost:3000/api/v1/internal/ingestion/run \
  -H "Authorization: Bearer $INGESTION_TRIGGER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"demo"}'
```

Der Import ist idempotent: Ein unveränderter Datensatz wird anhand seines
Payload-Hashes erkannt und übersprungen.

## Architektur in einem Satz

```
SOURCE → CONNECTOR → RAW IMPORT → NORMALIZER → DATABASE
       → DOCUMENT PROCESSING → AI ANALYSIS → MATCH ENGINE → UI
```

Keine externe Datenquelle ist mit der Benutzeroberfläche gekoppelt. Ein neuer
Connector wird als eigenes Modul unter `src/modules/connectors/sources/`
ergänzt, zusammen mit einem Mapper unter
`src/modules/ingestion/normalizer/mappers/`. Weder die Oberfläche noch das
zentrale Datenmodell müssen dafür angefasst werden.
