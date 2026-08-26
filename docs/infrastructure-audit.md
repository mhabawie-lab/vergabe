# Infrastruktur-Audit (Phase 4)

Bestandsaufnahme vor Phase 4, gefundene Befunde, deren Behebung und was
bewusst offen bleibt. Enthält keine Zugangsdaten und keine Werte von
Umgebungsvariablen.

Stand: Beginn Phase 4, Basis `main` nach dem Merge von PR #3.

---

## 1. Ausgangslage

| Punkt | Befund |
| --- | --- |
| Supabase CLI | nicht installiert, weder global noch als Projektabhängigkeit |
| `supabase/config.toml` | nicht vorhanden |
| Projektverknüpfung | keine (`supabase link` nie ausgeführt) |
| Migrationen | 13 Dateien, `0001`–`0013` |
| Angewendet auf ein Supabase-Projekt | nein — noch nie |
| Zugangsdaten in der Umgebung | keine; nur `.env.example` ist versioniert |
| Storage-Buckets | keine; Dokumente wurden nur als Metadaten erfasst |
| Aktives Backend | prozessinterner Speicher, **stillschweigend** gewählt |
| Docker | Binary vorhanden, Daemon nicht erreichbar |

Der Anwendungscode war vollständig gegen Ports geschrieben
(`TenderRepository`, `ReferenceStore`, `PartnerStore`), aber es gab nur einen
belastbaren Adapter je Port und keine Möglichkeit, die Wahl zu erzwingen.

---

## 2. Befunde

### B1 — Stiller Rückfall auf den flüchtigen Speicher (hoch)

`src/lib/db/index.ts` entschied an vier Stellen über
`hasSupabaseClientConfig()`. Fehlte eine Variable in der Produktion, lief die
Anwendung ohne Fehlermeldung auf einem prozessinternen Speicher: Anmeldung
übersprungen, Demo-Sitzung mit `super_admin`, jeder Schreibvorgang beim
nächsten Neustart verloren.

**Behoben.** Eine einzige Entscheidung in `resolveBackend()`
(`src/lib/env/server.ts`), einmal protokolliert, mit Fehler statt Rückfall in
der Produktion. `DATA_BACKEND` macht die Wahl ausdrücklich. Kein `catch` im
Datenzugriff wechselt das Backend.

### B2 — Geheimnisnahes Modul im Client-Import-Pfad (mittel)

`src/lib/supabase/client.ts` (`'use client'`) importierte `@/lib/env`, das den
Service-Role-Key liest. Der Wert erreichte das Bundle nicht — Next.js setzt nur
`NEXT_PUBLIC_*` ein —, aber die Struktur lud zum Fehler ein.

**Behoben.** Aufteilung in `env/public.ts` (browsersicher) und `env/server.ts`
(`server-only`). Ein Test verlangt, dass das öffentliche Modul die Namen der
Geheimvariablen nicht einmal enthält; das gebaute Client-Bundle wurde
gegengeprüft.

### B3 — Vier Funktionen ohne festgelegten `search_path` (mittel)

`set_updated_at`, `enforce_demo_source_flag`, `reject_demo_reference_data` und
`enforce_partner_block_reason` liefen ohne `set search_path`. Ein Aufrufer mit
eigenem Schema hätte die Bedeutung unqualifizierter Namen verschieben können.

**Behoben** durch die additive Migration `0014`: `create or replace` mit
`set search_path = public, pg_temp`, Rumpf unverändert. Keine veröffentlichte
Migration wurde umgeschrieben.

### B4 — Dokumente ohne Ablageort (hoch)

`partner_documents` erfasste Metadaten, aber es gab keinen Bucket, keine
Policies und keinen Upload. Die Oberfläche sagte das zwar, aber der Nutzen war
gering und die Versuchung groß, Dateien anderswo abzulegen.

**Behoben** durch `0015`: drei private Buckets, zwölf Storage-Policies,
Dokumenttabellen für Referenz- und Organisationsunterlagen, Upload-/Download-
API und eine gemeinsame Oberfläche.

### B5 — Fehlende Mandantenkopplung bei Dokument-Fremdschlüsseln (mittel)

