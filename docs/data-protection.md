# Datenhaltung und Datenschutz

Verbindliche Regeln für den Umgang mit Kunden- und Referenzdaten in
SicherVergabe. Sie ergänzen `CLAUDE.md` und gelten ab Phase 2.

---

## 1. Echte Kundendaten gehören nicht in Git

Referenzdaten benennen reale Kunden, reale Objekte und reale Standorte. Sie
sind Geschäftsgeheimnis des Nutzerunternehmens.

**Nicht zulässig:**

- echte Kundennamen im Quellcode, in Kommentaren oder in Tests
- echte Kundenprojekte in Seed- oder Demo-Dateien
- Ablegen einer erhaltenen Importdatei im Projektverzeichnis
- Kundendaten in Fehlermeldungen, Logausgaben oder Commit-Nachrichten

**Zulässig:**

- die anonymisierte Vorlage `docs/reference-import-template.csv`; jeder Wert
  darin ist erkennbar erfunden und mit `MUSTER` bzw. `BSP-` gekennzeichnet
- erfundene Testdaten in `tests/`, ebenfalls klar als Beispiel erkennbar

`.gitignore` schließt private Importdateien aus:

```
/private/
/imports/
*.import.csv
*.import.xlsx
reference-import-*.csv
reference-import-*.xlsx
!docs/reference-import-template.csv
```

Echte Daten gelangen ausschließlich über die geschützte Importfunktion unter
`/imports/references` in die Datenbank — nie über eine Datei im Repository.

---

## 2. Rohdaten und normalisierte Daten bleiben getrennt

Jede Importzeile wird zweifach gespeichert:

| Feld              | Inhalt                                              |
|-------------------|-----------------------------------------------------|
| `raw_data`        | die Quellzeile unverändert, nach Spaltenüberschrift |
| `normalized_data` | der bereinigte Vorschlag, getrennt davon            |

`raw_data` wird nach dem Schreiben nie verändert. Damit bleibt jederzeit
nachvollziehbar, was die Quelle tatsächlich geliefert hat — auch wenn sich die
Normalisierungslogik später ändert.

Dasselbe gilt für einzelne Werte: `reference_projects.shift_summary_raw` hält
den Originalstring, `shift_values` nur die technische Zerlegung.

---

## 3. Leistungsvorschläge sind keine bestätigten Fakten

Eine automatisch erkannte Leistungsart ist ein **Vorschlag**. Sie trägt:

- `classification_source` — welche Regel sie erzeugt hat
- `classification_confidence` — wie sicher die Regel ist
- `confirmed_by_user = false` — bis ein Mensch zustimmt

Ein unbestätigter Vorschlag

- wird in der Oberfläche sichtbar als Vorschlag gekennzeichnet,
- zählt **nicht** als Referenznachweis,
- fließt **nicht** in Suchprofil-Vorschläge oder die Match-Engine ein.

Der Hintergrund ist fachlich: Eine falsch behauptete Referenz führt dazu, dass
sich das Unternehmen auf eine Ausschreibung bewirbt, deren Eignung es nicht
belegen kann. Eine fehlende Referenz ist der deutlich kleinere Schaden.

Konkret gilt:

- Nur die Begriffe `Paramedic`, `Security`, `Clean` und `Lager` im Objektnamen
  erzeugen einen Vorschlag.
- Alles andere bleibt `unknown`.
- `Datacenter` ist eine **Objektart** und erzeugt nie einen Leistungsvorschlag.
- `Bauhelfer` und `Sicherheitsdienst` werden nie automatisch zugewiesen.

### Bestätigungszustände

`confirmation_status` unterscheidet fünf Zustände. Der Unterschied zwischen
einem unangetasteten und einem geprüften Vorschlag ist wichtig — beide haben
`confirmed_by_user = false`, bedeuten aber Gegensätzliches.

| Status | Bedeutung | Nachweis? |
|---|---|---|
| `proposed` | Automatisch erkannt, noch niemand hat geprüft | nein |
| `confirmed` | Vorschlag unverändert bestätigt | **ja** |
| `manual` | Kategorie von Hand festgelegt und bestätigt | **ja** |
| `rejected` | Vorschlag als unzutreffend verworfen | nein |
| `unknown` | Es wurde festgestellt, dass sich die Leistung nicht bestimmen lässt | nein |

Eine unbestimmte Kategorie (`unknown`) lässt sich **nicht** bestätigen. Das
wäre die Behauptung, man habe etwas festgestellt, was nicht festgestellt wurde;
die ehrliche Aktion dafür heißt „Als unbekannt markieren".

Jede Entscheidung hält fest, **wer** sie **wann** getroffen hat
(`confirmed_by`, `confirmed_at`) und wird im `audit_log` mit altem und neuem
Wert protokolliert.

### Notizen zu Entscheidungen

