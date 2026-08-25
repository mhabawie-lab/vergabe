# Partnerimport — Anleitung

Wie Partnerdaten in den Subunternehmer-Radar kommen. Die Funktion liegt unter
`/subcontractors/import` und erfordert `subcontractors:write`.

---

## Unterstützte Formate

| Format | Stand |
|---|---|
| CSV | unterstützt — Trennzeichen wird selbst erkannt |
| XLSX | unterstützt — es wird das erste Tabellenblatt gelesen |
| Manuell | unterstützt — Einzelerfassung über „Partner anlegen" |
| PDF | **nicht** — Tabellenerkennung und OCR sind nicht Teil dieser Phase |

Grenzen: maximal 10 MB und 5.000 Zeilen pro Datei.

---

## Erkannte Spalten

Firmenname (**Pflicht**), Handelsname, Beziehungsrichtung, Unternehmensebene,
Leistung, Land, Bundesland, Ort, PLZ, Radius, Ansprechpartner, E-Mail, Telefon,
Website, Verfügbare Mitarbeiter, Verfügbar ab, Eigene Mitarbeiter, Weitere
Untervergabe, Datacenter-Erfahrung, Partnerstatus, Verifizierungsstatus, Sucht
Subunternehmer, Signaltyp, Projekt, Quelle, Quellen-URL, Letzter Kontakt,
Wiedervorlage, Notiz.

Abweichende Überschriften lassen sich im dritten Schritt von Hand zuordnen. Eine
Vorlage steht im Dialog zum Herunterladen bereit — jeder Wert darin ist
erkennbar erfunden.

---

## Ablauf

1. **Datei auswählen** — CSV oder XLSX
2. **Spalten erkennen** — automatisch, mit „Eindeutig", „Vermutet" oder „Manuell"
3. **Zuordnung prüfen** — jede Spalte korrigierbar oder abwählbar
4. **Vorschau** — die ersten 50 Zeilen mit ihren normalisierten Werten
5. **Validierung** — je Zeile gültig, Warnung oder Fehler
6. **Hinweise lesen** — an der betroffenen Zeile
7. **Dublettenprüfung** — gegen den gespeicherten Bestand und innerhalb der Datei
8. **Testlauf** — analysiert alles, **speichert nichts**
9. **Import bestätigen** — erst dieser Schritt schreibt
10. **Ergebnis** — importierte, übersprungene und fehlerhafte Zeilen

Schritt 8 und 9 laufen durch denselben Code. Ein Testlauf zeigt daher genau
das, was der echte Import tun würde.

---

## Was geprüft wird

| Prüfung | Schwere | Verhalten |
|---|---|---|
| Firmenname fehlt | Fehler | Zeile wird nicht importiert |
| Firmenname doppelt in der Datei | Fehler | Zeile wird nicht importiert |
| Firma bereits erfasst | Fehler | Zeile wird nicht importiert |
| Ähnlich geschriebene Firma | Warnung | Hinweis, keine Zusammenführung |
| Ungültige Website | Warnung | Feld bleibt leer |
| Ungültige E-Mail | Warnung | Feld bleibt leer |
| Unlesbares Datum | Warnung | Feld bleibt leer |
| Unbekannte Leistungsart | Warnung | bleibt unbestimmt |
| Ja/Nein nicht verstanden | Warnung | bleibt unbestimmt |
| Signal ohne Quelle | Warnung | Partner wird angelegt, Signal nicht |

**Zeilen mit Fehlern werden nie importiert.** Zeilen mit Warnungen nur, wenn das
Kästchen „Zeilen mit Warnungen mit importieren" gesetzt ist.

---

## Was der Import bewusst *nicht* tut

- Eine importierte **Leistung** gilt als *selbst angegeben*, nie als bestätigt.
  Eine Tabellenzelle ist eine Behauptung, kein geprüfter Nachweis.
- Eine importierte **Verfügbarkeit** ist unbestätigt und altert sofort.
- **Datacenter-Erfahrung** wird höchstens als *selbst angegeben* übernommen,
  nie als belegt.
- Ein **Einsatzgebiet** aus dem Import ist unbestätigt.
- Ein **Signal** entsteht nur, wenn die Zeile eine Quelle nennt.
- Es wird **nichts automatisch korrigiert**. Vermutete Schreibfehler erscheinen
  als Vorschlag.
- **Rohdaten bleiben unverändert.** Die Quellzeile wird unter `raw_data`
  gespeichert, der bereinigte Vorschlag getrennt daneben.

---

## Datenschutz

Echte Partnerdaten gehören **nie** in eine Datei im Projektverzeichnis. Sie
gelangen ausschließlich über diese geschützte Importfunktion in die Datenbank.
`.gitignore` schließt private Importdateien aus; die einzige verfolgte
Datendatei ist die anonymisierte Vorlage.

Ohne konfigurierte Datenbank landet der Import im flüchtigen
Entwicklungsspeicher. Der Dialog weist darauf hin.
