# Subunternehmer-Radar — Anleitung

Ein **rein internes** Werkzeug: Hier führen Sie Unternehmen, die als Sub- oder
Nachunternehmer für Sie arbeiten können, und Unternehmen, die selbst
Subunternehmer suchen und damit als Auftraggeber in Frage kommen.

---

## Was dieser Bereich ausdrücklich nicht ist

Es entsteht **keine Partnerbörse und kein Marktplatz**. Fremde Unternehmen sind
hier Datensätze, keine Beteiligten. Sie

- legen **kein Benutzerkonto** an,
- pflegen **kein öffentliches Partnerprofil**,
- veröffentlichen **keine Gesuche**,
- senden **keine Bewerbungen** über die Plattform,
- sehen **keine internen Daten** — auch nicht die über sie selbst.

Es gibt keine öffentliche Suche, kein Nachrichtensystem, keine
Zahlungsabwicklung, kein automatisches Web-Scraping und keine Anbindung an
Premiumdatenbanken. Jede Anforderung, die eines dieser Dinge einführen würde,
ist eine Richtungsänderung und gehört zuerst in `PROJECT_PLAN.md`.

---

## Beide Richtungen sauber trennen

Ein Unternehmen kann in zwei Richtungen interessant sein — und die dürfen nicht
verwechselt werden:

| Richtung | Bedeutung |
|---|---|
| **Kann für uns arbeiten** | kommt als Sub- oder Nachunternehmer in Frage |
| **Sucht Subunternehmer** | vergibt selbst und kommt als Auftraggeber in Frage |
| **Beide Richtungen** | beides zugleich |
| **Unbekannt** | noch nicht bestimmt |

Zusätzlich wird die mögliche Ebene in einer Kette geführt: Hauptunternehmer,
Nachunternehmer, Subunternehmer, weiterer Subunternehmer, unbekannt.