Ein Dokument hätte sich an einen Eigentümer einer anderen Organisation hängen
lassen, wenn die Anwendung sich geirrt hätte.

**Behoben** durch zusammengesetzte Schlüssel `(id, organization_id)` auf
`reference_projects` und `business_clients` und entsprechend zusammengesetzte
Fremdschlüssel der Dokumenttabellen.

### B6 — Sackgasse nach der Anmeldung (mittel)

Ein angemeldeter Benutzer ohne Organisationszuordnung war von einem
anonymen nicht unterscheidbar und landete wieder auf der Anmeldeseite, die er
gerade passiert hatte.

**Behoben** durch drei statt zwei Zuständen (`getAuthState()`) und
`create_first_organization` in `0016`: eine Transaktion, erster Benutzer wird
`org_admin`, zweiter Aufruf abgewiesen, Auditeintrag ohne Inhalte, für `anon`
nicht ausführbar.

### B7 — Veraltete Schlüsselnamen (niedrig)

`.env.example` dokumentierte nur `NEXT_PUBLIC_SUPABASE_ANON_KEY` und
`SUPABASE_SERVICE_ROLE_KEY`.

**Behoben.** Aktuelle Namen sind der dokumentierte Weg, die alten werden mit
einer Warnung weiter gelesen. Die Warnung nennt nur den Namen, nie den Wert;
beide Werte werden nie gemeinsam protokolliert.

### B8 — Keine automatisierte RLS-Prüfung (mittel)

Die Richtlinien waren nur manuell geprüft.

**Behoben, mit Einschränkung.** `supabase/tests/storage-and-rls.sql` (29
Prüfungen) und `onboarding.sql` (22) laufen als Rolle `authenticated` gegen ein
lokales PostgreSQL mit Plattform-Stellvertretern und in CI. Gegen eine echte
Supabase-Instanz sind sie noch nicht gelaufen — siehe § 4.

---

## 3. Zustand nach Phase 4

| Punkt | Zustand |
| --- | --- |
| Supabase CLI | Projektabhängigkeit, Version in `package.json` festgelegt |
| `supabase/config.toml` | vorhanden, referenziert Geheimnisse nur über `env()` |
| Migrationen | 16, statisch geprüft, alle additiv |
| Tabellen | 41, alle mit aktivierter RLS |
| Funktionen mit `search_path` | 20; `security definer` nur mit hinterlegter Begründung |
| Buckets | 3, privat, 25 MB, sechs erlaubte Typen |
| Storage-Policies | 12 |
| Backendwahl | ausdrücklich, ohne stillen Rückfall |
| Automatisierte Tests | 300 Unit-Tests, 103 SQL-Prüfungen in 4 Skripten |
| CI | Typen, Lint, Tests, Build, Migrationsprüfung, Secret-Scan, SQL-Tests |
| Zugangsdaten im Repository | keine |

---

## 4. Bewusst offen

1. **Kein Lauf gegen ein echtes Supabase-Projekt.** In dieser Umgebung ist der
   Docker-Daemon nicht erreichbar, also startet keine lokale Supabase-Instanz;
   Zugangsdaten für ein entferntes Projekt liegen nicht vor. Migrationen,
   Policies und Buckets sind gegen ein lokales PostgreSQL mit nachgebildetem
   `auth`- und `storage`-Schema geprüft. Was dieser Stellvertreter nicht
   abdeckt: die echte Storage-API, die JWT-Auswertung der Plattform und die
   Durchsetzung der Bucket-Limits.
2. **`src/types/database.ts` fehlt.** `supabase gen types` braucht eine
   erreichbare Instanz. Erfundene Typen wären eine ungeprüfte Zusicherung.
3. **Kein Virenscanner.** `scan_status` bleibt `not_scanned`, und die
   Oberfläche sagt „nicht geprüft" — nie „sicher".
4. **Keine Einladungsfunktion für weitere Mitglieder.** Bis dahin werden
   Mitglieder über das Supabase-Dashboard angelegt.
5. **Kein automatisches Deployment und keine Migration aus CI heraus.** Das
   Anwenden eines Schemas bleibt eine bewusste Entscheidung.
