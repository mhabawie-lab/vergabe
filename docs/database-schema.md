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
| `0010_reference_search_rpc.sql`    | **Phase 2** — serverseitige Referenzsuche als Funktion |
| `0011_partner_companies.sql`       | **Phase 3A** — Subunternehmer-Radar: 15 Tabellen, 24 Enums |
| `0012_partner_rls_audit.sql`       | **Phase 3A** — RLS, Audit, Ketten- und Sperrschutz         |
| `0013_partner_search_rpc.sql`      | **Phase 3A** — serverseitige Partnersuche als Funktion     |

Anwenden mit `supabase db push`; ohne Zugangsdaten siehe
`docs/supabase-setup.md`.

---

## Drei getrennte Welten

Das Schema hält drei Arten von Gegenparteien strikt auseinander:

| | `contracting_authorities` | `business_clients` | `partner_companies` |
|---|---|---|---|
| Wer | öffentliche Vergabestelle | eigener Geschäftskunde | möglicher Nachunternehmer oder Auftraggeber |
| Richtung | vergibt an uns | wir leisten für ihn | leistet für uns bzw. vergibt selbst |
| Herkunft | aus Vergabeverfahren importiert | vom Nutzerunternehmen gepflegt | vom Nutzerunternehmen gepflegt |
| Sichtbarkeit | für alle angemeldeten Nutzer lesbar | nur für die eigene Organisation | nur für die eigene Organisation |
| Mandant | keiner (geteilte Referenzdaten) | `organization_id` | `organization_id` |

Sie werden nie zusammengeführt. Ein öffentlicher Auftraggeber kann durchaus
auch Kunde sein — das sind dann zwei Datensätze mit unterschiedlicher
Rechtsnatur und unterschiedlicher Vertraulichkeit.

Analog gilt: `awards` sind fremde Zuschläge aus Vergabeverfahren,
`reference_projects` sind eigene Kundenprojekte.

Dieselbe Firma kann in mehreren Rollen auftreten — als Kunde und als
Nachunternehmer. Das sind getrennte Datensätze mit unterschiedlicher
Rechtsnatur und Vertraulichkeit, keine zwei Sichten auf einen Satz.

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
| `search_reference_projects()` | gefilterte Referenzsuche, `security invoker` — RLS gilt unverändert |
| `search_partner_companies()` | gefilterte Partnersuche, `security invoker` — RLS gilt unverändert |
| `reject_demo_partner_data()` | Partnerdaten dürfen nicht an einer Demo-Organisation hängen |
| `log_partner_change()` | schreibt Änderungen an Partnerdaten ins `audit_log` — nur Metadaten |
| `enforce_partner_block_reason()` | eine Sperrung braucht eine Begründung und schließt „bevorzugt" aus |
| `enforce_assignment_chain()` | verhindert Kreise und begrenzt die Kettentiefe auf sechs Ebenen |

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

---

## Referenzsuche (`0010`)

Die Filter der Referenzübersicht liegen zum Teil in der Kindtabelle
`reference_project_services` — „hat eine bestätigte Leistung dieser Art",
„trägt ausschließlich offene Vorschläge". Über die Tabellen-API lässt sich das
nicht zusammen mit Seitenzählung ausdrücken; wird nachträglich auf der bereits
geladenen Seite gefiltert, stimmen weder Gesamtzahl noch Seitengrenzen. Deshalb
filtert `public.search_reference_projects` in der Datenbank und liefert die
Treffer-IDs plus die Gesamtzahl vor der Seitenaufteilung.

| Eigenschaft | Umsetzung |
|---|---|
| Rechte | `security invoker` — RLS der aufrufenden Person gilt unverändert |
| Mandant | zusätzlich `is_org_member()`; eine fremde Organisation liefert leer |
| Sortierung | Whitelist (`project_name`, `client`, `start_date`), kein dynamisches SQL |
| Suchtext | Parameter, auf die Vergleichsform reduziert — `%` ist kein Platzhalter |
| Stabilität | Sortierung mit eindeutigem Nachschlüssel, damit Seiten nicht springen |

