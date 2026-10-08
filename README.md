# Pizzarella Wuppertal – Website & Direktbestellung

Neue Website von **Pizzarella**, Friedrich-Engels-Allee 117, 42285 Wuppertal: Speisekarte, Warenkorb, Kasse mit echter Bestellübermittlung (Lieferung oder Abholung), Öffnungszeiten, Rechtliches.

- **Astro 7** (statische Seiten) + **eine Server-Route** `/api/order` (Node, `@astrojs/node`)
- Alle Geschäftsdaten in **validierten JSON-Dateien** unter `src/data/` – eine Quelle für Seiten, Warenkorb, Kasse, Schema.org und Server
- Kein Framework im Browser: kleine TypeScript-Module, Warenkorb in `localStorage`
- Der Server rechnet **jede Bestellung selbst nach** (Preise, Mindestbestellwert, Liefergebiet, Öffnungszeiten) – der Browser kann keine Preise vorgeben

Offene Punkte vor dem Livegang: **[docs/GO-LIVE.md](docs/GO-LIVE.md)**. Herkunft und Prüfstatus der Daten: **[docs/DATENSTATUS.md](docs/DATENSTATUS.md)**.

---

## Lokal starten

Voraussetzung: Node.js **22.12 oder neuer**.

```bash
npm install
npm run dev              # Entwicklungsserver → http://localhost:4321
```

Bestellungen testen, ohne E-Mails zu verschicken:

```bash
ORDER_DEV_SINK=true npm run dev
```

Abgeschickte Bestellungen landen dann als `.json` und `.txt` (Küchenbon) im Ordner `.orders/`.

Produktionsstand lokal ansehen:

```bash
npm run build
ORDER_DEV_SINK=true npm start   # → http://localhost:4321 (PORT/HOST per Umgebungsvariable änderbar)
```

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver mit Live-Reload |
| `npm run build` | prüft die Daten, baut statische Seiten + Server nach `dist/` |
| `npm start` | startet den gebauten Server (`dist/server/entry.mjs`) |
| `npm run data:check` | validiert alle Daten, listet offene Go-Live-Punkte |
| `npm run data:check -- --md` | schreibt den Bericht nach `docs/DATENSTATUS.md` |
| `npm test` | Unit-Tests (Preise, Öffnungszeiten, Bestellprüfung) |
| `npm run check` | TypeScript-/Astro-Prüfung |
| `npm run qa -- <url>` | Browser-QA: 10 Seiten × 11 Breiten, Überlauf, Konsolenfehler, axe, ganzseitige Screenshots |

Weitere QA-Skripte (Server muss laufen, Basis-URL als erstes Argument):

```bash
node scripts/qa/flow.mjs http://localhost:4321 1440   # kompletter Bestellablauf Desktop
node scripts/qa/flow.mjs http://localhost:4321 390    # … mobil
node scripts/qa/keyboard.mjs http://localhost:4321    # Tastaturbedienung
node scripts/qa/states.mjs http://localhost:4321      # reduzierte Bewegung
node scripts/qa/shot.mjs http://localhost:4321/ start.png 390 844 full   # einzelner Screenshot
```

Die QA-Skripte nutzen `playwright-core` mit einem vorhandenen Chromium (`CHROME_PATH` oder `PLAYWRIGHT_BROWSERS_PATH`). Ergebnisse landen in `qa-output/` (nicht im Repo).

---

## Daten pflegen

Alle Inhalte, die sich ändern können, liegen in `src/data/`. Nach jeder Änderung `npm run data:check` ausführen: Tippfehler, unbekannte IDs, fehlende Preise oder unbekannte Allergen-Codes brechen den Build mit einer verständlichen Meldung ab, statt still eine falsche Seite auszuliefern.

| Datei | Inhalt |
|---|---|
| `business.json` | Name, Inhaber, Adresse, Telefon, E-Mail, **Öffnungszeiten**, Ausnahmen (Feiertage/Urlaub) |
| `ordering.json` | Lieferung/Abholung an/aus, **Liefergebiet (PLZ), Mindestbestellwert, Liefergebühr**, Zahlarten, Vorbestellung, „Passt dazu“ |
| `menu/NN-kategorie.json` | eine Datei je Kategorie, Reihenfolge über den Dateinamen |
| `options.json` | Extras/Auswahlen (Zutaten, Dressings, Saucen …) mit Aufpreisen je Größe |
| `allergens.json` | Legende der Allergen- und Zusatzstoff-Kennzeichnung |
| `home.json` | Auswahl auf der Startseite (Hero-Pizzen, Empfehlungen, Beispiel-Bon, Preisvergleich) |
| `reviews.json` | Bewertungen – standardmäßig **ausgeblendet** (`"publish": false`) |
| `promotions.json` | Aktionen – derzeit leer |
| `dish-art.json` | Bilder der Speisekarte: aus welchen Ebenen (Brot, Fleisch, Salat, Sauce …) ein Gericht besteht und wie sie beschriftet sind |

