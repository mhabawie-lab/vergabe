# Einmalige Einrichtung eines Supabase-Projekts

Diese Schritte lassen sich nicht aus dem Repository heraus erledigen: sie
brauchen ein Konto, ein Projekt und Zugangsdaten. Alles, was **ohne** diese
Zugangsdaten möglich war, ist bereits umgesetzt — Migrationen, Policies,
Buckets, Anwendungscode und Tests liegen fertig vor und warten nur darauf,
angewendet zu werden.

Reihenfolge einhalten. Nichts hier verlangt, ein bestehendes Projekt
zurückzusetzen.

---

## 1. Projekt anlegen

1. Auf <https://supabase.com> ein Projekt erstellen (Region: EU, für
   Vergabedaten in der Regel Frankfurt).
2. Datenbankpasswort im Passwortmanager ablegen. Es taucht nirgends im
   Repository auf.
3. Projekt-Ref aus der URL notieren (`https://supabase.com/dashboard/project/<ref>`).

## 2. Schlüssel holen

Unter *Project Settings → API*:

| Wert im Dashboard | Umgebungsvariable |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (früher „anon") | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (früher „service_role") | `SUPABASE_SECRET_KEY` |

Der Secret Key umgeht Row Level Security. Er gehört **ausschließlich** in die
Serverumgebung und niemals in eine Variable mit `NEXT_PUBLIC_`-Präfix.

## 3. `.env.local` anlegen

```bash
cp .env.example .env.local
# Werte eintragen, dann:
echo "DATA_BACKEND=supabase" >> .env.local
```

`.env.local` ist in `.gitignore`. Nur `.env.example` ist versioniert.

## 4. Migrationen anwenden

```bash
npx supabase link --project-ref <ref>
npx supabase migration list      # zeigt den Abgleich, ändert nichts
npx supabase db push
```

`supabase db reset` **nicht** verwenden — der Befehl verwirft die Datenbank.

## 5. Buckets prüfen

`0015_document_storage.sql` legt die drei privaten Buckets mit an. Nach
`db push` im Dashboard unter *Storage* kontrollieren:

| Bucket | Public | Limit | Typen |
| --- | --- | --- | --- |
| `reference-documents` | **nein** | 25 MB | PDF, DOCX, XLSX, CSV, PNG, JPEG |
| `partner-documents` | **nein** | 25 MB | dieselben |
| `organization-documents` | **nein** | 25 MB | dieselben |

Steht bei einem Bucket „Public", ist er von Hand anzupassen — und die Ursache
zu klären, bevor Dokumente hochgeladen werden.

## 6. Authentifizierung einstellen

Unter *Authentication → Providers*:

* E-Mail/Passwort aktivieren.
* **Selbstregistrierung („Enable signups") deaktivieren**, sobald die
  Erstorganisation angelegt ist. Externe Firmen bekommen in SicherVergabe keine
  Konten (`CLAUDE.md` § 11); Mitglieder werden eingeladen.
* Unter *URL Configuration* die Redirect-URLs der Deployment-Domain eintragen.

## 7. Erste Organisation

1. Ersten Benutzer anlegen (Einladung oder Registrierung, solange sie noch
   aktiv ist).
2. Anmelden. Die Anwendung führt automatisch nach `/onboarding`.
3. Name und Kennung eintragen und anlegen. Der Benutzer wird
   `org_admin`; Organisation, Mitgliedschaft und Auditeintrag entstehen in
   einer Transaktion.

Ein zweiter Aufruf wird abgelehnt. Weitere Mitglieder werden eingeladen, nicht
über diesen Weg angelegt.

Soll jemand plattformweit administrieren, ist `profiles.is_platform_admin`
einmalig im Dashboard zu setzen — bewusst kein Weg über die Oberfläche.

## 8. Typen erzeugen

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

Erst ausführen, wenn das Schema angewendet ist. Vorher gibt es die Datei
absichtlich nicht (`docs/database-migrations.md` § 5).

## 9. Prüfen, dass es wirklich getrennt ist

Gegen die **Entwicklungsinstanz**, nie gegen Produktion:

```bash
DATABASE_URL="postgresql://…" ALLOW_SQL_TESTS_AGAINST_REMOTE=true npm run db:test
```

Zusätzlich einmal manuell mit zwei Konten in zwei Organisationen:

- [ ] Konto B sieht keine Kunden, Referenzen, Partner oder Dokumente von A.
- [ ] Eine direkt aufgerufene Detail-URL von A liefert bei B „nicht gefunden".
- [ ] Ein Download-Link von A funktioniert bei B nicht.
- [ ] Ein Download-Link funktioniert nach fünf Minuten nicht mehr.
- [ ] Ein Betrachter sieht Partnernachweise als Eintrag, kann sie aber nicht
      öffnen.

## 10. Deployment

Siehe `docs/deployment.md`. Kurz: dieselben Variablen in der
Deployment-Umgebung setzen, `DATA_BACKEND=supabase`, und Migrationen bewusst
anwenden — nie automatisch aus einem Pull Request heraus.