Zu jeder Entscheidung — auch zur Sammelbestätigung — lässt sich eine interne
Notiz erfassen (höchstens 2.000 Zeichen). Sie steht am Datensatz, nicht im
Protokoll: Das `audit_log` hält nur fest, **dass** eine Notiz vorliegt
(`hasNote`), nie ihren Text. Andernfalls würde das Protokoll zu einem zweiten
Speicher für Geschäftsdaten.

Eine vorhandene Notiz geht bei einer weiteren Entscheidung nicht verloren: Das
Formular ist mit dem gespeicherten Text vorbelegt, und eine leere
Sammelbestätigungs-Notiz überschreibt nichts.

### Sammelbestätigung

Ein Klick darf nur dann mehrere Referenzen zugleich betreffen, wenn die
Auswahl eindeutig ist. Erlaubt ist sie nur, wenn

- alle Einträge noch offene Vorschläge sind,
- alle dieselbe Kategorie tragen,
- keiner davon `unknown` ist,
- die Anfrage ein ausdrückliches Bestätigungskennzeichen mitführt.

Die Regel wird serverseitig erneut geprüft und die Auswahl vorher frisch aus
der Datenbank gelesen, damit veralteter Client-Zustand nichts bestätigen kann.

---

## 3a. Kundenstammdaten sind Vorschläge, keine Zusammenführungen

Beim Anlegen und Bearbeiten eines Kunden prüft die Anwendung auf Dubletten:

- **gleiche Vergleichsform** → Fehler, der Kunde existiert bereits
- **ähnliche Vergleichsform** → Warnung; gespeichert wird erst nach
  ausdrücklicher Bestätigung, beim ersten Versuch wird nichts geschrieben

Zusammengeführt wird **nie automatisch**. Zwei ähnlich geschriebene Firmen
können zwei verschiedene Unternehmen sein, und das Verschmelzen zweier
Kundenakten ist praktisch nicht umkehrbar.

Die Schreibweise des Namens bleibt unverändert; die Vergleichsform steht
daneben, nicht darüber — dieselbe Trennung wie zwischen `raw_data` und
`normalized_data`.

Einzelheiten: `docs/customers.md`.

---

## 4. Unvollständige Angaben werden nicht ergänzt

Fehlt ein Ort, eine Region oder ein Land, bleibt das Feld leer. Es wird nicht
aus anderen Feldern abgeleitet und nicht aus einer Nachschlagetabelle ergänzt.

Vermutete Schreibfehler werden als Hinweis angezeigt, zusammen mit dem Wert,
den die Anwendung vorschlagen würde. Übernommen wird er nur, wenn die
Benutzerin oder der Benutzer es tut.

---

## 5. Mandantentrennung

Jeder Datensatz trägt eine `organization_id`. Der Zugriff ist doppelt
abgesichert:

1. **Row Level Security** in PostgreSQL — Zugriff nur für Mitglieder der
   Organisation (`public.is_org_member`), Schreibrechte nur für `org_admin`
   und `bid_manager` (`public.has_org_role`).
2. **Serverseitige Prüfung** über `requirePermission()` in jeder Route.

Im Unterschied zu Ausschreibungsdaten, die jede angemeldete Person lesen darf,
sind Kunden- und Referenzdaten ausdrücklich **nicht** organisationsübergreifend
lesbar.

Ein Datenbank-Trigger verhindert zusätzlich, dass Referenzdaten an einer
Demo-Organisation hängen — echte Kundendaten und Demo-Daten können sich so
nicht vermischen.

---

## 6. Audit-Protokollierung

Anlegen, Ändern und Löschen von Kunden- und Referenzdaten schreibt einen
Eintrag in `audit_log` (Trigger `log_reference_change`). Protokolliert werden
**nur Metadaten**: Organisation, Benutzer, Tabelle, Datensatz-ID und
Operationsart.

Änderungen an Kundenstammdaten werden zusätzlich fachlich getrennt
protokolliert — `client_created`, `client_updated`, `client_status_changed`,
`client_notes_changed` —, ebenfalls ohne Feldinhalte. Eine Statusänderung und
eine geänderte Notiz sind eigene, nachvollziehbare Ereignisse und nicht ein
undifferenziertes „geändert".

Der Inhalt des Datensatzes wird bewusst nicht kopiert — das Audit-Log soll
nachvollziehbar machen, wer wann was geändert hat, und nicht zu einem zweiten
Speicher für Kundendaten werden.

---

## 7. Flüchtiger Entwicklungsspeicher

Ohne konfigurierte Supabase-Zugangsdaten läuft die Anwendung gegen einen
prozessinternen Speicher. Referenzdaten gehen dann beim Neustart verloren.

Die Oberfläche weist an jeder Stelle darauf hin, an der Kundendaten erfasst
werden könnten — auf `/customers` und im Importdialog. **In diesen Speicher
gehören keine echten Kundendaten.**