**Preise** werden in Euro mit Punkt geschrieben (`7.9` = 7,90 €) und intern in Cent gerechnet.

### Häufige Änderungen

**Preis ändern** – in der passenden `menu/*.json` beim Produkt:

```json
"prices": { "klein": 6.9, "gross": 7.9 }
```

**Produkt ist gerade aus** – beim Produkt `"available": false` setzen. Es bleibt auf der Karte stehen, ist als „Gerade nicht verfügbar“ markiert und lässt sich nicht bestellen (auch der Server lehnt es ab). **Ganz von der Karte nehmen:** `"hidden": true`.

**Ruhetag/Urlaub** – in `business.json` unter `hours.exceptions`:

```json
"exceptions": [
  { "date": "2026-12-24", "intervals": [], "note": "Heiligabend geschlossen" },
  { "date": "2026-12-31", "intervals": [["16:00", "22:00"]] }
]
```

Öffnungszeiten über Mitternacht werden einfach als `["16:00", "01:00"]` geschrieben. Alle Zeiten gelten in `Europe/Berlin`, unabhängig von der Serverzeit. Bestellschluss ist `lastOrderMinutesBeforeClose` Minuten vor Ladenschluss.

**Online-Bestellung kurzfristig abschalten** – in `ordering.json` `"online": false`. Die Kasse zeigt dann einen Hinweis mit Telefonnummer; die Karte bleibt sichtbar.

**Bild für ein neues Gericht** – Pizzen bekommen ihr Bild automatisch aus der Beschreibung („mit Champignons und Rindersalami“). Für alle anderen Gerichte gibt es derzeit bewusst keine Bilder (werden überarbeitet); das Werkzeug dafür liegt in `scripts/dish-photos/` (echte, frei lizenzierte Fotos, Quellen und Lizenzen in `sources.json` – bei Verwendung Bildnachweise ins Impressum). Die Ebenen und Beschriftungen je Gericht legt `scripts/dish-photos/build.py` fest und schreibt sie nach `dish-art.json`; beschriftet wird nur, was auch in der Beschreibung steht.

```bash
python3 scripts/dish-photos/fetch.py   # Quellfotos laden (einmalig)
python3 scripts/dish-photos/build.py   # alle Gerichte neu bauen
```

Ohne Eintrag erscheint ein Gericht einfach ohne Bild. Voraussetzung: Python 3 mit `opencv-contrib-python-headless` und `numpy`.

**Liefergebiet** – in `ordering.json` unter `deliveryZones`. Mehrere Zonen mit eigenem Mindestbestellwert und eigener Gebühr sind möglich:

```json
{ "name": "Barmen", "zips": ["42275", "42277"], "minOrder": 10, "fee": 0 },
{ "name": "Ronsdorf", "zips": ["42369"], "minOrder": 20, "fee": 1.5 }
```

---

## Bestellungen empfangen

Eine Bestellung läuft so: Browser → `POST /api/order` → Server prüft alles neu (Preise, Öffnungszeit/Zeitfenster, PLZ, Mindestbestellwert, Pflichtauswahlen, Spam-Schutz) → Zustellung an den Laden über **mindestens einen** dieser Kanäle:

| Kanal | Variablen | Ergebnis |
|---|---|---|
| E-Mail (empfohlen) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `ORDER_MAIL_FROM`, `ORDER_MAIL_TO` | Bon als E-Mail an den Laden, optional Kopie an die Kundschaft (`ORDER_MAIL_CUSTOMER_COPY`) |
| Webhook | `ORDER_WEBHOOK_URL`, `ORDER_WEBHOOK_SECRET` | JSON-POST, signiert per HMAC-SHA256 im Header `x-pizzarella-signature` – z. B. für Bon-Drucker, n8n, Telegram |
| Entwicklung | `ORDER_DEV_SINK=true` | Dateien in `.orders/` – **nicht für den Livebetrieb** |