Ein **Signal** („Firma X sucht Sicherheitsdienst") ändert die gespeicherte
Richtung **nie automatisch**. Die Anwendung schlägt eine Änderung vor; bestätigen
muss sie ein Mensch. Eine einzelne Beobachtung reicht nicht aus, um ein
Unternehmen umzuklassifizieren, für das Sie vielleicht selbst arbeiten.

---

## Namensentscheidung

Die Tabellen heißen `partner_companies`, nicht `subcontractors`. Ein Datensatz
kann für uns arbeiten, uns beauftragen oder beides — die Tabelle nach nur einer
dieser Richtungen zu benennen würde die falsche Annahme in jede Abfrage
einbauen. Die Oberfläche behält den betrieblichen Begriff
**Subunternehmer-Radar**.

---

## Seiten

| Seite | Zweck |
|---|---|
| `/subcontractors` | Firmenübersicht mit allen Filtern und Kennzahlen |
| `/subcontractors/new` | Partner anlegen |
| `/subcontractors/[id]` | Detailseite mit 13 Registern |
| `/subcontractors/[id]/edit` | Partner bearbeiten |
| `/subcontractors/signals` | „Firmen suchen Subunternehmer" |
| `/subcontractors/needs` | Eigener Bedarf und Matches |
| `/subcontractors/needs/new` | Bedarf anlegen |
| `/subcontractors/needs/[id]` | Bedarf mit Match-Liste und Begründung |
| `/subcontractors/assignments` | Projektzuordnungen und Nachunternehmerkette |
| `/subcontractors/credentials` | Ablaufüberwachung der Nachweise |
| `/subcontractors/activities` | Aktivitäten und fällige Wiedervorlagen |
| `/subcontractors/import` | Partnerimport |

---

## Fakt, Angabe, Hinweis — die wichtigste Unterscheidung

Die Oberfläche trennt vier Dinge sichtbar, weil davon abhängt, ob ein Partner
einem Kunden angeboten werden kann:

| | Bedeutung | Farbe | Zählt im Match? |
|---|---|---|---|
| **Bestätigt** | belegt und geprüft | grün | **ja** |
| **Selbst angegeben** | das Unternehmen sagt es | gelb | nein |
| **Hinweis / Signal** | eine Beobachtung mit Quelle | grau, mit Konfidenz | nein |
| **Abgelaufen / gesperrt** | nicht mehr gültig | rot | nein |

---

## Leistungen

Erfasst wird die Leistungsart, ihr Zustand (bestätigt, selbst angegeben,
Vorschlag, verworfen, unbekannt), die Herkunft der Aussage, verfügbare
Mitarbeiter und ob die Leistung selbst erbracht oder weitervergeben wird.

Eine **unbestimmte Leistungsart lässt sich nicht bestätigen** — das wäre die
Behauptung, etwas festgestellt zu haben, was nicht festgestellt wurde.

---

## Verfügbarkeit altert

Eine Verfügbarkeitsangabe trägt den Zeitpunkt ihrer letzten Bestätigung:

| Alter | Zustand | Zählt als aktuell? |
|---|---|---|
| bis 28 Tage | Aktuell bestätigt | ja |
| bis 42 Tage | Bestätigung wird älter | ja, mit Hinweis |
| über 42 Tage | Seit Langem nicht bestätigt | **nein** |
| nie bestätigt | Nie bestätigt | **nein** |

Veraltete Angaben bleiben sichtbar — sie sind das Letzte, was Sie wissen —,
gelten aber im Match als *unbekannt*, nicht als ihr alter Wert.

Das Kästchen „Soeben mit dem Unternehmen bestätigt" setzt den Zeitstempel. Es
ist eine bewusste Handlung, kein Nebeneffekt des Speicherns.

---

## Nachweise und Ablaufüberwachung

Unterstützt: Gewerbeanmeldung, Handelsregisterauszug, Bewachungserlaubnis,
Haftpflichtversicherung, Unbedenklichkeitsbescheinigung, Zertifikate,
Qualifikations- und Referenznachweise, Vertraulichkeitsvereinbarungen, Sonstiges.

Regeln:

- Ein Nachweis zählt nur, wenn er **anerkannt** und **nicht abgelaufen** ist.
- Ein **Ablaufdatum wird nie geschätzt**. Fehlt es, gilt der Nachweis als „ohne
  Ablaufdatum" — nicht als unbefristet gültig.
- Pflichtnachweise sind Gewerbeanmeldung, Bewachungserlaubnis und
  Haftpflichtversicherung. Fehlen sie, weist die Liste das aus.
- `/subcontractors/credentials` zeigt abgelaufene sowie in 30, 60 und 90 Tagen
  ablaufende Nachweise und ungeprüfte Dokumente.

**Keine E-Mail-Benachrichtigungen, keine Hintergrundautomatik.** Die Liste wird
bei jedem Aufruf berechnet. Es wird nichts vorgetäuscht, was nicht läuft.

### Dokumente

Dokumente liegen in einem **privaten** Speicher ohne öffentliche URL; der
Zugriff erfolgt ausschließlich über kurzlebige signierte Links, die
serverseitig erzeugt werden. Der Service-Role-Key gelangt nie in den Browser.

In dieser Phase werden **ausschließlich Metadaten** erfasst — kein Dateiinhalt
hochgeladen, keine Schadsoftwareprüfung durchgeführt. Der Scanstatus bleibt
deshalb „nicht geprüft". Was gegen ein echtes Supabase-Projekt noch
einzurichten ist, steht in `docs/supabase-setup.md`.

---

## Konditionen

Verhandelte Preise sind die vertraulichsten Daten dieses Bereichs. Sie
erfordern die eigene Berechtigung `subcontractors:financial`; ohne sie ist das
Register gar nicht sichtbar — ein leeres Register würde bereits verraten, dass
es Preise gibt.

Beträge werden **nicht** im Audit-Log gespeichert.

---

## Signale — Firmen, die Subunternehmer suchen

Ein Signal ist eine **Beobachtung**, keine Tatsache. Jedes Signal trägt:

- eine **Pflicht-Quellenangabe** (Art plus Bezeichnung oder Fundstelle)
- ein Beobachtungsdatum
- eine Konfidenz (gering / mittel / hoch)
- optional ein Gültigkeitsdatum

Hohe Konfidenz setzt eine belegbare Quelle voraus. Ein Signal ohne Quelle wird
nicht gespeichert — ein Hinweis, dessen Herkunft niemand nachvollziehen kann,
wird später wie eine Tatsache gelesen.

Entscheidungen: als geprüft markieren, als relevant markieren, Kontaktaufnahme
dokumentieren, als erledigt markieren, verwerfen, als abgelaufen markieren. Ein
abgelaufenes oder verworfenes Signal bleibt sichtbar, zählt aber nicht mehr als
aktueller Bedarf.

Signale werden **manuell oder über den geschützten Import** angelegt. Es findet
kein automatisches Web-Scraping statt.

---

## Eigener Bedarf und Matches

Unter `/subcontractors/needs` halten Sie fest, für welches eigene Projekt Sie
einen Partner brauchen. Diese Einträge sind **niemals öffentlich** und werden
nirgends ausgeschrieben.

Die Match-Berechnung ist deterministisch und erklärbar — Einzelheiten in
[`docs/match-score.md`](./match-score.md).

---

## Nachunternehmerkette

Eine Projektzuordnung kann einer anderen untergeordnet werden. So entsteht:

```
Unser Unternehmen
└─ Nachunternehmer A            (Ebene 1)
   └─ weiterer Subunternehmer B (Ebene 2)
```

- Höchstens **sechs Ebenen**; tiefere Ketten sind fast immer ein Datenfehler.
- **Kreise werden verhindert** — in der Anwendung und in der Datenbank.
- Eine weitere Ebene ist nur möglich, wenn die übergeordnete Zuordnung
  Untervergabe **ausdrücklich erlaubt**. „Unbekannt" ist keine Erlaubnis.
- Ein **später gesperrter Partner bleibt in einer bestehenden Kette sichtbar**.
  Er war dort im Einsatz; diesen Umstand nachträglich verschwinden zu lassen
  würde die Kette wertlos machen.

---

## Öffentliche Kennungen

Handelsregisternummer, Umsatzsteuer-ID, LEI und Website-Domain werden als
**Quellenhinweis** gespeichert, damit sich später sauber verknüpfen lässt. Es
findet **keine automatische Anreicherung** statt, es werden keine Orbis- oder
Moody's-Daten kopiert und keine Premiumdaten ohne Lizenz verwendet.

Öffentliche Quellenhinweise bleiben von privaten Notizen, Preisen, Bewertungen
und Dokumenten getrennt.

---

## Interne Bewertung

Die Bewertung 1–5 ist **subjektiv** und wird überall als interne Einschätzung
gekennzeichnet. Sie ist keine objektive Qualitätsaussage und für niemanden
außerhalb Ihrer Organisation sichtbar.

---

## Sperren

Eine Sperrung **benötigt eine Begründung** — ohne sie ist sie ein halbes Jahr
später nicht mehr nachvollziehbar. Ein gesperrter Partner

- wird aus allen **neuen** Matches ausgeschlossen,
- kann nicht auf eine Shortlist gesetzt werden,
- kann nicht zugleich „bevorzugt" sein,
- bleibt in der Liste und in bestehenden Ketten **sichtbar**.

---

## Ohne Supabase

Ist keine Datenbank konfiguriert, läuft die Anwendung gegen einen
prozessinternen Speicher. Die Oberfläche weist darauf hin. **Dort gehören keine
echten Firmendaten hinein** — sie gehen beim Neustart verloren.
