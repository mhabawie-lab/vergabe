# Datenbankschema

Überblick über alle Tabellen. Jede Änderung erfolgt über eine Migration in
`supabase/migrations/`; manuelle Änderungen im Supabase-Dashboard sind nicht
zulässig (`CLAUDE.md` § 7).

Row Level Security ist auf **allen** Tabellen aktiv.

---

## Migrationen

| Datei                              | Inhalt                                              |
|------------------------------------|-----------------------------------------------------|
| `0001_init_extensions.sql`         | Extensions, `set_updated_at`, gemeinsame Enums      |
| `0002_identity.sql`                | Organisationen, Profile, Rollen, RLS-Hilfsfunktionen |
| `0003_ingestion.sql`               | Quellen, Connector-Läufe, Rohdaten                  |
| `0004_tenders.sql`                 | Ausschreibungen, Auftraggeber, Lose, Dokumente, Zuschläge |
| `0005_workspace.sql`               | Unternehmensprofil, Favoriten, Suchprofile, Audit-Log |
| `0006_register_demo_source.sql`    | DEMO-Quelle plus Schutz-Trigger                     |
| `0007_business_clients.sql`        | **Phase 2** — eigene Kunden und Referenzprojekte    |
| `0008_reference_rls_audit.sql`     | **Phase 2** — RLS und Audit für Referenzdaten       |
| `0009_service_confirmation.sql`    | **Phase 2** — Bestätigungszustand der Leistungsarten |

Anwenden mit `supabase db push`.

---

## Zwei getrennte Welten

Das Schema hält zwei Arten von Gegenparteien strikt auseinander:

| | `contracting_authorities` | `business_clients` |
|---|---|---|
| Wer | öffentliche Vergabestelle | eigener Geschäftskunde |
| Herkunft | aus Vergabeverfahren importiert | vom Nutzerunternehmen gepflegt |
| Sichtbarkeit | für alle angemeldeten Nutzer lesbar | nur für die eigene Organisation |
| Mandant | keiner (geteilte Referenzdaten) | `organization_id` |

Sie werden nie zusammengeführt. Ein öffentlicher Auftraggeber kann durchaus
auch Kunde sein — das sind dann zwei Datensätze mit unterschiedlicher
Rechtsnatur und unterschiedlicher Vertraulichkeit.

Analog gilt: `awards` sind fremde Zuschläge aus Vergabeverfahren,
`reference_projects` sind eigene Kundenprojekte.

---

## Phase 1 — Ausschreibungen

### Ingestion

- **`sources`** — registrierte Datenquelle. `is_active` steuert die Ausführung
  über Daten statt über Code.
- **`connector_runs`** — Protokoll je Lauf (Start, Ende, Zähler, Fehler).
- **`raw_imports`** — unveränderte Quellpayloads mit `payload_hash`.
  Eindeutig über `(source_id, external_id, payload_hash)`.
- **`normalization_runs`** — Ergebnis je Normalisierung, mit `mapper_version`.

### Normalisierte Daten

- **`tenders`** — zentrale Ausschreibungstabelle. Eindeutig über
  `(source_id, external_id)`. Generierte `search_vector`-Spalte (deutsche
  Konfiguration) mit GIN-Index; GIN-Indizes auf `cpv_codes`, `sectors`,
  `nuts_codes`; partieller Index auf offene Fristen.
- **`tender_lots`**, **`tender_requirements`**, **`tender_documents`** —
  Kinder von `tenders`, per `on delete cascade`.
- **`contracting_authorities`** — Auftraggeber mit `dedupe_key`.
- **`awards`** — Zuschläge, eindeutig über `(source_id, external_id)`.
- **`tender_duplicate_candidates`** — Dublettenpaare mit Ähnlichkeitswert.

### Mandanten und Arbeitsbereich

- **`organizations`**, **`profiles`**, **`organization_members`** —
  Mandantenfähigkeit und Rollen.
- **`company_profiles`**, **`favorites`**, **`search_profiles`**,
  **`watched_authorities`** — je Organisation.
- **`audit_log`** — anfügend, keine Update- oder Delete-Richtlinie.

---

## Phase 2 — Kunden und Referenzen

### `business_clients`

Eigener Geschäftskunde einer Organisation.

