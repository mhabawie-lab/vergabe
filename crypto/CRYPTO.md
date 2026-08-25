# CRYPTO.md — Verbindliche Regeln für CryptoRadar

Diese Datei gilt für alles unter `crypto/`. Sie ist unabhängig von der
Vergabe-Anwendung im Wurzelverzeichnis; beide Projekte teilen kein Schema und
keinen Code.

---

## 1. Architektur-Pipeline (nicht verhandelbar)

```
SOURCE → CONNECTOR → RAW → NORMALIZER → ANALYSE → SIGNAL-ENGINE → UI
```

- **Keine externe Datenquelle wird direkt an die UI gekoppelt.** UI-Code ruft
  niemals eine Börsen-API, die X-API oder einen Feed auf. Die UI liest
  ausschließlich, was `modules/analysis/service.ts` liefert.
- Jede Stufe kennt nur die Schnittstelle der vorherigen, nicht deren
  Implementierung. Der Austausch einer Börse ist oberhalb des Connectors
  unsichtbar.
- Connector-Code enthält keine Bewertungslogik. Mapping in das interne Format
  gehört in den Normalizer der Quelle, sonst nirgendwo.

## 2. Rohdaten

- **Originalpayloads bleiben unverändert erhalten** (`SocialPost.raw`). Sie
  werden nie überschrieben oder korrigiert — ein Fehler im Normalizer wird
  behoben und erneut angewendet, nicht in den Daten repariert.
- **Quelle und Original-ID werden immer mitgeführt** (`sourceId`,
  `externalId`) — bei jedem Beitrag, jeder Kerze, jedem Ticker.

## 3. Quellen

- Jede Quelle ist ein eigenes Modul unter `modules/*/sources/<quelle>/`.
- Aktivierung erfolgt über Konfiguration (`MARKET_SOURCES`, `SOCIAL_SOURCES`),
  nicht über Code-Änderungen.
- **Eine ausgefallene Quelle blockiert niemals die anderen oder die UI.**
  Isolierte Ausführung, Fehlerbehandlung pro Quelle, Status sichtbar unter
  „Quellen".
- Kein Scraping von Plattformen, die es untersagen. Wenn eine API Geld kostet,
  ist das eine Tatsache, die im UI benannt wird — kein Grund, sie zu umgehen.

## 4. Daten-Integrität & Demo-Daten

- **Synthetische Kurse und erfundene Beiträge dürfen niemals als echte
  Marktdaten dargestellt werden.**
- Demo-Datensätze tragen zwingend `isDemo = true` und werden in der UI mit
  einem sichtbaren **DEMO**-Badge gekennzeichnet.
- Ein Signal, das auf Demo-Daten beruht, trägt eine entsprechende Warnung.

## 5. Bewertung & Ehrlichkeit

Diese Regeln sind der Kern des Projekts.

- **Jeder Score liefert seine Begründung mit** (`reasons`) und seine Gegenargumente
  (`warnings`). Eine Zahl ohne Herleitung wird nicht angezeigt.
- **Konfidenz ist Teil der Anzeige, nicht eine Fußnote.** Das Unsicherheitsband
  im Messbalken ist die Hauptdarstellung des Scores.
- **Social-Stimmung darf ein Chartbild nur neigen, nie erzeugen.** Die
  Obergrenze steht als Konstante in `modules/signals/engine.ts`. Stimmung ist
  ein nachlaufendes, manipulierbares Signal.
- **Auffällige Aufmerksamkeit ohne technische Bestätigung ist eine Warnung,
  kein Pluspunkt.**
- **Im Zweifel niedrigere Konfidenz.** Ein hoher Score auf dünner Datenlage
  erhält kein Kaufurteil.
- Es werden keine Kursprognosen erzeugt und keine Renditeversprechen gemacht.

## 6. Handel

- **Papierhandel und Live-Handel teilen niemals einen Ausführungspfad.** Eine
  Fehlkonfiguration darf aus einer simulierten Order keine echte machen können.
- Der Füllkurs kommt immer serverseitig aus der Marktquelle, nie aus dem
  Formular.
- Live-Handel bleibt hinter `LIVE_TRADING_ENABLED` gesperrt und wird erst
  freigeschaltet, wenn eine Strategie im Papierhandel nachgewiesen ist.
- Ein automatisch handelnder Bot benötigt harte Risikogrenzen (Positionsgröße,
  Stop-Loss, Tagesverlustlimit, Not-Aus), bevor er echtes Geld anfassen darf.

## 7. Sicherheit

- **Keine API-Keys, Tokens oder Zugangsdaten im Quellcode.** Niemals.
- Secrets ausschließlich über Environment Variables; `.env.example` dokumentiert
  sie ohne Werte. `.env*` außer `.env.example` ist in `.gitignore`.
- Börsen-Keys werden ausschließlich serverseitig verwendet und nie an den
  Client gegeben.
- Logausgaben enthalten keine Secrets — `redactSecrets` filtert vor der Ausgabe.

## 8. Code-Qualität

- **TypeScript strict** ist verpflichtend, inklusive `noUncheckedIndexedAccess`.
  Kein `any` ohne begründeten Ausnahmefall.
- Domänenlogik gehört nicht in React-Komponenten und nicht in Server Actions —
  Actions orchestrieren nur.
- Indikatoren und Handelslogik sind reine Funktionen und werden getestet.
- **Responsive** für Desktop, Tablet und Smartphone.
- Deutsch als UI-Sprache; Code, Bezeichner und Kommentare auf Englisch.

## 9. Fehlerbehandlung & Logging

- Strukturiertes Logging mit Kontext (Quelle, Stufe, Asset).
- Fehler werden nicht stillschweigend verschluckt. Ein Beitrag, der nicht
  normalisiert werden kann, wird protokolliert, nicht ignoriert.
- Der Zustand ist sichtbar: Quellen-Status statt lautlosem Scheitern.
