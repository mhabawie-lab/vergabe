# SicherVergabe

Intelligente Plattform für öffentliche und private Ausschreibungen. Sammelt
Ausschreibungen aus vielen Quellen, überführt sie in ein gemeinsames internes
Format, reichert sie an und bewertet ihre Relevanz.

**Aktueller Stand: Phase 2 abgeschlossen** — eigene Kunden, Referenzprojekte
und deren Import. Als Ausschreibungsquelle ist weiterhin ausschließlich die
DEMO-Quelle angebunden; Live-Quellen (TED / EU eForms, deutsche Bundes-,
Landes- und Kommunalportale) folgen später.

- Architektur, Datenmodell und Phasenplan: [`PROJECT_PLAN.md`](./PROJECT_PLAN.md)
- Verbindliche Entwicklungsregeln: [`CLAUDE.md`](./CLAUDE.md)

Anleitungen:

| Thema | Datei |
|---|---|
| Kunden anlegen und pflegen | [`docs/customers.md`](./docs/customers.md) |
| Referenzdaten importieren | [`docs/reference-import.md`](./docs/reference-import.md) |
| Datenbank einrichten und prüfen | [`docs/supabase-setup.md`](./docs/supabase-setup.md) |
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

## Skripte

| Befehl                | Zweck                                                  |
|-----------------------|--------------------------------------------------------|
| `npm run dev`         | Entwicklungsserver                                     |
| `npm run build`       | Produktions-Build                                      |
| `npm run start`       | Produktionsserver                                      |
| `npm run typecheck`   | TypeScript ohne Emit                                   |
| `npm run lint`        | ESLint                                                 |
| `npm run test`        | Vitest                                                 |
| `npm run verify`      | Typecheck + Lint + Test + Build in einem Durchlauf      |
| `npm run ingest:demo` | Importiert die DEMO-Quelle über die komplette Pipeline |

## Konfiguration

Alle Secrets kommen ausschließlich aus Umgebungsvariablen — niemals aus dem
Quellcode. `.env.example` dokumentiert die benötigten Variablen; die realen
Werte gehören in `.env.local` (nicht versioniert).

```bash
cp .env.example .env.local
```

| Variable                        | Zweck                                              |
|---------------------------------|----------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase-Projekt-URL (öffentlich)                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon-Key, unterliegt Row Level Security            |
| `SUPABASE_SERVICE_ROLE_KEY`     | Nur serverseitig; umgeht RLS, nur für den Import   |
| `INGESTION_TRIGGER_SECRET`      | Schützt `/api/v1/internal/*`                        |
| `ANTHROPIC_API_KEY`             | Erst ab Phase 3 relevant, aktuell ungenutzt        |
| `LOG_LEVEL`                     | `debug` \| `info` \| `warn` \| `error`             |

## Datenbank

Jede Schemaänderung erfolgt über eine Migration in `supabase/migrations/`.
Manuelle Änderungen im Supabase-Dashboard sind nicht zulässig.

```bash
supabase db push          # Migrationen anwenden
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

Ohne Supabase-Zugangsdaten lassen sich Schema und Suchfunktion gegen ein
lokales PostgreSQL prüfen — siehe [`docs/supabase-setup.md`](./docs/supabase-setup.md).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reference-search.sql
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
