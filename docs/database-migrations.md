# Migrationen

Jede Schemaänderung ist eine Datei in `supabase/migrations/`. Änderungen im
Supabase-Dashboard, die nicht als Migration existieren, sind nicht zulässig
(`CLAUDE.md` § 7).

---

## 1. Bestand

| Datei | Inhalt |
| --- | --- |
| `0001_init_extensions.sql` | Extensions, Enums, `set_updated_at` |
| `0002_identity.sql` | Organisationen, Profile, Mitgliedschaften, RLS-Helfer |
| `0003_ingestion.sql` | Quellen, Rohimporte, Connector- und Normalisierungsläufe |
| `0004_tenders.sql` | Ausschreibungen, Dokumente, Auftraggeber, Dubletten |
| `0005_workspace.sql` | Unternehmensprofil, Favoriten, Suchprofile, `audit_log` |
| `0006_register_demo_source.sql` | DEMO-Quelle |
| `0007_business_clients.sql` | Eigene Kunden und Referenzprojekte |
| `0008_reference_rls_audit.sql` | RLS und Auditprotokoll für Referenzdaten |
| `0009_service_confirmation.sql` | Bestätigungsstand erkannter Leistungsarten |
| `0010_reference_search_rpc.sql` | serverseitige Referenzsuche |
| `0011_partner_companies.sql` | Subunternehmer-Radar |
| `0012_partner_rls_audit.sql` | RLS und Auditprotokoll für Partnerdaten |
| `0013_partner_search_rpc.sql` | serverseitige Partnersuche |
| `0014_harden_function_search_path.sql` | `search_path` für vier ältere Funktionen |
| `0015_document_storage.sql` | Dokumenttabellen, drei private Buckets, Storage-Policies |
| `0016_organization_onboarding.sql` | erste Organisation für neue Benutzer |

Stand: 16 Migrationen, 41 Tabellen — alle mit aktivierter Row Level Security —
und 20 Funktionen mit festgelegtem `search_path`.

---

## 2. Regeln

* **Additiv.** `0014` und `0015` korrigieren Befunde aus älteren Migrationen,
  ohne eine veröffentlichte Datei zu ändern: eine bereits angewendete Migration
  wird nicht nachträglich umgeschrieben, sondern durch eine neue korrigiert.
* **Kein `drop table`, `drop column`, `drop schema`, `truncate`,
  `drop database`.** Die statische Prüfung lehnt das ab.
* **Fortlaufend nummeriert**, vierstellig, ohne Lücken und ohne Duplikate.
* **Jede neue Tabelle bekommt RLS** in derselben Migration.
* **Jede Funktion setzt `search_path`.** Ohne das kann ein Aufrufer mit einem
  eigenen Schema die Bedeutung eines unqualifizierten Namens verändern.
* **`security definer` nur mit Begründung.** Die Begründung steht in
  `scripts/validate-migrations.mjs`; eine nicht eingetragene Funktion lässt die
  Prüfung fehlschlagen.

---

## 3. Statische Prüfung

```bash
npm run db:validate
```

Prüft ohne Datenbank: Nummerierung, zerstörende Anweisungen, RLS-Abdeckung
jeder erzeugten Tabelle, `search_path` jeder Funktion, die `security
definer`-Erlaubnisliste und dynamisches SQL aus Parametern (`execute` mit
Verkettung). Die Prüfung bewertet die **letzte** Definition einer Funktion über
alle Migrationen hinweg — eine spätere `create or replace` heilt einen früheren
Befund, so wie es in der Datenbank auch der Fall ist.

Die Prüfung läuft in `npm run verify` und in CI mit.

---

## 4. Anwenden

### Gegen ein Supabase-Projekt

```bash
npx supabase link --project-ref <projekt-ref>
npx supabase migration list      # Abgleich lokal ↔ entfernt, ändert nichts
npx supabase db push
```

`supabase db push` wendet nur an, was entfernt noch fehlt.

> **`supabase db reset` niemals gegen ein entferntes Projekt.** Der Befehl
> verwirft die Datenbank. Er ist ausschließlich für die lokale Instanz gedacht;
> das Skript `npm run supabase:reset` läuft entsprechend nur lokal.

### Gegen ein lokales PostgreSQL

Ohne Docker gibt es keine lokale Supabase-Instanz. Für Schema-, RLS- und
Policy-Prüfungen genügt ein normales PostgreSQL ab Version 15 mit den
Plattform-Stellvertretern aus `supabase/setup/local-platform-shim.sql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/setup/local-platform-shim.sql
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Details und Grenzen dieses Stellvertreters: `docs/supabase-setup.md` § 2.

---

## 5. Typen aus dem Schema

```bash
npm run supabase:types      # supabase gen types typescript --local
```

Der Befehl braucht eine laufende lokale Supabase-Instanz (und damit Docker)
oder ein verknüpftes Projekt. Gegen ein gehostetes Projekt:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

`src/types/database.ts` ist aus dem angewendeten Schema erzeugt und wird nach
jeder weiteren Migration neu erzeugt. Von Hand geschriebene Typen hätten dort
nichts zu suchen: sie sähen wie eine Zusicherung aus, die niemand geprüft
hat.

---

## 6. SQL-Tests

```bash
DATABASE_URL=postgresql://… npm run db:test
```

Führt jedes Skript in `supabase/tests/` aus. Jedes Skript legt erfundene Daten
an, prüft und endet mit `rollback`. Ohne `DATABASE_URL` überspringt der Runner
mit Exit-Code 0; gegen einen Host, der nach Produktion aussieht, verweigert er
den Lauf, solange nicht `ALLOW_SQL_TESTS_AGAINST_REMOTE=true` gesetzt ist.

Stand: 103 Prüfungen in vier Skripten (`onboarding`, `partner-search`,
`reference-search`, `storage-and-rls`).