Ist **kein** Kanal konfiguriert, nimmt die Kasse ehrlich keine Bestellungen an und verweist auf das Telefon. Es gibt keinen Zustand, in dem eine Bestellung angenommen, aber nirgends zugestellt wird: schlägt jeder Kanal fehl, bekommt die Kundschaft eine Fehlermeldung mit Telefonnummer.

Alle Variablen sind in [`.env.example`](.env.example) erklärt. Zum Einrichten `.env.example` nach `.env` kopieren und ausfüllen (`.env` wird nicht ins Repo übernommen).

---

## Veröffentlichen

Die Seiten sind statisch, aber die Bestellung braucht einen **laufenden Node-Prozess**. Geeignet ist jeder Server oder Dienst, der eine Node-Anwendung dauerhaft betreiben kann (eigener Server/VPS, Node-fähiges Hosting, Container-Plattform).

```bash
npm ci
npm run build
# Umgebungsvariablen setzen (SITE_URL, SMTP_… bzw. ORDER_WEBHOOK_…)
PORT=4321 HOST=0.0.0.0 npm start
```

- Davor gehört ein Webserver/Proxy mit HTTPS (z. B. nginx, Caddy oder der Proxy des Hosters).
- `dist/client/` enthält alle statischen Dateien; der Node-Server liefert sie mit aus, ein vorgeschalteter Webserver darf sie auch direkt ausliefern.
- Die Anfragebegrenzung für `/api/order` (6 Bestellungen je 10 Minuten und IP) liegt im Arbeitsspeicher. Bei mehreren Instanzen gilt sie je Instanz.

**Hinweis zum bisherigen Hosting:** Die alte Seite läuft als WordPress auf klassischem Shared-Hosting. Solche Tarife führen in der Regel keine dauerhaften Node-Prozesse aus. Entweder zieht die Seite auf ein Node-fähiges Hosting um, oder der Tarif wird vorher auf Node-Unterstützung geprüft.

**Weiterleitungen:** Alte Adressen (`/pizza`, `/doener`, `/drinks`, `/insalatone`, `/warenkorb` …) leiten per 301 auf die passenden Anker der neuen Speisekarte weiter (siehe `astro.config.mjs`), damit Google-Treffer und Lesezeichen weiter funktionieren.

---

## Aufbau

```
src/
  data/            JSON-Daten + zod-Schema (schema.ts) + Querverweis-Prüfung (load.ts)
  lib/             gemeinsame Logik für Build, Browser und Server
    catalog.ts     Produkte normalisieren, Optionen je Größe, Client-Katalog
    pricing.ts     Zeilenpreise, Summen, Mindestbestellwert, Liefergebühr
    hours.ts       Öffnungsstatus, Bestellschluss, Vorbestell-Zeitfenster (Europe/Berlin)
    seo.ts         Schema.org (Restaurant, Menu, Breadcrumb)
    server/        Bestellprüfung (order.ts) und Zustellung (dispatch.ts)
  pages/           Seiten + api/order.ts + robots.txt
  components/      Header, Footer, Sheets (Warenkorb/Produkt/Menü), Startseiten-Blöcke
  scripts/         Browser-Module (Warenkorb, Speisekarte, Kasse, UI)
  styles/          global.css (Tokens, Grundelemente), components.css
scripts/
  data-report.ts   Datenprüfung + Go-Live-Liste
  import/          einmaliger Import der alten Speisekarte
  qa/              Browser-Tests (Playwright)
  gen-pizza.mjs …  Erzeugung der Hero-Pizza, Favicons, OG-Bild
docs/
  quelle-alte-website/   gesicherte Originaldaten (eigene Website + Lieferando-Shop)
```

Der Browser bekommt die Karte als JSON-Datenblock (`#site-data`) mit; Preise rechnet er mit derselben `pricing.ts` wie der Server. Verbindlich ist immer die Berechnung des Servers.

## Datenschutz-relevante Technik

- Keine Cookies, kein Tracking, keine externen Schriften oder Skripte. Schriften liegen unter `public/fonts/`.
- Der Warenkorb liegt nur im `localStorage` des Browsers (`pizzarella.cart.v1`).
- Google Maps wird **nicht eingebettet**, sondern nur verlinkt.
- Bestelldaten werden nicht in einer Datenbank gespeichert, sondern nur über die konfigurierten Kanäle zugestellt.
