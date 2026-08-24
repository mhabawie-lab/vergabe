# Referenzimport — Anleitung

Wie Kunden- und Referenzdaten nach SicherVergabe kommen. Die Funktion liegt
unter **Datenimport** (`/imports/references`) und erfordert die Berechtigung
`references:import` (Rolle `bid_manager` oder `org_admin`).

---

## Unterstützte Formate

| Format | Stand                                          |
|--------|------------------------------------------------|
| CSV    | unterstützt — Trennzeichen wird selbst erkannt |
| XLSX   | unterstützt — es wird das erste Tabellenblatt gelesen |
| Manuell| unterstützt — Einzelerfassung im selben Dialog |
| PDF    | **noch nicht** — Tabellenerkennung und OCR folgen später |

Grenzen: maximal 10 MB und 5.000 Zeilen pro Datei.

---

## Erwartete Spalten

Diese Überschriften werden automatisch erkannt:

| Spalte in der Datei | Internes Feld            | Pflicht |
|---------------------|--------------------------|---------|
| Objekt-Nr.          | `external_object_number` | nein    |
| Objektname          | `project_name`           | **ja**  |
| Objektart           | `object_type`            | nein    |
| Ort                 | `city`                   | nein¹   |
| Kunde               | `business_client`        | **ja**  |
| Schichten           | `shift_summary_raw`      | nein    |
| Rechnung?           | `invoice_status`         | nein    |

¹ Technisch optional, fachlich erwartet: Eine Zeile ohne Ort wird als Fehler
gemeldet, weil eine Referenz ohne Standort für das spätere Matching wertlos ist.

Zusätzlich erkannt werden: Region/Bundesland, Land, PLZ, Projektbeginn,
Projektende und Beschreibung.

Abweichende Überschriften lassen sich im zweiten Schritt von Hand zuordnen.
Eine Vorlage steht im Dialog zum Herunterladen bereit
(`docs/reference-import-template.csv`).

---

## Ablauf

1. **Datei auswählen** — CSV oder XLSX
2. **Spalten erkennen** — automatisch, mit Kennzeichnung „Eindeutig",
   „Vermutet" oder „Manuell"
3. **Zuordnung prüfen** — jede Spalte lässt sich korrigieren oder vom Import
   ausschließen
4. **Vorschau** — die ersten 50 Zeilen mit ihren normalisierten Werten
5. **Validierung** — jede Zeile erhält Gültig, Warnung oder Fehler
6. **Hinweise lesen** — Warnungen und Fehler stehen an der betroffenen Zeile
7. **Dublettenprüfung** — gegen den bereits gespeicherten Bestand
8. **Testlauf** — analysiert alles, speichert nichts
9. **Import bestätigen** — erst dieser Schritt schreibt Daten
10. **Ergebnis** — importierte, übersprungene und fehlerhafte Zeilen

Schritt 8 und 9 laufen durch denselben Code. Ein Testlauf zeigt daher genau
das, was der echte Import tun würde.

---

## Was geprüft wird

| Prüfung                          | Schwere  | Verhalten                                   |
|----------------------------------|----------|---------------------------------------------|
| Kunde fehlt                      | Fehler   | Zeile wird nicht importiert                 |
| Objektname fehlt                 | Fehler   | Zeile wird nicht importiert                 |
| Ort fehlt                        | Fehler   | Zeile wird nicht importiert                 |
| Objekt-Nr. ungültig              | Fehler   | Zeile wird nicht importiert                 |
| Objekt-Nr. bereits vergeben      | Fehler   | Zeile wird nicht importiert                 |
| Objekt-Nr. doppelt in der Datei  | Fehler   | Zeile wird nicht importiert                 |
| Projektende vor Projektbeginn    | Fehler   | Zeile wird nicht importiert                 |
| Kundenname abweichend geschrieben| Warnung  | Vorschlag, keine Korrektur                  |
| Ortsname abweichend geschrieben  | Warnung  | Vorschlag, keine Korrektur                  |
| Schichtformat ungültig           | Warnung  | Originalwert bleibt erhalten                |
| Rechnungsstatus unbekannt        | Warnung  | wird als „Unbekannt" übernommen             |
| Mögliche inhaltliche Dublette    | Warnung  | Hinweis auf den ähnlichen Datensatz         |
| Datum unlesbar                   | Warnung  | Feld bleibt leer                            |

**Zeilen mit Fehlern werden nie importiert.** Zeilen mit Warnungen nur, wenn
das Kästchen „Zeilen mit Warnungen mit importieren" gesetzt wird.

---

## Die Spalte „Schichten"

Werte wie `218/146/0` werden **unverändert** gespeichert. Zusätzlich werden die
Zahlen technisch als Array abgelegt, damit später gerechnet werden kann.

Was die drei Zahlen bedeuten, ist **nicht bestätigt**. Die Anwendung vergibt
deshalb keine Bezeichnungen dafür und zeigt überall den Originalwert. Sobald
die Bedeutung geklärt ist, kann sie ergänzt werden, ohne dass Daten neu
importiert werden müssen — der Originalwert liegt ja vor.

---

## Leistungsarten

Beim Import wird eine Leistungsart nur dann vorgeschlagen, wenn der Objektname
einen eindeutigen Begriff enthält:

| Begriff im Objektnamen | Vorschlag  |
|------------------------|------------|
| `Paramedic`            | Sanitätsdienst |
| `Security`             | Sicherheitsdienst |
| `Clean`                | Reinigung  |
| `Lager`                | Lagerlogistik |

Alles andere bleibt **Nicht bestimmt** (`unknown`). Insbesondere erzeugt die
Objektart `Datacenter` keinen Leistungsvorschlag — sie beschreibt den Standort,
nicht die Leistung.

Jeder Vorschlag ist unbestätigt und muss auf der Referenz-Detailseite bestätigt
werden. Erst danach zählt er als Nachweis und fließt in Suchprofil-Vorschläge
ein. Siehe `docs/data-protection.md`, Abschnitt 3.

---

## Nach dem Import

- **Kunden** (`/customers`) — Kundenliste mit Projektzahl, Standorten und
  bestätigten Leistungsarten
- **Referenzen** (`/references`) — alle Projekte mit Filtern
- **Importprotokoll** — unten auf der Importseite, inklusive Testläufe

Jeder Lauf wird mit allen Zeilen protokolliert, auch den übersprungenen. Der
Originalinhalt jeder Zeile bleibt im Protokoll erhalten.
