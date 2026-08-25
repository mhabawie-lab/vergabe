# Datenbank einrichten und prüfen

Wie die Migrationen angewendet werden — mit Supabase und ohne. Verbindliche
Regel: **jede** Schemaänderung ist eine Migration in `supabase/migrations/`;
Änderungen im Supabase-Dashboard, die nicht als Migration existieren, sind
nicht zulässig (`CLAUDE.md` § 7).

---

## 1. Mit Supabase

```bash
supabase link --project-ref <projekt-ref>
supabase db push
```

`db push` wendet alle Dateien in `supabase/migrations/` in Dateinamen­reihenfolge
an. Alle Migrationen sind additiv: sie legen an und erweitern, sie löschen keine
bestehenden Daten.

Die Anwendung braucht danach nur die Umgebungsvariablen aus `.env.example`.
Ohne sie startet sie im flüchtigen Entwicklungsspeicher (siehe README).

---

## 2. Ohne Supabase-Zugangsdaten

Für Schema- und RPC-Prüfungen genügt ein lokales PostgreSQL ab Version 15. Die
Migrationen verwenden drei Extensions (`pgcrypto`, `pg_trgm`, `unaccent`) und
zwei Dinge, die sonst die Supabase-Plattform mitbringt: das Schema `auth` mit
`auth.users` und `auth.uid()` sowie die Rollen `anon`, `authenticated` und
`service_role`. Beides lässt sich lokal nachbilden.

```bash
# 1. Cluster starten (Beispielpfade)
initdb -D /var/tmp/sv/data -U postgres --auth=trust
pg_ctl -D /var/tmp/sv/data -o "-p 55432" -l /var/tmp/sv/pg.log start
createdb -h localhost -p 55432 -U postgres sv
```

```sql
-- 2. Plattform-Stellvertreter anlegen (nur lokal!)
-- Rollen gelten clusterweit: beim zweiten Datenbankaufbau existieren sie
-- bereits, deshalb der Block statt eines blanken CREATE ROLE.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')
    then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
```

```bash
# 3. Migrationen der Reihe nach anwenden
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres@localhost:55432/sv" -v ON_ERROR_STOP=1 -f "$f"
done
```

Dieser Stellvertreter dient ausschließlich der lokalen Prüfung. Er gehört
niemals in eine Umgebung mit echten Daten: `auth.uid()` liest hier eine frei
setzbare Sitzungsvariable.

---

## 3. RPC lokal prüfen

`0010_reference_search_rpc.sql` legt `public.search_reference_projects` an — die
serverseitige Suche über Referenzprojekte. Sie ist `security invoker`, läuft
also mit den Rechten der aufrufenden Person; Row Level Security greift
unverändert.

Das Verhalten ist als ausführbares Skript hinterlegt:

```bash
psql "postgresql://postgres@localhost:55432/sv" \
  -v ON_ERROR_STOP=1 -f supabase/tests/reference-search.sql
```

Das Skript legt fiktive Daten an, prüft 22 Fälle — Volltext, Kunde, Ort,
Leistungsart, Projektstatus, Referenzstatus, Bestätigungsstand, Zeitraum,
Sortierung, Seitenwechsel, Mandantentrennung — und macht am Ende alles per
`rollback` rückgängig. Ein Fehlschlag bricht mit einer Meldung ab, die den
betroffenen Fall benennt.

Dieselben Erwartungen prüft `tests/customer-management.test.ts` gegen den
prozessinternen Speicher (`npm test`). Beide Adapter werden damit an derselben
Definition jedes Filters gemessen, statt an zwei verschiedenen.

### RLS gegenprüfen

```sql
set role authenticated;
set request.jwt.claim.sub = '<uuid eines Mitglieds>';
select count(*) from public.search_reference_projects('<organisation>');   -- > 0

set request.jwt.claim.sub = '<uuid eines Nichtmitglieds>';
select count(*) from public.search_reference_projects('<organisation>');   -- 0
reset role;
```

Eine fremde `organization_id` liefert ein leeres Ergebnis, keinen Fehler — ein
Fehler würde verraten, dass es die Organisation gibt.

---

## 3a. Partnersuche und Partner-Guards prüfen

`0011`–`0013` legen den Subunternehmer-Radar an. Dasselbe Vorgehen wie oben:

```bash
psql "postgresql://postgres@localhost:55432/sv" \
  -v ON_ERROR_STOP=1 -f supabase/tests/partner-search.sql
```

Das Skript prüft 30 Fälle: Suche, Filter, Sortier-Whitelist, Seitenzahlen,
Mandantentrennung sowie die Schutzmechanismen: eine Sperrung ohne
Begründung wird abgelehnt, „gesperrt" und „bevorzugt" schließen sich aus, ein
Dokument mit öffentlicher URL wird zurückgewiesen, die Kettenebene wird
errechnet, ein Kreis in der Kette verhindert, und die Audit-Einträge enthalten
keine Feldinhalte. Am Ende macht es alles per `rollback` rückgängig.

Dieselben Erwartungen prüfen `tests/partner-*.test.ts` gegen den
prozessinternen Speicher.

---

## 3b. Privater Storage-Bucket (noch einzurichten)

Für Nachweisdokumente ist ein **privater** Bucket vorgesehen:

```
Name:            partner-documents
Öffentlich:      nein
Dateigrößen-Limit: nach Bedarf, empfohlen 20 MB
```

Was gegen ein echtes Supabase-Projekt noch zu tun ist:

1. Bucket anlegen, öffentlichen Zugriff **deaktivieren**.
2. Storage-Policies je Organisation setzen — der Pfad beginnt mit der
   `organization_id`.
3. Den Upload serverseitig ergänzen und Downloads ausschließlich über
   `createSignedUrl` mit kurzer Laufzeit ausliefern.
4. Eine Schadsoftwareprüfung anbinden und `scan_status` erst dann von
   `not_scanned` wegbewegen.

**Bis dahin erfasst die Anwendung ausschließlich Metadaten und sagt das auch.**
Ein vorgetäuschter sicherer Ablageort wäre schlimmer als gar keiner.

---

## 4. Was noch offen ist

- Die RLS-Richtlinien werden bisher **nicht** automatisiert gegen eine echte
  Supabase-Instanz getestet. Die Prüfung oben ist manuell.
- Die Kundenliste (`/customers`) aggregiert weiterhin in der Anwendung statt in
  SQL. Das ist bei einigen Tausend Zeilen je Organisation unkritisch, bleibt
  aber als Punkt für später vermerkt (`PROJECT_PLAN.md`, § 13.11).
- Der Storage-Bucket für Partnerdokumente ist **nicht** eingerichtet; es werden
  nur Metadaten erfasst (Abschnitt 3b).
- Die Partnerliste lädt für die Spalten „Leistungen", „Regionen" und
  „Nachweise" je eine Abfrage pro Tabelle. Das ist bei einigen Tausend Partnern
  je Organisation unkritisch; darüber hinaus wäre eine materialisierte Sicht
  angebracht.
