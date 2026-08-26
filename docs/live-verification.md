# Einrichtung und Prüfung auf dem echten Supabase-Projekt

Protokoll der erstmaligen Einrichtung. Enthält **keine** Zugangsdaten: weder
Schlüssel noch Passwörter noch Tokens.

Projekt: `SicherVergabe`, Region `eu-west-2`, Status `ACTIVE_HEALTHY`.
Die Projekt-URL und der Publishable Key stehen in der lokalen `.env.local`
bzw. in der Deployment-Umgebung — nie im Repository.

---

## 1. Angewendet

Alle **16 Migrationen** in Dateinamenreihenfolge über die Supabase
Management-API. Die Datenbank war davor leer (0 Tabellen, 0 Buckets).

Die Migrationshistorie (`supabase_migrations.schema_migrations`) wurde mit
allen 16 Versionen befüllt, damit ein späteres `supabase db push` sie als
angewendet erkennt und nichts erneut ausführt.

## 2. Ergebnis in der Datenbank

| Prüfung | Ergebnis |
| --- | --- |
| Tabellen im Schema `public` | 41 |
| davon mit aktivierter RLS | **41** |
| Richtlinien auf `public` | 71 |
| Storage-Buckets | 3 |
| davon öffentlich | **0** |
| Storage-Policies | 12 |
| Funktionen mit `security definer` | 10 (alle in der Erlaubnisliste) |

Buckets, je 25 MB (26 214 400 Byte) und sechs erlaubte MIME-Typen:
`organization-documents`, `partner-documents`, `reference-documents` — alle
`public = false`.

## 3. SQL-Suiten gegen die echte Instanz

Alle vier Skripte aus `supabase/tests/` liefen gegen das Projekt und endeten
mit `rollback`, hinterlassen also nichts:

| Skript | Prüfungen |
| --- | --- |
| `storage-and-rls.sql` | 29 |
| `onboarding.sql` | 22 |
| `reference-search.sql` | 22 |
| `partner-search.sql` | 30 |

Damit ist zum ersten Mal geprüft, was der lokale Stellvertreter nicht abbilden
konnte: die echte Storage-Tabelle, die Plattformrollen und die
JWT-Auswertung.

## 4. Prüfung mit echter Benutzersitzung

Fünfzehn Prüfungen mit dem Token einer angemeldeten Person — **nie** mit dem
Secret Key, also unter denselben Policies wie die Anwendung:

- Anmeldung mit E-Mail und Passwort erfolgreich; falsches Passwort → HTTP 400.
- Registrierung eines fremden Kontos → abgewiesen (Selbstregistrierung ist aus).
- `needs_onboarding()` meldet die fehlende Organisation.
- `create_first_organization` legt Organisation, Mitgliedschaft (`org_admin`)
  und Auditeintrag in einer Transaktion an.
- Ein zweiter Aufruf wird mit klarer Meldung abgewiesen.
- Der Auditeintrag enthält nur `{"via":"first_organization","role":"org_admin"}`
  — keinen Firmennamen.
- Nur die eigene Organisation ist sichtbar.
- Eine fremde `organization_id` liefert ein **leeres Ergebnis**, keinen Fehler.
- Upload in `<organization_id>/organization/<id>/…` erfolgreich.
- Upload in den Ordner einer fremden Organisation → abgewiesen.
- Signierter Download (300 s) funktioniert, die Datei kommt unverändert an.
- Ohne Signatur ist dieselbe Datei nicht abrufbar.
- Ein anonymer Aufruf auf private Tabellen liefert 0 Zeilen.

Das Testobjekt wurde anschließend gelöscht; im Storage liegt nichts.

## 5. Datenbanktypen

`src/types/database.ts` wurde aus dem **angewendeten** Schema erzeugt (3 681
Zeilen, 43 Tabellen-Typen). Nach jeder weiteren Migration neu erzeugen:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

## 6. Einstellungen der Authentifizierung

| Einstellung | Wert |
| --- | --- |
| Selbstregistrierung | **aus** |
| Anonyme Anmeldungen | aus |
| E-Mail-Bestätigung | an |
| Mindestpasswortlänge | 12 |
| Zeichenanforderungen | Klein- und Großbuchstaben sowie Ziffern |

Die Selbstregistrierung war ausschließlich für das Anlegen des ersten Kontos
kurzzeitig aktiv und ist wieder deaktiviert. Fremde Firmen bekommen keine
Konten (`CLAUDE.md` § 11).

## 7. Dabei gefunden und behoben

**`/api/health` wurde zur Anmeldung umgeleitet.** Sobald Supabase konfiguriert
ist, greift die Middleware auch auf den Gesundheitsendpunkt zu — eine
Deployment-Probe hat aber keine Sitzung und hätte jede Prüfung als Ausfall
gemeldet. `/api/health` steht jetzt in `PUBLIC_PATHS`; die Antwort bleibt auf
Status und Backendname beschränkt.

## 8. Nicht geprüft

- **Kein Browserlauf gegen die echte Instanz.** Der Browser dieser
  Arbeitsumgebung erreicht das Internet nicht (nur serverseitige Aufrufe
  gehen über den Proxy). Die Oberfläche ist gegen den lokalen Speicher
  geprüft, alle Server-, Datenbank- und Storage-Pfade gegen das echte
  Projekt. Ein Durchklicken im Browser bleibt Ihnen überlassen.
- **Kein Virenscanner.** `scan_status` bleibt `not_scanned`.
