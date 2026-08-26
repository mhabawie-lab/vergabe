# Datenbank einrichten und prüfen

Wie die Migrationen angewendet werden — mit Supabase und ohne. Verbindliche
Regel: **jede** Schemaänderung ist eine Migration in `supabase/migrations/`;
Änderungen im Supabase-Dashboard, die nicht als Migration existieren, sind
nicht zulässig (`CLAUDE.md` § 7).

Verwandte Dokumente:

* Einmalige Einrichtung eines echten Projekts: `docs/supabase-one-time-setup.md`
* Migrationsregeln und statische Prüfung: `docs/database-migrations.md`
* Row Level Security: `docs/rls-security.md`
* Privater Dokumentenspeicher: `docs/private-storage.md`
* Umgebungsvariablen: `docs/environment-variables.md`

---

## 1. Mit Supabase

Die CLI ist eine Projektabhängigkeit; eine globale Installation ist nicht
nötig und nicht vorausgesetzt.

```bash
npx supabase link --project-ref <projekt-ref>
npx supabase migration list      # Abgleich, ändert nichts
npx supabase db push
```

`supabase db reset` verwirft die Datenbank und ist ausschließlich für die
lokale Instanz gedacht — nie gegen ein entferntes Projekt.

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

```bash
# 2. Plattform-Stellvertreter anlegen (nur lokal!)
psql "postgresql://postgres@localhost:55432/sv" \
  -v ON_ERROR_STOP=1 -f supabase/setup/local-platform-shim.sql
```

Die Datei legt `auth.users`, `auth.uid()`, die Rollen `anon`,
`authenticated` und `service_role` sowie ein minimales `storage`-Schema an. Sie
ist idempotent — Rollen gelten clusterweit und existieren beim zweiten
Datenbankaufbau bereits. Denselben Stellvertreter verwendet die CI.

```bash
# 3. Migrationen der Reihe nach anwenden
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres@localhost:55432/sv" -v ON_ERROR_STOP=1 -f "$f"
done

# 4. Alle SQL-Tests laufen lassen
DATABASE_URL="postgresql://postgres@localhost:55432/sv" npm run db:test
```

Dieser Stellvertreter dient ausschließlich der lokalen Prüfung. Er gehört
niemals in eine Umgebung mit echten Daten: `auth.uid()` liest hier eine frei
setzbare Sitzungsvariable.

Er ist nötig, weil in dieser Entwicklungsumgebung kein Docker-Daemon erreichbar
ist und `supabase start` damit keine lokale Instanz hochfährt. Was er nicht
abbildet: die echte Storage-API, die JWT-Auswertung der Plattform und die
Durchsetzung der Bucket-Limits.

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

## 3b. Privater Dokumentenspeicher

`0015_document_storage.sql` legt drei **private** Buckets an
(`reference-documents`, `partner-documents`, `organization-documents`), je
25 MB, sechs erlaubte MIME-Typen, dazu zwölf Storage-Policies auf
`storage.objects`. Der Objektpfad beginnt mit der `organization_id`.

```bash
psql "postgresql://postgres@localhost:55432/sv" \
  -v ON_ERROR_STOP=1 -f supabase/tests/storage-and-rls.sql
```

29 Prüfungen: Mandantentrennung bei Dokumenten, Rechte je Eigentümertyp,
Pfadauswertung, Ablehnung fremder Ordner, `anon` sieht nichts. Details:
`docs/private-storage.md` und `docs/rls-security.md`.

Ein Virenscanner ist **nicht** angebunden: `scan_status` bleibt
`not_scanned`, und die Oberfläche sagt „nicht geprüft" statt „sicher".

---

## 3c. Onboarding prüfen

```bash
psql "postgresql://postgres@localhost:55432/sv" \
  -v ON_ERROR_STOP=1 -f supabase/tests/onboarding.sql
```

22 Prüfungen rund um `create_first_organization`: erster Benutzer wird
`org_admin`, zweiter Aufruf abgewiesen, ungültige Kennungen abgewiesen, keine
verwaisten Organisationen, Auditeintrag ohne Inhalte, `anon` ohne
Ausführungsrecht.

---

## 4. Was noch offen ist

- Die RLS-Richtlinien laufen automatisiert, aber gegen ein lokales PostgreSQL
  mit Plattform-Stellvertretern — **nicht** gegen eine echte Supabase-Instanz.
- Die Kundenliste (`/customers`) aggregiert weiterhin in der Anwendung statt in
  SQL. Das ist bei einigen Tausend Zeilen je Organisation unkritisch, bleibt
  aber als Punkt für später vermerkt (`PROJECT_PLAN.md`, § 13.11).
- `src/types/database.ts` existiert nicht: `supabase gen types` braucht eine
  erreichbare Instanz, und erfundene Typen wären eine ungeprüfte Zusicherung.
- Es ist kein Virenscanner angebunden (Abschnitt 3b).
- Die Partnerliste lädt für die Spalten „Leistungen", „Regionen" und
  „Nachweise" je eine Abfrage pro Tabelle. Das ist bei einigen Tausend Partnern
  je Organisation unkritisch; darüber hinaus wäre eine materialisierte Sicht
  angebracht.