| Spalte | Anmerkung |
|---|---|
| `organization_id` | Mandantenschlüssel, `on delete cascade` |
| `name` | Originalschreibweise, wird nie überschrieben |
| `normalized_name` | Vergleichsform ohne Rechtsform, Basis der Dublettenwarnung |
| `is_active` | steuert Filter und Kennzahl „Aktive Kunden" |

Eindeutig: `(organization_id, normalized_name)` — derselbe Kunde kann in zwei
Organisationen unabhängig existieren.
Indizes: `(organization_id, name)`, partiell auf `is_active`, Trigram auf `name`.

### `reference_projects`

Bereits ausgeführtes oder laufendes Kundenprojekt.

| Spalte | Anmerkung |
|---|---|
| `external_object_number` | Objekt-Nr. des Kunden |
| `project_name` | Objektname aus der Quelle |
| `object_type` | Art des Standorts, **nicht** die Leistung |
| `shift_summary_raw` | Originalwert, z. B. `218/146/0` — Bedeutung unbestätigt |
| `shift_values` | technische Zerlegung, Positionen ohne festgelegte Bedeutung |
| `project_status` | Standard `unknown`, wird nicht geraten |
| `invoice_status` | Standard `unknown` |
| `confidentiality_level` | `internal`, `confidential` oder `public_reference` |
| `source_import_id` | Verweis auf den Importlauf |

Eindeutig: `(organization_id, external_object_number)`.
Indizes: Organisation/Datum, Kunde/Zeitraum, Standort, Status, Zeitraum,
Trigram auf `project_name`.

### `reference_project_services`

Leistungsart je Projekt, mit Herkunft der Einstufung.

| Spalte | Anmerkung |
|---|---|
| `service_category` | Enum inkl. `unknown` als ehrlicher Standardwert |
| `classification_source` | `name_rule`, `manual`, `import_column` oder `ai` |
| `classification_confidence` | 0–1, nur zusammen mit der Herkunft aussagekräftig |
| `confirmed_by_user` | **false = kein Nachweis**; true nur bei `confirmed`/`manual` |
| `confirmation_status` | `proposed`, `confirmed`, `manual`, `rejected`, `unknown` |
| `confirmed_at` | Zeitpunkt der Entscheidung |
| `confirmed_by` | Wer entschieden hat |

Zwei Check-Constraints halten die Felder konsistent: `confirmed_by_user` darf
nur bei `confirmed`/`manual` wahr sein, und jede getroffene Entscheidung trägt
einen Zeitstempel.

Eindeutig: `(reference_project_id, service_category)`.

### `reference_imports` und `reference_import_rows`

Protokoll jedes Importlaufs, einschließlich Testläufen (`status = dry_run`).

`reference_import_rows` speichert je Quellzeile:

- `raw_data` — die Zeile unverändert, nach Spaltenüberschrift
- `normalized_data` — der bereinigte Vorschlag, **getrennt** davon
- `validation_status` und `validation_messages`
- `imported_project_id`, falls die Zeile geschrieben wurde

---

## Sicherheitsmechanismen

| Mechanismus | Wirkung |
|---|---|
| `is_org_member(uuid)` | Lesezugriff auf Daten der eigenen Organisation |
| `has_org_role(uuid, org_role[])` | Schreibzugriff nach Rolle |
| `is_platform_admin()` | organisationsübergreifender Zugriff für Plattformpersonal |
| `enforce_demo_source_flag()` | Datensätze einer Demo-Quelle müssen `is_demo` tragen |
| `reject_demo_reference_data()` | Referenzdaten dürfen nicht an einer Demo-Organisation hängen |
| `log_reference_change()` | schreibt Änderungen an Referenzdaten ins `audit_log` — nur Metadaten |
| `log_service_confirmation()` | protokolliert Bestätigungsentscheidungen mit altem und neuem Wert |

---

## Skalierung

`tenders` ist auf Millionen Zeilen ausgelegt: Volltextindex auf einer
generierten Spalte, Array-Indizes für CPV und Branchen, ein Composite-Index in
der Sortierreihenfolge der Trefferliste sowie ein partieller Index auf offene
Fristen, der unabhängig von der Archivgröße klein bleibt. Eine spätere
Umstellung auf Range-Partitionierung nach `publication_date` ist in
`0004_tenders.sql` vermerkt.

Referenzdaten sind pro Organisation deutlich kleiner (Größenordnung Tausende).
Die Indizes sind entsprechend auf Filter und Sortierung ausgelegt, nicht auf
Partitionierung.
