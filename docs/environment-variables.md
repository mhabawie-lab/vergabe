# Umgebungsvariablen

Alle Werte gehören in `.env.local` (lokal) oder in die Umgebung der
Deployment-Plattform — **niemals** ins Repository (`CLAUDE.md` § 5).
`.env.example` dokumentiert jede Variable mit Platzhalter, nie mit echtem Wert.

---

## 1. Übersicht

| Variable | Ort | Pflicht | Zweck |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | für Supabase | Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + Server | für Supabase | RLS-gebundener Schlüssel für Browser und Server-Rendering |
| `SUPABASE_SECRET_KEY` | **nur Server** | für Ingestion | umgeht RLS; ausschließlich Ingestion und Wartung |
| `SUPABASE_PROJECT_REF` | nur Server | optional | Projektkennung für CLI und Statusseite |
| `DATABASE_URL` | nur Server | optional | direkte Postgres-Verbindung für Migrationen und SQL-Tests |
| `DATA_BACKEND` | nur Server | empfohlen | `supabase` oder `memory`, siehe § 3 |
| `NEXT_PUBLIC_DATA_BACKEND` | Browser | optional | derselbe Wert, wenn die Wahl im Browser sichtbar sein soll |
| `ALLOW_MEMORY_BACKEND_IN_PRODUCTION` | nur Server | nein | einzige Ausnahme, siehe § 3 |
| `STORAGE_SIGNED_URL_TTL_SECONDS` | nur Server | nein | Laufzeit signierter Download-Links, Standard 300 |
| `INGESTION_TRIGGER_SECRET` | nur Server | für Ingestion | schützt `/api/v1/internal/ingestion/run` |
| `ANTHROPIC_API_KEY` | nur Server | Phase 5 | KI-Analyse |
| `LOG_LEVEL` | nur Server | nein | `debug`, `info`, `warn`, `error` |

`NEXT_PUBLIC_*` ist der einzige Präfix, den Next.js in das Browser-Bundle
einsetzt. Was diesen Präfix trägt, ist damit öffentlich — deshalb steht dort
nie ein Geheimnis.

---

## 2. Zwei getrennte Module

```
src/lib/env/public.ts   ← browsersicher, kennt nur NEXT_PUBLIC_*
src/lib/env/server.ts   ← 'server-only', liest zusätzlich die Geheimnisse
src/lib/env.ts          ← Serverfassade, re-exportiert beides
```

Client-Komponenten importieren ausschließlich `@/lib/env/public`. Dass ein
Geheimnis nicht im Bundle landet, ist damit an der Import-Zeile ablesbar und
hängt nicht am Verhalten des Bundlers. `src/lib/env/server.ts` beginnt mit
`import 'server-only'`: ein versehentlicher Import aus einer
Client-Komponente scheitert beim Build, nicht erst zur Laufzeit.

Geprüft wird das doppelt (`tests/onboarding.test.ts`,
`tests/infrastructure.test.ts`): das öffentliche Modul darf die Namen
`SUPABASE_SECRET_KEY` und `SUPABASE_SERVICE_ROLE_KEY` nicht einmal enthalten.

---

## 3. `DATA_BACKEND` — keine stillen Rückfälle

`DATA_BACKEND` bestimmt, woher die Anwendung liest und wohin sie schreibt:

* `supabase` — die Datenbank. Fehlt die Konfiguration, **bricht der Start mit
  einer Fehlermeldung ab**. Es wird nicht auf den flüchtigen Speicher
  zurückgefallen.
* `memory` — ein prozessinterner Speicher für die lokale Entwicklung. In der
  Produktion unzulässig, außer `ALLOW_MEMORY_BACKEND_IN_PRODUCTION=true` ist
  ausdrücklich gesetzt.

Ist `DATA_BACKEND` nicht gesetzt, gilt:

| Supabase konfiguriert | `NODE_ENV` | Ergebnis |
| --- | --- | --- |
| ja | egal | `supabase` |
| nein | development | `memory`, mit Hinweis im Log |
| nein | production | **Fehler**, kein Start |

Die Entscheidung fällt genau einmal (`resolveBackend()` in
`src/lib/env/server.ts`) und wird protokolliert. Kein `catch` irgendwo im
Datenzugriff wechselt das Backend — ein Supabase-Fehler wird als Fehler
sichtbar, nicht als leere Liste (`CLAUDE.md` § 8).

---

## 4. Übergang von den alten Schlüsselnamen

Supabase hat die Schlüssel umbenannt. Beide Namenspaare funktionieren, die
alten mit einer Warnung im Serverlog:

| veraltet | aktuell |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` |

Die Warnung nennt nur den Variablennamen, nie den Wert. Sind beide Namen
gesetzt, gewinnt der aktuelle; der Wert des jeweils anderen wird nicht
protokolliert und nicht verglichen.

Die veralteten Namen werden gelesen, damit ein bestehendes Deployment nicht
beim Upgrade stehen bleibt. Sie sind ein Übergang, kein zweiter unterstützter
Weg: neue Umgebungen setzen die aktuellen Namen.

---

## 5. Was wo stehen darf

* `SUPABASE_SECRET_KEY` umgeht Row Level Security vollständig. Er wird
  ausschließlich in `src/lib/supabase/service.ts` verwendet (Ingestion) und
  niemals an eine Client-Komponente, eine Server-Action-Antwort oder ein
  Fehlerobjekt übergeben.
* Uploads und Downloads laufen bewusst **mit dem Schlüssel der angemeldeten
  Person**, nicht mit dem Secret Key: so gelten die Storage-Policies auch
  dann, wenn die Anwendung sich irrt.
* Kein Logaufruf gibt einen Variablenwert aus. Die Statusseite unter
  `/administration/infrastructure` zeigt nur „gesetzt" oder „nicht gesetzt".
