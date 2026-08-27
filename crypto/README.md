# CryptoRadar

Marktanalyse, Social-Stimmung und Papierhandel für Kryptowährungen — als
eigenständige Next.js-Anwendung unter `crypto/`. Sie teilt keinen Code und kein
Schema mit der Vergabe-Anwendung im Wurzelverzeichnis.

Die Leitidee: **Messen statt raten.** Jede Bewertung zeigt ihre Herleitung, ihre
Gegenargumente und ihre Unsicherheit. Ein hoher Score auf dünner Datenlage sieht
in der Oberfläche auch dünn aus.

## Schnellstart

```bash
cd crypto
npm install
npm run dev
```

Die App läuft dann auf http://localhost:3000 — **ohne jede Konfiguration**, im
DEMO-Modus mit synthetischen Kursen und erfundenen Beiträgen. Alles Synthetische
ist mit einem **DEMO**-Badge gekennzeichnet.

Für echte Daten `.env.example` nach `.env.local` kopieren und ausfüllen.

## Was drin ist

| Bereich | Inhalt |
|---|---|
| **Radar** (`/`) | Rangliste aller beobachteten Coins auf einer gemeinsamen 0–100-Skala, mit Kurs, 24-h-Änderung, Verlauf und Urteil |
| **Coin-Detail** (`/coins/BTC`) | Kerzenchart, Indikatoren, vollständige Score-Herleitung, Einschränkungen, Beiträge, Order-Formular |
| **Stimmung** (`/social`) | Was auf X, Reddit und in Nachrichtenfeeds über die Coins geschrieben wird, inkl. aussortierter Pump-Werbung |
| **Depot** (`/depot`) | Simuliertes Portfolio, Positionen, Handelsbuch, Gewinn/Verlust |
| **Quellen** (`/quellen`) | Welche Anbindung läuft, welche nicht und warum |

### Analyse

- **Technisch:** EMA 20/50, RSI 14, MACD, Bollinger-Bänder, ATR 14 — als reine,
  getestete Funktionen in `src/modules/indicators/`.
- **Sozial:** Lexikon-basierte Stimmungsauswertung mit Reichweiten-Gewichtung,
  Negationserkennung und einem Filter für Pump-und-Dump-Beiträge.
- **Signal:** kombiniert beides zu Score (0–100) und Urteil
  (Kaufen / Beobachten / Meiden) — immer mit Begründung und Warnungen.

## Datenquellen

| Quelle | Zugangsdaten | Hinweis |
|---|---|---|
| Binance | keine | öffentliche Marktdaten, beste Abdeckung |
| CoinGecko | keine | Rückfall, gröbere Kerzen, kein Volumen im OHLC |
| Reddit | keine | eigener `REDDIT_USER_AGENT` empfohlen |
| RSS-News | keine | Feeds über `NEWS_FEED_URLS` konfigurierbar |
| X (Twitter) | `X_BEARER_TOKEN` | **kostenpflichtig** — Lesen erfordert mindestens den Basic-Plan |
| Demo | keine | synthetisch, immer als DEMO gekennzeichnet |

Fällt eine Quelle aus, laufen die übrigen weiter; der Status steht unter
`/quellen`.

### Zu X (Twitter)

Das Lesen von Posts über die offizielle API kostet Geld — der frei verfügbare
Zugang erlaubt praktisch keine Suche mehr. Die Alternative wäre Scraping, was
gegen die Nutzungsbedingungen verstößt und zur Sperrung des Accounts führt, der
gescraped hat. Deshalb ist der Connector implementiert, aber ohne Token
inaktiv — Reddit und die Nachrichtenfeeds liefern in der Zwischenzeit
brauchbares Material.

## Handel

Der Papierhandel führt Orders zum aktuellen Kurs aus, inklusive 0,1 % Gebühr,
und bucht sie in ein Depot mit 10.000 USD Startkapital. Der Füllkurs kommt immer
serverseitig aus der Marktquelle, nie aus dem Formular.

**Live-Handel ist bewusst noch nicht implementiert.** Der Schalter
`LIVE_TRADING_ENABLED` existiert, damit Papier- und Live-Pfad von Anfang an
getrennt sind. Bevor echtes Geld bewegt wird, fehlen noch: Börsen-Adapter mit
signierten Orders, harte Risikogrenzen (Positionsgröße, Stop-Loss,
Tagesverlustlimit, Not-Aus) und ein Backtest, der die Strategie über historische
Daten prüft.

## Grenzen — ehrlich

- **Das ist keine Anlageberatung und kein Prognosemodell.** Der Score bewertet
  die aktuelle Lage, er sagt keinen Kurs voraus.
- **Stimmungsauswertung ist grob.** Ein Lexikon erkennt keine Ironie und kein
  unbekanntes Slang. Deshalb wird jeder Stimmungswert mit einer Konfidenz
  ausgeliefert, die bei dünner Datenlage klein bleibt — und der Signal-Engine
  ist es untersagt, Stimmung ein Chartbild überstimmen zu lassen.
- **Social-Aufmerksamkeit korreliert oft mit lokalen Hochs, nicht mit Chancen.**
  Auffälliger Buzz ohne technische Bestätigung erzeugt deshalb eine Warnung
  statt Punkten.
- **Backtest fehlt noch.** Ohne ihn ist keine Aussage über die Trefferquote der
  Regeln möglich, und es wird auch keine behauptet.

## Entwicklung

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run test        # Vitest
npm run verify      # alles zusammen plus Build
```

Die verbindlichen Architektur- und Sicherheitsregeln stehen in `CRYPTO.md`.
