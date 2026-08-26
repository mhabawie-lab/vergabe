# Deployment

Was eine Umgebung braucht, in welcher Reihenfolge sie aufgebaut wird und was
bewusst **nicht** automatisch passiert.

---

## 1. Umgebungen

| Umgebung | Backend | Datenbank | Zweck |
| --- | --- | --- | --- |
| lokal | `memory` | keine | Oberfläche und Domänenlogik ohne Zugangsdaten |
| lokal mit DB | `supabase` | lokale Instanz oder Entwicklungsprojekt | Migrationen, RLS, Storage |
| Staging | `supabase` | eigenes Projekt | Vorabprüfung mit erfundenen Daten |
| Produktion | `supabase` | eigenes Projekt | echte Daten |

Staging und Produktion teilen sich **niemals** eine Datenbank. Echte Kunden-,
Partner- oder Projektdaten existieren ausschließlich in der Produktion und
gelangen nur über die geschützte Importfunktion dorthin (`CLAUDE.md` § 10).

---

## 2. Variablen je Umgebung

Pflicht in Staging und Produktion:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY            # nur Server
DATA_BACKEND=supabase
```

Empfohlen: `SUPABASE_PROJECT_REF`, `STORAGE_SIGNED_URL_TTL_SECONDS`,
`INGESTION_TRIGGER_SECRET`, `LOG_LEVEL=info`.

Vollständige Liste: `docs/environment-variables.md`.

**`DATA_BACKEND=memory` ist in der Produktion unzulässig.** Der Start bricht
ab, außer `ALLOW_MEMORY_BACKEND_IN_PRODUCTION=true` ist ausdrücklich gesetzt —
was nur für eine bewusst datenlose Demo-Instanz sinnvoll ist. Fehlt die
Supabase-Konfiguration in der Produktion ganz, bricht der Start ebenfalls ab.
Eine Produktionsumgebung, die still auf einen flüchtigen Speicher zurückfällt,
verliert Daten, ohne dass es jemandem auffällt.

---

## 3. Reihenfolge beim Ausrollen

1. Migrationen anwenden (`npx supabase db push` gegen das Projekt der
   Zielumgebung, oder `psql` mit `DATABASE_URL`).
2. Buckets und Policies prüfen (`docs/supabase-one-time-setup.md` § 5).
3. Variablen setzen.
4. Anwendung deployen.
5. `/api/health` abfragen und `/administration/infrastructure` ansehen.

Migrationen sind additiv und rückwärtskompatibel, also ist die Reihenfolge
„erst Datenbank, dann Anwendung" sicher: die alte Anwendungsversion läuft
gegen das neue Schema weiter.

---

## 4. Was CI **nicht** tut

`.github/workflows/ci.yml` prüft Typen, Lint, Tests, Build, Migrationen und
Secrets. Bewusst nicht:

* **Keine Migration gegen eine entfernte Datenbank.** Ein Pull Request darf
  ein Schema nicht verändern. Das Anwenden ist eine Entscheidung, kein
  Nebeneffekt eines Merges.
* **Keine Supabase-Secrets in CI.** Der Workflow läuft vollständig ohne
  Zugangsdaten — auch für einen Fork. Ein Workflow, der Produktionsgeheimnisse
  braucht, um Tests zu starten, gibt sie irgendwann preis.
* **Kein automatisches Deployment.**

Die SQL- und RLS-Tests laufen in CI gegen ein Wegwerf-PostgreSQL mit den
Plattform-Stellvertretern, nicht gegen ein Supabase-Projekt.

---

## 5. Gesundheitsprüfung

```
GET /api/health
```

Antwortet mit Statuscode und einem Objekt aus **nicht vertraulichen** Angaben:
gewähltes Backend, ob die Konfiguration vollständig ist, ob Storage verfügbar
ist, Anzahl der Migrationsdateien. Keine URLs, keine Schlüssel, keine
Projektkennungen, keine Zählungen echter Datensätze.

`/administration/infrastructure` zeigt dasselbe aufbereitet — für jede
Umgebungsvariable ausschließlich „gesetzt" oder „nicht gesetzt".

---

## 6. Rollback

* **Anwendung:** vorherige Version erneut ausrollen. Da Migrationen additiv
  sind, läuft sie gegen das aktuelle Schema.
* **Schema:** keine automatischen Down-Migrationen. Eine fehlerhafte Migration
  wird durch eine neue, korrigierende Migration behoben — so wie `0014` und
  `0015` es mit älteren Befunden gemacht haben. Eine bereits angewendete Datei
  wird nicht umgeschrieben.
* **Daten:** über die Backups des Supabase-Projekts. Vor einem größeren
  Schemaschritt in der Produktion ein Backup anstoßen und dessen Zeitpunkt
  notieren.
