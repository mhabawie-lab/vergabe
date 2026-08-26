# Privater Dokumentenspeicher

Nachweise, Versicherungspolicen und Kundenunterlagen liegen in **privaten**
Buckets. Es gibt keinen öffentlichen Bucket, keine öffentliche Objekt-URL und
keinen Weg, eine dauerhafte Adresse auf eine dieser Dateien zu erzeugen.

---

## 1. Drei Buckets

| Bucket | Inhalt | Berechtigung lesen | löschen |
| --- | --- | --- | --- |
| `reference-documents` | Kunden- und Referenzunterlagen | `references:read` | `clients:write` |
| `partner-documents` | Nachweise Dritter | `subcontractors:documents` | `subcontractors:admin` |
| `organization-documents` | eigene Unternehmensnachweise | `company:read` | `company:write` |

Alle drei: `public = false`, Größenlimit **25 MB**, erlaubte Typen
`application/pdf`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`text/csv`, `image/png`, `image/jpeg`.

Angelegt werden sie in `0015_document_storage.sql` per
`insert … on conflict (id) do nothing` — die Migration überschreibt also keinen
bestehenden Bucket.

Getrennte Buckets statt eines gemeinsamen, weil die drei Inhalte
unterschiedlich vertraulich sind: Partnerunterlagen gehören einem Dritten und
brauchen einen engeren Kreis als das eigene Zertifikat (`CLAUDE.md` § 11).

---

## 2. Objektpfad

```
<organization_id>/<entity_type>/<entity_id>/<uuid>-<bereinigter_dateiname>
```

* Das **erste Segment ist die Organisation**. Darauf setzen die
  Storage-Policies auf (`docs/rls-security.md` § 4).
* Der **UUID-Präfix** verhindert Kollisionen und Erraten.
* Der Dateiname wird für den Objektschlüssel bereinigt: Pfadanteile entfernt,
  Umlaute aufgelöst, alles außer `a–z 0–9 . _ -` ersetzt, führende Punkte und
  Striche entfernt; bleibt nichts übrig, heißt die Datei `dokument`.
* **Der Originalname bleibt erhalten** — in der Spalte `original_file_name`.
  Die Anwendung zeigt ihn an. Eine stille Umbenennung der Datei einer Person
  wäre Datenverlust.

---

## 3. Prüfungen beim Upload

In dieser Reihenfolge, jede kann ablehnen:

1. Berechtigung für den Eigentümertyp (`src/modules/documents/permissions.ts`).
2. Der Eigentümer gehört zur Organisation der Sitzung.
3. Größe ≤ 25 MB.
4. MIME-Typ in der Positivliste **und** passend zur Dateiendung. Beide müssen
   erlaubt sein und zueinander passen — ein `.exe`, das sich als PDF ausgibt,
   fällt an der Endung, ein PDF mit falscher Endung am Typ.
5. Der berechnete Pfad beginnt mit der Organisation der Sitzung.

Anschließend wird der SHA-256-Hash des Inhalts gebildet und mitgespeichert. Er
erlaubt später, eine Datei wiederzuerkennen, ohne sie erneut zu laden.

Schlägt der Metadatensatz nach erfolgreichem Upload fehl, wird das Objekt
wieder entfernt: kein verwaistes Objekt ohne Datenbankzeile.

---

## 4. Download

Downloads laufen ausschließlich über kurzlebige signierte Links:

```
POST /api/v1/documents/<id>/download   →   { url, expiresAt }
```

* Laufzeit: `STORAGE_SIGNED_URL_TTL_SECONDS`, Standard **300 Sekunden**.
* Der Link wird **nirgends gespeichert** — nicht in der Datenbank, nicht im
  Auditprotokoll, nicht im Log. Protokolliert wird, dass jemand ein Dokument
  angefordert hat, nicht wie man an die Datei kommt.
* Der Link wird mit der Sitzung des Aufrufers erzeugt, nicht mit dem Secret
  Key. Fehlt die Berechtigung, verweigert Storage ihn — selbst wenn die
  Anwendung sich irrt.
* Die Oberfläche rendert nie ein dauerhaftes `href` auf eine Datei; der Link
  entsteht erst beim Klick.

---

## 5. Archivieren, löschen, aufbewahren

* **Archivieren** ist der Normalfall: `lifecycle = 'archived'`, `archived_at`
  und `archived_by` werden gesetzt, Datei und Zeile bleiben.
* **Löschen** entfernt Objekt und Zeile und braucht eine eigene, engere
  Berechtigung (Tabelle in § 1). Es ist nie ein Nebeneffekt einer anderen
  Aktion.
* Beides erzeugt einen Auditeintrag mit Metadaten — Eigentümertyp, Dokument-ID,
  Aktion —, **nie** mit Dateiinhalt, Dateiname oder Notiztext
  (`CLAUDE.md` § 10).

---

## 6. Schadsoftware: nicht geprüft, und das steht auch so da

Es ist **kein** Virenscanner angebunden. Deshalb:

* `scan_status` steht auf `not_scanned` und wird von der Anwendung nie auf
  einen anderen Wert gesetzt.
* Die Oberfläche schreibt „Malware-Scan nicht verfügbar" bzw. „nicht geprüft".
  Nirgends steht „geprüft" oder „sicher".
* `capabilities().malwareScanning` ist in beiden Adaptern `false`; die
  Statusseite zeigt denselben Wert.

Eine vorgetäuschte Prüfung wäre schlimmer als keine: sie würde jemanden dazu
bringen, eine fremde Datei zu öffnen, weil die Anwendung sie „geprüft" nennt.
Der Anschluss eines echten Scanners ist in `PROJECT_PLAN.md` vermerkt; erst
dann darf `scan_status` andere Werte annehmen.
