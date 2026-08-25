# Kundenverwaltung — Anleitung

Eigene Geschäftskunden pflegen. Die Funktion liegt unter **Kunden**
(`/customers`). Lesen darf jede angemeldete Person der Organisation
(`clients:read`); Anlegen und Bearbeiten sind an `clients:write` gebunden
(Rolle `bid_manager` oder `org_admin`).

Kunden sind **nicht** dasselbe wie öffentliche Auftraggeber aus
Vergabeverfahren. Die beiden Domänen werden nie zusammengeführt; Näheres in
`docs/database-schema.md`, Abschnitt „Zwei getrennte Welten".

---

## Kunde anlegen

`/customers` → **Kunde anlegen**

| Feld | Pflicht | Anmerkung |
|---|---|---|
| Firmenname | **ja** | höchstens 200 Zeichen |
| Land | nein | zweistelliger Ländercode, z. B. `DE` |
| Website | nein | eine bloße Domain genügt, `https://` wird ergänzt |
| Interne Notizen | nein | höchstens 4.000 Zeichen, nur für die eigene Organisation |
| Kunde ist aktiv | — | steuert Filter und die Kennzahl „Aktive Kunden" |

Die **Schreibweise des Namens bleibt unverändert**. Daneben wird eine
Vergleichsform gebildet — kleingeschrieben, ohne Akzente, ohne Rechtsform —,
die das Formular direkt unter dem Feld anzeigt. Sie ist die Grundlage der
Dublettenprüfung und der Eindeutigkeit je Organisation.

Leere Felder bleiben leer. Weder Ort noch Region noch Land werden aus anderen
Angaben abgeleitet.

---

## Dubletten

| Situation | Verhalten |
|---|---|
| Gleiche Vergleichsform | **Fehler** — der Kunde existiert bereits, die Meldung nennt ihn |
| Ähnliche Vergleichsform | **Warnung** — Speichern erst nach ausdrücklicher Bestätigung |

Bei einer Warnung wird beim ersten Versuch **nichts** gespeichert. Das Formular
zeigt den ähnlichen Kunden und ein Kästchen „Ich habe geprüft, dass es sich um
einen anderen Kunden handelt"; erst danach schreibt der zweite Versuch.

Es wird **nie automatisch zusammengeführt**. Zwei ähnlich geschriebene Firmen
können zwei verschiedene Unternehmen sein, und das Verschmelzen zweier
Kundenakten lässt sich nicht sinnvoll rückgängig machen.

Die Prüfung greift auch beim Bearbeiten — der bearbeitete Datensatz gilt dabei
nicht als seine eigene Dublette.

---

## Kunde bearbeiten

`/customers/<id>` → **Kunde bearbeiten**

Ändert sich nichts, wird auch nichts geschrieben und nichts protokolliert.
**Abbrechen** verwirft die Eingaben ohne Rückfrage.

Ein Kunde einer anderen Organisation ist über diese Seite nicht erreichbar: die
Anwendung antwortet mit „nicht gefunden", nicht mit „keine Berechtigung" — sonst
ließe sich die Existenz fremder Datensätze abfragen.

---

## Protokollierung

Jede Änderung schreibt einen Eintrag in `audit_log`:

| Aktion | Ereignis |
|---|---|
| `client_created` | Kunde angelegt |
| `client_updated` | Kunde bearbeitet (mit der Liste der geänderten Felder) |
| `client_status_changed` | aktiv/inaktiv umgestellt |
| `client_notes_changed` | interne Notizen geändert |

Protokolliert werden **nur Metadaten** — welche Felder sich geändert haben, nie
deren Inhalt. Das Audit-Log soll nachvollziehbar machen, wer wann was geändert
hat, und nicht zu einem zweiten Speicher für Kundendaten werden
(`docs/data-protection.md`, Abschnitt 6).

---

## Kundenliste

Filter: Suche, Status (aktiv/inaktiv), Ort, Leistungsart. Angezeigt werden je
Kunde die Zahl der Referenzprojekte, die aktiven Projekte, die Standorte, die
**bestätigten** Leistungsarten und der letzte Projektzeitraum.

Unbestätigte Leistungsvorschläge erscheinen hier bewusst nicht — sie sind kein
Nachweis (`docs/data-protection.md`, Abschnitt 3).

Ein Kunde mit ähnlich geschriebenem Namen trägt in der Liste den Hinweis
„Mögliche Dublette".

---

## Ohne Supabase

Ist keine Datenbank konfiguriert, läuft die Anwendung gegen einen
prozessinternen Speicher. Die Kundenseiten weisen darauf hin. **Dort gehören
keine echten Kundendaten hinein** — sie gehen beim Neustart verloren.