Zwei Hilfsfunktionen bilden die Vergleichsformen der Anwendung nach:
`reference_compare_form()` entspricht `normalizeForComparison`,
`reference_city_compare_form()` entspricht `normalizeCityName`. Ohne sie würden
Datenbank und Entwicklungsspeicher dieselbe Suche unterschiedlich beantworten.
Beide sind `stable` (wegen `unaccent`) und tragen deshalb keinen Index.

Zusätzliche Indizes: `reference_project_services (reference_project_id,
service_category)` und `(reference_project_id, confirmation_status)`.

Prüfskript: `supabase/tests/reference-search.sql`.


---

## Phase 3A — Subunternehmer-Radar

15 Tabellen, alle mandantenprivat. Namensentscheidung: `partner_companies`
statt `subcontractors`, weil ein Datensatz für uns arbeiten, uns beauftragen
oder beides kann — siehe `docs/subcontractor-radar.md`.

### Tabellen

| Tabelle | Inhalt |
|---|---|
| `partner_companies` | Firmenstammdaten, Beziehungsrichtung, Ebene, Status, Verifizierung, öffentliche Kennungen |
| `partner_contacts` | Ansprechpartner, nur geschäftliche Kontaktdaten |
| `partner_services` | angebotene Leistungen mit Bestätigungszustand |
| `partner_service_regions` | Einsatzgebiete, Radius, bundesweit |
| `partner_availability` | Verfügbarkeit mit `last_confirmed_at` |
| `partner_qualifications` | Nachweise mit Gültigkeit und Prüfstatus |
| `partner_documents` | Dokumentmetadaten, privater Storage-Pfad |
| `partner_rates` | verhandelte Konditionen — besonders vertraulich |
| `partner_activities` | Telefonate, Besprechungen, Wiedervorlagen |
| `partner_signals` | Beobachtungen mit Pflicht-Quellenangabe und Konfidenz |
| `subcontractor_needs` | eigener Bedarf, niemals öffentlich |
| `subcontractor_matches` | berechnete Bewertungen mit Begründung und Score-Version |
| `subcontractor_assignments` | Projektzuordnungen, selbstreferenzierende Kette |
| `partner_imports` / `partner_import_rows` | Importprotokoll mit unverändertem `raw_data` |

### Mandantensicherung

Jede Kindtabelle führt `organization_id` selbst **und** ist über einen
zusammengesetzten Fremdschlüssel auf `(id, organization_id)` der Elterntabelle
gebunden. Die Spalte allein könnte mit dem Elternsatz auseinanderlaufen; der
Schlüssel macht das in der Datenbank unmöglich statt nur im Anwendungscode.

### Besonderheiten

- `partner_documents.storage_path` trägt einen Check, der jede `http(s)`-URL
  ablehnt: Dokumente liegen in einem privaten Bucket, nie hinter einer
  öffentlichen Adresse.
- `partner_documents.scan_status` steht auf `not_scanned`, solange kein Scanner
  eingerichtet ist. Etwas anderes zu behaupten wäre schlimmer als zu schweigen.
- `partner_companies` hat partielle Unique-Indizes auf Registernummer und
  Umsatzsteuer-ID — die stärksten Dublettensignale, die es gibt.
- `subcontractor_assignments.chain_level` wird vom Trigger errechnet, nicht vom
  Client geschickt.

### Suchfunktion (`0013`)

`public.search_partner_companies` filtert, sortiert und paginiert in der
Datenbank — die meisten Filter liegen in Kindtabellen (bestätigte Leistungen,
Einsatzgebiete, Verfügbarkeit, Nachweisstand, offene Bedarfssignale). Nachträglich
auf der geladenen Seite zu filtern ergäbe falsche Gesamtzahlen.

| Eigenschaft | Umsetzung |
|---|---|
| Rechte | `security invoker` — RLS gilt unverändert |
| Mandant | zusätzlich `is_org_member()`; fremde Organisation → leer |
| Sortierung | Whitelist, kein dynamisches SQL |
| Suchtext | Parameter, auf die Vergleichsform reduziert |
| Radius | kein Geocoding — es zählt die Angabe des Unternehmens |

Prüfskript: `supabase/tests/partner-search.sql`.
