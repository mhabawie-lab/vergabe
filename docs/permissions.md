# Rollen und Berechtigungen

Autorisierung wird **zweifach** durchgesetzt: Row Level Security in PostgreSQL
schützt den Datenzugriff, `requirePermission()` im Servercode schützt die
Aktion. Beide müssen zustimmen, bevor eine Zeile ausgeliefert wird
(`CLAUDE.md` § 5).

---

## Rollen

| Rolle | Beschreibung |
|---|---|
| `super_admin` | Plattformweite Administration, organisationsübergreifend |
| `org_admin` | Verwaltet die eigene Organisation |
| `bid_manager` | Voller fachlicher Zugriff auf Ausschreibungen, Kunden, Referenzen und Partner |
| `viewer` | Lesender Zugriff |

---

## Berechtigungen des Subunternehmer-Radars

Der Bereich ist in **fünf** Berechtigungen aufgeteilt, weil die Daten darin
nicht gleich vertraulich sind. Eine einzelne Berechtigung hätte den weitesten
nötigen Zugriff für alle erzwungen.

| Berechtigung | Erlaubt |
|---|---|
| `subcontractors:read` | Firmenliste, Detailseite, Signale, Bedarfe, Matches, Ketten |
| `subcontractors:write` | Anlegen und Bearbeiten, Signale entscheiden, Matches bewerten, Import |
| `subcontractors:documents` | Nachweisdokumente sehen, hochladen und prüfen |
| `subcontractors:financial` | Verhandelte Konditionen sehen und pflegen |
| `subcontractors:admin` | Verwaltung des Bereichs |

### Zuordnung

| | `viewer` | `bid_manager` | `org_admin` | `super_admin` |
|---|---|---|---|---|
| `subcontractors:read` | ✓ | ✓ | ✓ | ✓ |
| `subcontractors:write` | — | ✓ | ✓ | ✓ |
| `subcontractors:documents` | — | ✓ | ✓ | ✓ |
| `subcontractors:financial` | — | **—** | ✓ | ✓ |
| `subcontractors:admin` | — | — | ✓ | ✓ |

Ein Bid Manager kann den Partnerbestand vollständig pflegen, **ohne** die
verhandelten Preise zu sehen. Das ist beabsichtigt: Konditionen sind
Verhandlungsposition, nicht Arbeitsmaterial.

---

## Was die Oberfläche daraus macht

- Ohne `subcontractors:financial` ist das Register **Konditionen** gar nicht
  sichtbar. Ein leeres Register würde bereits verraten, dass es Preise gibt.
- Ohne `subcontractors:documents` fehlt das Register **Nachweise**.
- Ohne `subcontractors:write` fehlen alle Schaltflächen und Erfassungsformulare;
  dieselben Informationen bleiben lesbar.

---

## Mandantentrennung

Jeder Datensatz trägt eine `organization_id`. Kindtabellen führen sie zusätzlich
selbst und sind über einen zusammengesetzten Fremdschlüssel auf
`(id, organization_id)` der Elterntabelle gebunden — die Spalte allein könnte
mit dem Elternsatz auseinanderlaufen, der Schlüssel macht das unmöglich.

**Eine fremde ID wird überall als „nicht gefunden" beantwortet**, nicht als
„keine Berechtigung". Der Unterschied würde bestätigen, dass es den Datensatz
gibt.

---

## Row Level Security

| Tabellengruppe | Lesen | Schreiben |
|---|---|---|
| Partner-Tabellen (15) | `is_org_member(organization_id)` | `has_org_role(organization_id, ['org_admin','bid_manager'])` |

RLS kennt die Berechtigungen der Anwendung nicht. Sie erzwingt Organisation und
Rolle; `subcontractors:financial` und `subcontractors:documents` kommen in den
Route-Handlern obendrauf.

---

## Weitere Berechtigungen

| Berechtigung | Bereich |
|---|---|
| `tenders:read`, `tenders:export` | Ausschreibungen |
| `clients:read`, `clients:write` | Eigene Kunden |
| `references:read`, `references:write`, `references:import` | Referenzprojekte |
| `company:read`, `company:write` | Unternehmensprofil |
| `documents:read` | Dokumente |
| `members:read`, `members:write` | Mitglieder und Rollen |
| `sources:read`, `sources:write` | Datenquellen |
| `admin:platform` | Plattformadministration |

Die vollständige Matrix steht in `src/config/roles.ts` und ist dort die einzige
Quelle der Wahrheit.
