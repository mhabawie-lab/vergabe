# Match Score — Subunternehmer-Radar

Wie die Anwendung bewertet, wie gut ein Partner zu einem eigenen Bedarf passt.

**Der Score ist ein erklärbares Hilfsmittel für Ihre Entscheidung — keine
automatische Vergabeentscheidung.** Er sortiert eine Liste; auswählen tun Sie.

---

## Deterministisch, nicht geschätzt

Gleiche Daten ergeben immer dasselbe Ergebnis. Es ist kein Sprachmodell
beteiligt, es gibt keine Zufallskomponente, und jede Teilbewertung wird mit
ihrer Begründung angezeigt.

Jeder Score wird mit seiner **Regelversion** gespeichert (`partner-match-v1`).
Ein Score ohne Version ließe sich nicht mit einem später berechneten
vergleichen.

---

## Gewichtung

| Kriterium | Gewicht | Warum |
|---|---|---|
| Leistung | 30 % | Passt die Leistung nicht, ist alles andere gegenstandslos |
| Region | 20 % | Entscheidet, ob der Partner überhaupt vor Ort sein kann |
| Verfügbarkeit | 20 % | Ein ausgelasteter Partner nützt im Zeitraum nichts |
| Personalkapazität | 15 % | Reicht die Mannschaft für den Bedarf? |
| Qualifikationen und Nachweise | 10 % | Eher Eintrittstor als Unterscheidungsmerkmal — abgesichert durch die harten Ausschlüsse |
| Datacenter-/Referenzerfahrung | 5 % | Im Zielsegment ausschlaggebend, aber kein Ersatz für die übrigen Kriterien |

Summe: 100 %.

---

## Harte Ausschlüsse

Ein ausgeschlossener Partner erhält **keinen** Score, sondern eine Begründung —
ein niedriger Score könnte trotzdem auf einer Shortlist landen.

1. **Gesperrter Partner** — mit dem hinterlegten Sperrgrund.
2. **Archivierter Partner.**
3. **Verbotene Weitervergabe:** Der Bedarf untersagt weitere Untervergabe, das
   Unternehmen arbeitet ausschließlich mit Subunternehmern.

---

## Die vier Ehrlichkeitsregeln

1. **Nur bestätigte Leistungen zählen.** Was ein Unternehmen über sich selbst
   sagt, wird festgehalten — es ist kein Nachweis.
2. **Abgelaufene oder ungeprüfte Nachweise zählen nicht als erfüllt.**
3. **Veraltete Verfügbarkeit gilt als unbekannt**, nicht als ihr alter Wert.
4. **Fehlende Angaben werden als fehlend ausgewiesen** und nie als positiv
   gewertet. „Wir wissen es nicht" und „ja" sind verschiedene Antworten; die
   erste als zweite zu behandeln ist der Weg, auf dem ein Partner ohne
   Papiere auf eine Baustelle kommt.

Ein Sonderfall, der dieselbe Regel befolgt: Ist **kein Einsatzgebiet**
hinterlegt, erzeugt der Firmensitz **keine** Regionspunkte. Der Sitz sagt, wo
ein Unternehmen gemeldet ist, nicht wo es arbeitet.

---

## Was die einzelnen Kriterien bewerten

### Leistung (30 %)

| Situation | Anteil |
|---|---|
| benötigte Leistung bestätigt | 100 % |
| nur selbst angegeben | 0 %, als fehlend ausgewiesen |
| andere Leistungen bestätigt | 0 % |
| gar keine Leistung erfasst | 0 %, als fehlend ausgewiesen |

### Region (20 %)

| Situation | Anteil |
|---|---|
| bundesweit, bestätigt | 100 % |
| Einsatzort im bestätigten Gebiet | 100 % |
| bundesweit oder Ort, unbestätigt | 70 % |
| Region abgedeckt, Ort nicht genannt | 80 % bzw. 55 % unbestätigt |
| außerhalb, aber Reisebereitschaft | 30 % |
| außerhalb | 0 % |

### Verfügbarkeit (20 %)

Grundwert 100 % bei „verfügbar", 60 % bei „teilweise verfügbar". Abzüge je
30 Prozentpunkte, wenn das Schichtmodell abweicht oder Nacht-, Wochenend- oder
24/7-Betrieb nicht abgedeckt ist. „Ausgelastet" und veraltete Angaben ergeben
0 %.

### Personalkapazität (15 %)

Verhältnis verfügbarer zu benötigten Mitarbeitern, gedeckelt bei 100 %. Ohne
aktuelle Zahl: 0 %, als fehlend ausgewiesen.

### Qualifikationen und Nachweise (10 %)

Anteil der geforderten Nachweise, die anerkannt und gültig vorliegen. Fehlt
einer, wird das ausdrücklich ausgewiesen.

### Datacenter-/Referenzerfahrung (5 %)

100 % bei belegter Erfahrung oder bestätigter Datacenter-Leistung, 40 % bei
selbst angegebener, 0 % bei „keine" oder „unbekannt".

---

## Was der Score nicht kann

- Er kennt **keine Preise**. Konditionen fließen bewusst nicht ein: ein
  günstiger Partner ohne Bewachungserlaubnis ist nicht der bessere.
- Er berechnet **keine Entfernungen** aus Adressen. Es zählt, was das
  Unternehmen an Einsatzgebiet angegeben hat.
- Er ersetzt **kein Gespräch**. Die höchste Punktzahl bedeutet: „hier lohnt der
  erste Anruf", nicht „hier ist der Zuschlag".

---

## Beide Speicher, ein Ergebnis

Die Bewertung liegt in `src/modules/partners/matching.ts` und wird von beiden
Speicher-Adaptern aufgerufen. Es gibt keine zweite Implementierung in SQL, die
abweichen könnte. Die Tests messen beide an denselben Fällen.
