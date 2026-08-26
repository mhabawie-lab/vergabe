# Row Level Security

Autorisierung wird zweimal geprüft: Row Level Security in der Datenbank ist die
erste Schicht, die Berechtigungsprüfung in Server-Code die zweite
(`CLAUDE.md` § 5). Fällt eine aus, hält die andere.

---

## 1. Grundform

Alle 41 Tabellen haben RLS aktiviert. Die Prüfung `npm run db:validate`
scheitert, sobald eine neue Tabelle ohne RLS angelegt wird.

Drei Helferfunktionen tragen die Politik:

| Funktion | Antwort |
| --- | --- |
| `public.is_platform_admin()` | Ist der Aufrufer Plattformpersonal? |
| `public.is_org_member(org)` | Gehört der Aufrufer zu dieser Organisation? |
| `public.has_org_role(org, rollen[])` | …und hat er eine dieser Rollen? |

Alle drei sind `security definer` mit festgelegtem `search_path`. Der Grund ist
kein Komfort: sie lesen `organization_members`, das selbst unter RLS steht —
ohne `security definer` würde die Richtlinienauswertung rekursiv.

Zwei Sichtbarkeitsklassen:

* **Vergabedaten** (`tenders`, `sources`, `contracting_authorities` …) darf
  jede angemeldete Person lesen. Sie sind geteilte Referenzdaten.
* **Private Geschäftsdaten** (`business_clients`, `reference_projects`,
  `partner_companies`, `documents`, `audit_log` …) tragen `organization_id` und
  sind ausschließlich für Mitglieder dieser Organisation lesbar
  (`CLAUDE.md` § 10).

---

## 2. Fremde Kennungen erscheinen als „nicht gefunden"

Eine Abfrage auf eine fremde `organization_id` liefert ein **leeres Ergebnis**,
keinen Fehler. Ein „Zugriff verweigert" würde bestätigen, dass es den Datensatz
gibt; ein leeres Ergebnis verrät nichts. Die Anwendung übersetzt das in eine
404-Seite, nicht in eine 403.

---

## 3. Mandantenschlüssel bei Fremdschlüsseln

Dokumente hängen an einem Eigentümer *und* an einer Organisation. Ein
zusammengesetzter Fremdschlüssel stellt sicher, dass beides zusammenpasst:

```sql
alter table public.reference_projects
  add constraint reference_projects_id_org unique (id, organization_id);

-- reference_documents referenziert dann (reference_project_id, organization_id)
```

Damit lässt sich ein Dokument nicht an ein Projekt einer anderen Organisation
hängen — auch dann nicht, wenn die Anwendung die Prüfung vergisst.

---

## 4. Storage

`storage.objects` steht unter denselben Regeln. Der Schlüssel ist der Pfad:

```
<organization_id>/<entity_type>/<entity_id>/<uuid>-<dateiname>
```

`public.storage_path_organization(name)` liest das erste Pfadsegment und gibt
es als `uuid` zurück — oder `null`, wenn es keine UUID ist. Jede der zwölf
Storage-Policies verlangt `is_org_member(...)` auf diesem Wert, Schreib- und
Löschrechte zusätzlich `has_org_role(...)`. Ein Objekt ohne UUID-Präfix ist
für niemanden lesbar.

---

## 5. Was automatisiert geprüft wird

`supabase/tests/storage-and-rls.sql` (29 Prüfungen) und
`supabase/tests/onboarding.sql` (22 Prüfungen) laufen **als Rolle
`authenticated`** mit echten Mitgliedern und echten Nichtmitgliedern — nie als
Superuser und nie mit dem Secret Key. Ein Test, der RLS umgeht, beweist nichts
über RLS.

Geprüft wird unter anderem:

* Ein Mitglied sieht die eigenen Kunden, Referenzen, Partner und Dokumente.
* Ein Mitglied einer anderen Organisation sieht **nichts** davon — auch nicht
  bei direkter Abfrage mit bekannter Kennung.
* Ein Betrachter darf keine Konditionen und keine Partnerdokumente lesen.
* `anon` sieht in keinem der privaten Bereiche etwas.
* Ein Objekt lässt sich nicht in den Ordner einer fremden Organisation legen.
* Ein Dokument lässt sich nicht an einen Eigentümer einer fremden Organisation
  hängen.
* `create_first_organization` funktioniert genau einmal und ist für `anon`
  nicht ausführbar.
* Auditeinträge enthalten Metadaten, keine Feldinhalte.

```bash
DATABASE_URL=postgresql://… npm run db:test
```

---

## 6. Grenzen dieser Prüfung

Die Skripte laufen gegen ein lokales PostgreSQL mit nachgebildetem `auth`- und
`storage`-Schema (`supabase/setup/local-platform-shim.sql`), weil in dieser
Umgebung kein Docker-Daemon erreichbar ist und damit keine lokale
Supabase-Instanz startet.

Was das beweist: die Richtlinien sind syntaktisch gültig, greifen und trennen
die Mandanten so, wie sie geschrieben sind.

Was das **nicht** beweist: das Verhalten der echten Storage-API, die
JWT-Auswertung der Plattform und die Wirksamkeit der Bucket-Limits. Diese
Punkte stehen in der Checkliste in `docs/supabase-one-time-setup.md` und sind
gegen ein echtes Projekt einmal manuell nachzuvollziehen.
