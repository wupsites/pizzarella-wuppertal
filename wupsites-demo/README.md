# Pizzarella Wuppertal als Demo im WupSites-Vertriebsportal

Dieser Ordner macht die fertige Website zu einer eigenständigen, geschützten Demo-Instanz. Gebaut wird **exakt dieselbe Website** aus diesem Repo, keine Kopie und kein Template. Am Website-Code ändert sich nichts.

| Datei | Zweck |
|---|---|
| `Dockerfile` | baut die Website und startet den Node-Server (Port 4321); Bestellungen werden nur im Container abgelegt |
| `Dockerfile.dockerignore` | sorgt dafür, dass nur Quellcode ins Image kommt, keine `.env`, Testbestellungen oder `node_modules` |
| `compose.yaml` + `Caddyfile` | kompletter Demo-Stack: Website und davor ein Zugangsschutz mit Passwort, noindex, Einbett-Regel und automatischem HTTPS |
| `demo.env.example` | Vorlage für `wupsites-demo/.env` (wird nie eingecheckt) |
| `manifest.json` | Daten für die Projektkarte im Portal: Funktionen mit Prüfstatus, Vorschaubilder, Verkaufsargumente, Voraussetzungen |
| `preview/` | 8 Vorschaubilder (Desktop und Handy) |
| `INTEGRATION-PROMPT.md` | Auftrag für das Portal-Projekt |

---

## 1. Schnelltest lokal

```bash
docker build -f wupsites-demo/Dockerfile -t pizzarella-demo .
docker run -d -p 4321:4321 --name pizzarella-demo pizzarella-demo
# → http://localhost:4321
```

Ist Docker Hub gerade überlastet (Fehler 429), nimm einen Spiegel für das Basis-Image:
`--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim`

## 2. Demo-Instanz mit Zugangsschutz (Server)

Voraussetzung ist ein Server mit Docker. Eine Domain oder Subdomain (`DEMO_DOMAIN`) zeigt per DNS auf ihn, und die Ports 80 und 443 sind frei.

```bash
git clone https://github.com/wupsites/pizzarella-wuppertal.git
cd pizzarella-wuppertal
git checkout hero-pizza-reference          # oder fest auf den freigegebenen Commit
cp wupsites-demo/demo.env.example wupsites-demo/.env
docker run --rm caddy:2 caddy hash-password --plaintext 'PASSWORT'   # Hash in .env eintragen, in '…'
docker compose -f wupsites-demo/compose.yaml --env-file wupsites-demo/.env up -d --build
```

Caddy holt das HTTPS-Zertifikat selbst. Danach ist die Demo unter `https://<DEMO_DOMAIN>` erreichbar, nur mit Zugangsdaten.

**Container-Hoster statt eigener Server:** Dockerfile-Pfad `wupsites-demo/Dockerfile`, Build-Kontext ist die Repo-Wurzel, Port 4321. Den Zugangsschutz und den Header `X-Robots-Tag: noindex` muss dann der Hoster oder ein vorgeschalteter Proxy übernehmen.

**Wichtig:** Die Seite muss an der Wurzel einer eigenen (Sub-)Domain laufen. Alle Pfade beginnen mit `/`, deshalb funktioniert ein Unterpfad wie `portal…/demos/pizzarella/` nicht ohne Codeänderung.

## 3. Was in der Demo anders ist als bei der echten Seite

- **Bestellungen gehen nirgendwohin.** `ORDER_DEV_SINK=true` legt sie nur im Container unter `.orders/` ab. Bei einem Neustart sind sie weg. In der Präsentation also nur Testdaten eingeben.
- **Keine Bestellkanäle setzen.** `SMTP_*`, `ORDER_MAIL_*` und `ORDER_WEBHOOK_*` sind in der Demo verboten, sonst würden Bestellungen beim echten Laden ankommen.
- **`SITE_URL` nicht setzen.** Dann ist die gebaute Seite Byte für Byte das Original.
- **Passwortschutz und noindex** setzt der Caddy davor. Einbetten ist verboten, außer `PORTAL_ORIGIN` ist gesetzt.

## 4. Öffnungszeiten beachten

Die Kasse folgt den echten Öffnungszeiten: Mo, Di und Do 16–01 Uhr, Fr und Sa 16–02 Uhr, So 14–24 Uhr, Mittwoch Ruhetag. Bestellschluss ist 15 Minuten vor Ladenschluss. Außerhalb der Zeiten geht nur eine Vorbestellung über „Zu einer Wunschzeit“. Am Ruhetag-Nachmittag gibt es noch keine Zeitfenster.

| Testzeit (28.10.2026) | Sofort bestellen | Vorbestellung |
|---|---|---|
| Do 10:00 | nein | ab 16:30 Uhr |
| Do 19:30 | ja | ab 20:00 Uhr |
| Mi 14:50 (Ruhetag) | nein | keine |
| Mi 19:30 (Ruhetag) | nein | ab morgen 16:30 Uhr |
| Fr 01:30 | nein | ab 16:30 Uhr |

## 5. Prüfliste nach dem Deployment

- [ ] `https://<DEMO_DOMAIN>/` ohne Zugangsdaten → 401, mit Zugangsdaten → Startseite
- [ ] Antwort-Header enthält `X-Robots-Tag: noindex, nofollow, noarchive`
- [ ] 3D-Pizza erscheint nach 1–2 Sekunden, dreht sich beim Scrollen
- [ ] Speisekarte zeigt 118 Gerichte, der Pizza-Ersteller öffnet sich
- [ ] Testbestellung (innerhalb der Öffnungszeit oder als Wunschzeit) endet mit Bestellnummer
- [ ] Am iPhone öffnen und einmal durchscrollen: Flüssigkeit beurteilen

## 6. Getestet am 28.10.2026

- Image aus genau diesem Dockerfile gebaut. Für den Test wurden nur das Proxy-Zertifikat der Testumgebung und ein Image-Spiegel ergänzt.
- Prüfsumme über alle 80 Dateien der gebauten Website im Image identisch mit dem Original-Build.
- Alle Seiten (200), 404-Seite, Weiterleitung alter URLs (301), Healthcheck „healthy“.
- Kompletter Bestellablauf am Desktop im Container, Bestellung Nr. 2910-852 nur im Container abgelegt.
- Stack mit Caddy: 401 ohne und mit falschem Passwort, 200 mit Passwort; Header noindex, `frame-ancestors 'none'`, nosniff, Referrer-Policy.
- Durch den Zugangsschutz: WebGL-Hero aktiv auf Desktop und Handy, 118 Gerichte, Konsole ohne Fehler.
- **Nicht getestet:** echte Geräte (iPhone/Mac Safari), echtes HTTPS-Zertifikat (lokal ohne Domain getestet), E-Mail- und Webhook-Zustellung.
